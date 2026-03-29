'use client'

import Link from 'next/link'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { BarChart3, Search, Sparkles } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { usePrices } from '@/lib/dataCore'
import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyTrade,
  type SellPlanLevelForFill,
  type SellTrade,
} from '@/lib/planner'
import { fmtCurrency } from '@/lib/format'

type ReportScope = 'all' | 'buy' | 'sell'
type ReportKind = 'pending-capital' | 'triggered-capital' | 'unsupported'

type TradeRow = {
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  buy_planner_id: string | null
  sell_planner_id: string | null
}

type BuyPlannerRow = {
  id: string
  coingecko_id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: number | null
  growth_per_level: number | null
  is_active: boolean | null
}

type SellPlannerRow = {
  id: string
  coingecko_id: string
  is_active: boolean
}

type SellLevelRow = {
  level: number
  price: number | null
  sell_tokens: number | null
  sell_planner_id: string
  coingecko_id: string
}

type CoinMeta = {
  coingecko_id: string
  symbol: string | null
  name: string | null
}

type BuyPlannerMetrics = {
  coinId: string
  plannerId: string
  pendingUsd: number
  pendingTokens: number
  pendingLevels: number
  triggeredUsd: number
  triggeredTokens: number
  triggeredLevels: number
}

type SellPlannerMetrics = {
  coinId: string
  plannerId: string
  pendingUsd: number
  pendingTokens: number
  pendingLevels: number
  triggeredUsd: number
  triggeredTokens: number
  triggeredLevels: number
}

type AssetMetrics = {
  coinId: string
  label: string
  symbol: string
  pendingBuyUsd: number
  pendingSellUsd: number
  triggeredBuyUsd: number
  triggeredBuyTokens: number
  triggeredSellUsd: number
  triggeredSellTokens: number
  buyPlannerCount: number
  sellPlannerCount: number
}

const STARTER_QUERIES = [
  'How much total capital needs to be used to fill all triggered buys?',
  'How much total capital needs to be used to fill all triggered sells?',
  'How much total capital needs to be used to fill all triggered buys and sells?',
  'How much pending investment do I have across all pending buys and sells?',
]

const BUY_ALERT_MULT = 1.015
const SELL_ALERT_MULT = 0.985
const BUY_FULL_EPS = 1e-8
const SELL_FULL_PCT = 0.97
const SELL_TOLERANCE = 0.0005

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function humanizeCoinId(coinId: string): string {
  return coinId
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseReportQuery(value: string): { kind: ReportKind; scope: ReportScope } {
  const q = normalizeQuery(value)
  if (!q) return { kind: 'triggered-capital', scope: 'all' }

  const mentionsBuy = q.includes('buy') || q.includes('buys')
  const mentionsSell = q.includes('sell') || q.includes('sells')

  const mentionsTriggered =
    q.includes('triggered') ||
    q.includes('actionable') ||
    q.includes('alert') ||
    q.includes('alerted') ||
    q.includes('yellow') ||
    q.includes('touched')

  const mentionsPending =
    q.includes('pending') ||
    q.includes('remaining') ||
    q.includes('unfilled') ||
    q.includes('left') ||
    q.includes('open')

  const mentionsCapital =
    q.includes('capital') ||
    q.includes('investment') ||
    q.includes('investments') ||
    q.includes('amount') ||
    q.includes('notional') ||
    q.includes('exposure') ||
    q.includes('fill') ||
    q.includes('fills')

  if (mentionsTriggered && (mentionsCapital || mentionsBuy || mentionsSell)) {
    if (mentionsBuy && !mentionsSell) return { kind: 'triggered-capital', scope: 'buy' }
    if (mentionsSell && !mentionsBuy) return { kind: 'triggered-capital', scope: 'sell' }
    return { kind: 'triggered-capital', scope: 'all' }
  }

  if (mentionsPending && (mentionsCapital || mentionsBuy || mentionsSell)) {
    if (mentionsBuy && !mentionsSell) return { kind: 'pending-capital', scope: 'buy' }
    if (mentionsSell && !mentionsBuy) return { kind: 'pending-capital', scope: 'sell' }
    return { kind: 'pending-capital', scope: 'all' }
  }

  return { kind: 'unsupported', scope: 'all' }
}

function SectionCard(props: {
  title: string
  description: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-[rgb(28,29,31)] ring-1 ring-inset ring-[rgb(41,42,45)]/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <div className="border-b border-[rgb(41,42,45)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.00))] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[15px] font-medium text-slate-100">{props.title}</div>
            <p className="mt-1 text-[13px] text-[rgb(163,163,164)]">{props.description}</p>
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
      </div>
      <div className="p-4 md:p-5">{props.children}</div>
    </section>
  )
}

function StatCard(props: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-2xl bg-[rgb(28,29,31)] p-4 md:p-5 ring-1 ring-inset ring-[rgb(41,42,45)]/70 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[rgb(140,140,142)]">{props.label}</div>
      <div className="mt-2 text-[22px] md:text-[24px] font-semibold tabular-nums text-slate-100">{props.value}</div>
      <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">{props.sub}</div>
    </div>
  )
}

export default function ReportsPage() {
  const { user, loading: userLoading } = useUser()
  const [draftQuery, setDraftQuery] = useState(STARTER_QUERIES[2])
  const [submittedQuery, setSubmittedQuery] = useState(STARTER_QUERIES[2])

  const parsed = useMemo(() => parseReportQuery(submittedQuery), [submittedQuery])

  const { data: buyPlanners, isLoading: buyLoading } = useSWR<BuyPlannerRow[]>(
    user ? ['/reports/buy-planners', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select('id,coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,is_active')
        .eq('user_id', user!.id)
        .eq('is_active', true)

      if (error) throw error

      return (data ?? []).map((row) => ({
        id: row.id,
        coingecko_id: row.coingecko_id,
        top_price: row.top_price != null ? Number(row.top_price) : null,
        budget_usd: row.budget_usd != null ? Number(row.budget_usd) : null,
        total_budget: row.total_budget != null ? Number(row.total_budget) : null,
        ladder_depth: row.ladder_depth != null ? Number(row.ladder_depth) : null,
        growth_per_level: row.growth_per_level != null ? Number(row.growth_per_level) : null,
        is_active: row.is_active,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  )

  const { data: sellPlanners, isLoading: sellPlannerLoading } = useSWR<SellPlannerRow[]>(
    user ? ['/reports/sell-planners', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,is_active')
        .eq('user_id', user!.id)
        .eq('is_active', true)

      if (error) throw error

      return (data ?? []) as SellPlannerRow[]
    },
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  )

  const activeSellPlannerIds = useMemo(
    () => Array.from(new Set((sellPlanners ?? []).map((planner) => planner.id))),
    [sellPlanners]
  )

  const { data: sellLevels, isLoading: sellLevelsLoading } = useSWR<SellLevelRow[]>(
    user && activeSellPlannerIds.length > 0 ? ['/reports/sell-levels', user.id, activeSellPlannerIds.join(',')] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,price,sell_tokens,sell_planner_id,coingecko_id')
        .eq('user_id', user!.id)
        .in('sell_planner_id', activeSellPlannerIds)
        .order('sell_planner_id', { ascending: true })
        .order('level', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row) => ({
        level: Number(row.level),
        price: row.price != null ? Number(row.price) : null,
        sell_tokens: row.sell_tokens != null ? Number(row.sell_tokens) : null,
        sell_planner_id: row.sell_planner_id,
        coingecko_id: row.coingecko_id,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  )

  const { data: trades, isLoading: tradesLoading } = useSWR<TradeRow[]>(
    user ? ['/reports/trades', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id')
        .eq('user_id', user!.id)
        .order('trade_time', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row) => ({
        coingecko_id: row.coingecko_id,
        side: row.side,
        price: Number(row.price),
        quantity: Number(row.quantity),
        fee: row.fee != null ? Number(row.fee) : 0,
        trade_time: row.trade_time,
        buy_planner_id: row.buy_planner_id ?? null,
        sell_planner_id: row.sell_planner_id ?? null,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  )

  const reportCoinIds = useMemo(() => {
    const ids = new Set<string>()
    ;(buyPlanners ?? []).forEach((row) => ids.add(row.coingecko_id))
    ;(sellPlanners ?? []).forEach((row) => ids.add(row.coingecko_id))
    return Array.from(ids)
  }, [buyPlanners, sellPlanners])

  const { rows: priceRows } = usePrices(reportCoinIds, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  })

  const priceMap = useMemo(() => {
    const map = new Map<string, number>()
    priceRows.forEach((row) => {
      if (row.price != null && Number.isFinite(Number(row.price))) {
        map.set(row.id, Number(row.price))
      }
    })
    return map
  }, [priceRows])

  const { data: coinMeta } = useSWR<CoinMeta[]>(
    reportCoinIds.length > 0 ? ['/reports/coin-meta', reportCoinIds.slice().sort().join(',')] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('coins')
        .select('coingecko_id,symbol,name')
        .in('coingecko_id', reportCoinIds)

      if (error) throw error
      return (data ?? []) as CoinMeta[]
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const coinMetaMap = useMemo(() => {
    const map = new Map<string, CoinMeta>()
    ;(coinMeta ?? []).forEach((row) => map.set(row.coingecko_id, row))
    return map
  }, [coinMeta])

  const buyTradesByPlanner = useMemo(() => {
    const map = new Map<string, BuyTrade[]>()
    ;(trades ?? []).forEach((trade) => {
      if (trade.side !== 'buy' || !trade.buy_planner_id) return
      const current = map.get(trade.buy_planner_id) ?? []
      current.push({
        price: trade.price,
        quantity: trade.quantity,
        fee: trade.fee,
        trade_time: trade.trade_time,
      })
      map.set(trade.buy_planner_id, current)
    })
    return map
  }, [trades])

  const sellTradesByPlanner = useMemo(() => {
    const map = new Map<string, SellTrade[]>()
    ;(trades ?? []).forEach((trade) => {
      if (trade.side !== 'sell' || !trade.sell_planner_id) return
      const current = map.get(trade.sell_planner_id) ?? []
      current.push({
        price: trade.price,
        quantity: trade.quantity,
        fee: trade.fee,
        trade_time: trade.trade_time,
      })
      map.set(trade.sell_planner_id, current)
    })
    return map
  }, [trades])

  const sellLevelsByPlanner = useMemo(() => {
    const map = new Map<string, SellPlanLevelForFill[]>()
    ;(sellLevels ?? []).forEach((row) => {
      const current = map.get(row.sell_planner_id) ?? []
      current.push({
        target_price: Math.max(0, toNumber(row.price)),
        planned_tokens: Math.max(0, toNumber(row.sell_tokens)),
      })
      map.set(row.sell_planner_id, current)
    })
    return map
  }, [sellLevels])

  const buyMetrics = useMemo<BuyPlannerMetrics[]>(() => {
    return (buyPlanners ?? []).map((planner) => {
      const topPrice = toNumber(planner.top_price)
      const budget = toNumber(planner.budget_usd ?? planner.total_budget)
      const depthRaw = toNumber(planner.ladder_depth) || 70
      const ladderDepth = depthRaw === 75 ? 75 : depthRaw === 90 ? 90 : 70
      const growth = toNumber(planner.growth_per_level) || 1.25
      const levels = buildBuyLevels(topPrice, budget, ladderDepth, growth)
      const fill = computeBuyFills(levels, buyTradesByPlanner.get(planner.id) ?? [])
      const livePrice = priceMap.get(planner.coingecko_id) ?? null
      const hasLive = livePrice != null && livePrice > 0

      let pendingUsd = 0
      let pendingTokens = 0
      let pendingLevels = 0
      let triggeredUsd = 0
      let triggeredTokens = 0
      let triggeredLevels = 0

      levels.forEach((level, index) => {
        const plannedUsd = Number(level.allocation ?? 0)
        const filledUsd = Number(fill.allocatedUsd[index] ?? 0)
        const missingUsd = Math.max(0, plannedUsd - filledUsd)
        const levelPrice = Number(level.price ?? 0)
        const missingTokens = levelPrice > 0 ? missingUsd / levelPrice : 0
        const full = plannedUsd > 0 && missingUsd <= plannedUsd * 0.02 + BUY_FULL_EPS
        const yellow = !full && hasLive && levelPrice > 0 && livePrice <= levelPrice * BUY_ALERT_MULT

        if (missingUsd > BUY_FULL_EPS) {
          pendingUsd += missingUsd
          pendingTokens += missingTokens
          pendingLevels += 1
        }

        if (yellow && missingUsd > BUY_FULL_EPS) {
          triggeredUsd += missingUsd
          triggeredTokens += missingTokens
          triggeredLevels += 1
        }
      })

      return {
        coinId: planner.coingecko_id,
        plannerId: planner.id,
        pendingUsd: Number(pendingUsd.toFixed(2)),
        pendingTokens: Number(pendingTokens.toFixed(8)),
        pendingLevels,
        triggeredUsd: Number(triggeredUsd.toFixed(2)),
        triggeredTokens: Number(triggeredTokens.toFixed(8)),
        triggeredLevels,
      }
    })
  }, [buyPlanners, buyTradesByPlanner, priceMap])

  const sellMetrics = useMemo<SellPlannerMetrics[]>(() => {
    return (sellPlanners ?? []).map((planner) => {
      const levels = sellLevelsByPlanner.get(planner.id) ?? []
      const fill = computeSellFills(levels, sellTradesByPlanner.get(planner.id) ?? [], SELL_TOLERANCE)
      const livePrice = priceMap.get(planner.coingecko_id) ?? null
      const hasLive = livePrice != null && livePrice > 0

      let pendingUsd = 0
      let pendingTokens = 0
      let pendingLevels = 0
      let triggeredUsd = 0
      let triggeredTokens = 0
      let triggeredLevels = 0

      levels.forEach((level, index) => {
        const filledTokens = Number(fill.allocatedTokens[index] ?? 0)
        const missingTokens = Math.max(0, level.planned_tokens - filledTokens)
        const missingUsd = missingTokens * level.target_price
        const pct = level.planned_tokens > 0 ? Math.min(1, filledTokens / level.planned_tokens) : 0
        const green = pct >= SELL_FULL_PCT
        const yellow = !green && hasLive && level.target_price > 0 && livePrice >= level.target_price * SELL_ALERT_MULT

        if (missingTokens > 1e-8) {
          pendingUsd += missingUsd
          pendingTokens += missingTokens
          pendingLevels += 1
        }

        if (yellow && missingTokens > 1e-8) {
          triggeredUsd += missingUsd
          triggeredTokens += missingTokens
          triggeredLevels += 1
        }
      })

      return {
        coinId: planner.coingecko_id,
        plannerId: planner.id,
        pendingUsd: Number(pendingUsd.toFixed(2)),
        pendingTokens: Number(pendingTokens.toFixed(8)),
        pendingLevels,
        triggeredUsd: Number(triggeredUsd.toFixed(2)),
        triggeredTokens: Number(triggeredTokens.toFixed(8)),
        triggeredLevels,
      }
    })
  }, [sellPlanners, sellLevelsByPlanner, sellTradesByPlanner, priceMap])

  const assetRows = useMemo<AssetMetrics[]>(() => {
    const map = new Map<string, AssetMetrics>()

    const ensure = (coinId: string) => {
      const existing = map.get(coinId)
      if (existing) return existing
      const meta = coinMetaMap.get(coinId)
      const row: AssetMetrics = {
        coinId,
        label: meta?.name?.trim() || humanizeCoinId(coinId),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        pendingBuyUsd: 0,
        pendingSellUsd: 0,
        triggeredBuyUsd: 0,
        triggeredBuyTokens: 0,
        triggeredSellUsd: 0,
        triggeredSellTokens: 0,
        buyPlannerCount: 0,
        sellPlannerCount: 0,
      }
      map.set(coinId, row)
      return row
    }

    buyMetrics.forEach((row) => {
      const asset = ensure(row.coinId)
      asset.pendingBuyUsd += row.pendingUsd
      asset.triggeredBuyUsd += row.triggeredUsd
      asset.triggeredBuyTokens += row.triggeredTokens
      asset.buyPlannerCount += 1
    })

    sellMetrics.forEach((row) => {
      const asset = ensure(row.coinId)
      asset.pendingSellUsd += row.pendingUsd
      asset.triggeredSellUsd += row.triggeredUsd
      asset.triggeredSellTokens += row.triggeredTokens
      asset.sellPlannerCount += 1
    })

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        pendingBuyUsd: Number(row.pendingBuyUsd.toFixed(2)),
        pendingSellUsd: Number(row.pendingSellUsd.toFixed(2)),
        triggeredBuyUsd: Number(row.triggeredBuyUsd.toFixed(2)),
        triggeredBuyTokens: Number(row.triggeredBuyTokens.toFixed(8)),
        triggeredSellUsd: Number(row.triggeredSellUsd.toFixed(2)),
        triggeredSellTokens: Number(row.triggeredSellTokens.toFixed(8)),
      }))
      .sort((a, b) => {
        const aWeight = a.triggeredBuyUsd + a.triggeredSellUsd + a.pendingBuyUsd + a.pendingSellUsd
        const bWeight = b.triggeredBuyUsd + b.triggeredSellUsd + b.pendingBuyUsd + b.pendingSellUsd
        return bWeight - aWeight
      })
  }, [buyMetrics, sellMetrics, coinMetaMap])

  const totals = useMemo(() => {
    const pendingBuyUsd = buyMetrics.reduce((sum, row) => sum + row.pendingUsd, 0)
    const pendingSellUsd = sellMetrics.reduce((sum, row) => sum + row.pendingUsd, 0)
    const triggeredBuyUsd = buyMetrics.reduce((sum, row) => sum + row.triggeredUsd, 0)
    const triggeredSellUsd = sellMetrics.reduce((sum, row) => sum + row.triggeredUsd, 0)
    const triggeredBuyTokens = buyMetrics.reduce((sum, row) => sum + row.triggeredTokens, 0)
    const triggeredSellTokens = sellMetrics.reduce((sum, row) => sum + row.triggeredTokens, 0)

    return {
      pendingBuyUsd: Number(pendingBuyUsd.toFixed(2)),
      pendingSellUsd: Number(pendingSellUsd.toFixed(2)),
      pendingCombinedUsd: Number((pendingBuyUsd + pendingSellUsd).toFixed(2)),
      triggeredBuyUsd: Number(triggeredBuyUsd.toFixed(2)),
      triggeredSellUsd: Number(triggeredSellUsd.toFixed(2)),
      triggeredCombinedUsd: Number((triggeredBuyUsd + triggeredSellUsd).toFixed(2)),
      triggeredBuyTokens: Number(triggeredBuyTokens.toFixed(8)),
      triggeredSellTokens: Number(triggeredSellTokens.toFixed(8)),
      activeBuyPlanners: buyMetrics.length,
      activeSellPlanners: sellMetrics.length,
      assets: assetRows.length,
    }
  }, [buyMetrics, sellMetrics, assetRows.length])

  const tableRows = useMemo(() => {
    if (parsed.kind === 'triggered-capital') {
      if (parsed.scope === 'buy') {
        return assetRows
          .filter((row) => row.triggeredBuyUsd > 0)
          .sort((a, b) => b.triggeredBuyUsd - a.triggeredBuyUsd)
      }
      if (parsed.scope === 'sell') {
        return assetRows
          .filter((row) => row.triggeredSellUsd > 0 || row.triggeredSellTokens > 0)
          .sort((a, b) => b.triggeredSellUsd - a.triggeredSellUsd)
      }
      return assetRows
        .filter((row) => row.triggeredBuyUsd > 0 || row.triggeredSellUsd > 0)
        .sort((a, b) => b.triggeredBuyUsd + b.triggeredSellUsd - (a.triggeredBuyUsd + a.triggeredSellUsd))
    }

    if (parsed.scope === 'buy') {
      return assetRows
        .filter((row) => row.pendingBuyUsd > 0)
        .sort((a, b) => b.pendingBuyUsd - a.pendingBuyUsd)
    }
    if (parsed.scope === 'sell') {
      return assetRows
        .filter((row) => row.pendingSellUsd > 0)
        .sort((a, b) => b.pendingSellUsd - a.pendingSellUsd)
    }
    return assetRows
      .filter((row) => row.pendingBuyUsd > 0 || row.pendingSellUsd > 0)
      .sort((a, b) => b.pendingBuyUsd + b.pendingSellUsd - (a.pendingBuyUsd + a.pendingSellUsd))
  }, [assetRows, parsed.kind, parsed.scope])

  const isLoading = userLoading || buyLoading || sellPlannerLoading || sellLevelsLoading || tradesLoading

  const summary =
    parsed.kind === 'triggered-capital'
      ? parsed.scope === 'buy'
        ? `Triggered buy rows currently need ${fmtCurrency(totals.triggeredBuyUsd)} to complete.`
        : parsed.scope === 'sell'
          ? `Triggered sell rows currently represent ${fmtCurrency(totals.triggeredSellUsd)} of sell notional still open.`
          : `Triggered buy and sell rows currently represent ${fmtCurrency(totals.triggeredCombinedUsd)} of total actionable capital/notional.`
      : parsed.scope === 'buy'
        ? `Open buy planners still have ${fmtCurrency(totals.pendingBuyUsd)} left to deploy.`
        : parsed.scope === 'sell'
          ? `Open sell planners still have ${fmtCurrency(totals.pendingSellUsd)} of target sell notional left.`
          : `Open buy and sell planners still have ${fmtCurrency(totals.pendingCombinedUsd)} pending in total.`

  const methodology =
    parsed.kind === 'triggered-capital'
      ? parsed.scope === 'buy'
        ? 'Triggered buys use the same yellow-row rule as the Buy Planner: row not ~full and live price <= target price × 1.015. Capital needed = remaining USD on those yellow rows.'
        : parsed.scope === 'sell'
          ? 'Triggered sells use the same yellow-row rule as the Sell Planner: row not green and live price >= target price × 0.985. Capital shown here is remaining planned sell notional on those yellow rows.'
          : 'Triggered totals reuse the same yellow-row rules as the planner UI for both buys and sells, then sum the remaining USD/notional on those currently actionable rows.'
      : parsed.scope === 'buy'
        ? 'Pending buy capital = total remaining USD across all unfilled active buy ladder rows, regardless of whether the row is triggered yet.'
        : parsed.scope === 'sell'
          ? 'Pending sell capital = total remaining planned sell notional across all unfilled active sell ladder rows.'
          : 'Pending totals sum all remaining buy ladder USD plus all remaining sell planner notional, whether currently triggered or not.'

  function submitQuery(nextQuery: string) {
    setDraftQuery(nextQuery)
    setSubmittedQuery(nextQuery)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedQuery(draftQuery.trim() || STARTER_QUERIES[2])
  }

  if (!userLoading && !user) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 md:px-8 md:py-8 lg:px-10">
        <div className="space-y-2 border-b border-[rgb(41,42,45)]/80 pb-3">
          <h1 className="text-[20px] font-semibold text-white/90 md:text-[22px]">Reports</h1>
          <p className="text-[13px] text-[rgb(163,163,164)] md:text-[14px]">
            Ask for a report in plain English and LedgerOne will build the matching planner analytics view.
          </p>
        </div>

        <SectionCard
          title="Sign in required"
          description="Reports use your private planner and trade data."
          right={<BarChart3 className="h-4 w-4 text-slate-400" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Sign in to run report queries against your portfolio and planner data.</p>
            <Link
              href="/auth"
              className="inline-flex items-center rounded-md bg-[rgb(136,128,213)] px-3 py-2 text-sm font-medium text-slate-950 transition hover:opacity-90"
            >
              Go to sign in
            </Link>
          </div>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 md:px-8 md:py-8 lg:px-10">
      <div className="space-y-2">
        <div className="flex flex-col gap-3 border-b border-[rgb(41,42,45)]/80 pb-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold leading-tight text-white/90 md:text-[22px]">Reports</h1>
              <span className="rounded-full border border-[rgb(60,61,65)] bg-[rgb(28,29,31)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(163,163,164)]">
                Beta
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[rgb(163,163,164)] md:text-[14px]">
              Ask for a report in plain English. This version supports pending capital and triggered yellow-row capital across active buy and sell planners.
            </p>
          </div>
        </div>
      </div>

      <SectionCard
        title="Report query"
        description="Type the report you want, or start from one of the supported examples below."
        right={<Sparkles className="h-4 w-4 text-slate-400" />}
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="sr-only" htmlFor="report-query">Report query</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(140,140,142)]" />
              <input
                id="report-query"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="How much total capital needs to be used to fill all triggered buys and sells?"
                className="h-11 w-full rounded-xl border border-[rgb(60,61,65)] bg-[rgb(32,33,35)] pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-[rgb(122,122,124)] focus:border-[rgba(136,128,213,0.8)]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[rgb(136,128,213)] px-4 text-sm font-medium text-slate-950 transition hover:opacity-90"
            >
              Run report
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {STARTER_QUERIES.map((query) => {
              const active = query === submittedQuery
              return (
                <button
                  key={query}
                  type="button"
                  onClick={() => submitQuery(query)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-[12px] transition',
                    active
                      ? 'border-[rgba(136,128,213,0.7)] bg-[rgba(136,128,213,0.14)] text-slate-100'
                      : 'border-[rgb(60,61,65)] bg-[rgb(28,29,31)] text-[rgb(163,163,164)] hover:text-slate-100',
                  ].join(' ')}
                >
                  {query}
                </button>
              )
            })}
          </div>

          <div className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2 text-[12px] text-[rgb(163,163,164)]">
            Supported today: <span className="text-slate-100">triggered buy capital</span>, <span className="text-slate-100">triggered sell capital</span>, <span className="text-slate-100">combined triggered capital</span>, and <span className="text-slate-100">pending planner capital</span>.
          </div>
        </form>
      </SectionCard>

      {parsed.kind === 'unsupported' ? (
        <SectionCard
          title="Query not supported yet"
          description="The current parser did not find a supported planner-capital report in your query."
        >
          <div className="space-y-3 text-sm text-slate-300">
            <p>Try one of these examples:</p>
            <ul className="list-disc space-y-1 pl-5 text-[rgb(163,163,164)]">
              {STARTER_QUERIES.map((query) => (
                <li key={query}>{query}</li>
              ))}
            </ul>
          </div>
        </SectionCard>
      ) : isLoading ? (
        <SectionCard title="Running report" description="Loading your active planners, fills, and live prices.">
          <div className="text-sm text-slate-400">Loading report data…</div>
        </SectionCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {parsed.scope !== 'sell' ? (
              <StatCard
                label={parsed.kind === 'triggered-capital' ? 'Triggered buy capital' : 'Pending buy capital'}
                value={fmtCurrency(parsed.kind === 'triggered-capital' ? totals.triggeredBuyUsd : totals.pendingBuyUsd)}
                sub={
                  parsed.kind === 'triggered-capital'
                    ? `${totals.triggeredBuyTokens.toFixed(6)} coins across currently yellow buy rows`
                    : `${totals.activeBuyPlanners} active buy planner${totals.activeBuyPlanners === 1 ? '' : 's'}`
                }
              />
            ) : null}

            {parsed.scope !== 'buy' ? (
              <StatCard
                label={parsed.kind === 'triggered-capital' ? 'Triggered sell notional' : 'Pending sell notional'}
                value={fmtCurrency(parsed.kind === 'triggered-capital' ? totals.triggeredSellUsd : totals.pendingSellUsd)}
                sub={
                  parsed.kind === 'triggered-capital'
                    ? `${totals.triggeredSellTokens.toFixed(6)} coins across currently yellow sell rows`
                    : `${totals.activeSellPlanners} active sell planner${totals.activeSellPlanners === 1 ? '' : 's'}`
                }
              />
            ) : null}

            <StatCard
              label="Assets in report"
              value={String(tableRows.length)}
              sub={parsed.kind === 'triggered-capital' ? 'Assets with actionable planner rows right now' : 'Assets with remaining planner capital'}
            />

            <StatCard
              label={parsed.kind === 'triggered-capital' ? 'Combined triggered' : 'Combined pending'}
              value={fmtCurrency(parsed.kind === 'triggered-capital' ? totals.triggeredCombinedUsd : totals.pendingCombinedUsd)}
              sub={`${totals.activeBuyPlanners} buy / ${totals.activeSellPlanners} sell planners`}
            />
          </div>

          <SectionCard
            title="Report output"
            description={submittedQuery}
            right={
              <span className="rounded-full border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[rgb(163,163,164)]">
                {parsed.kind === 'triggered-capital' ? 'Triggered capital' : 'Pending capital'}
              </span>
            }
          >
            <div className="space-y-3">
              <div className="text-sm text-slate-100">{summary}</div>
              <div className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2 text-[12px] text-[rgb(163,163,164)]">
                {methodology}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="By asset"
            description={
              parsed.kind === 'triggered-capital'
                ? 'Currently triggered planner rows grouped by asset using the same yellow-row rules as the planner UI.'
                : 'Outstanding planner capital grouped by asset across active planners.'
            }
            right={
              <Link href="/planner" className="text-[12px] text-[rgb(163,163,164)] transition hover:text-slate-100">
                Open planner
              </Link>
            }
          >
            {tableRows.length === 0 ? (
              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  {parsed.kind === 'triggered-capital'
                    ? 'No active planner rows are triggered right now.'
                    : 'No active planners matched this report query.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/planner" className="rounded-md border border-[rgb(60,61,65)] px-3 py-2 text-[12px] text-slate-100 transition hover:bg-white/5">
                    Open planner
                  </Link>
                  <Link href="/portfolio" className="rounded-md border border-[rgb(60,61,65)] px-3 py-2 text-[12px] text-slate-100 transition hover:bg-white/5">
                    Review portfolio
                  </Link>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                      <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                      {parsed.scope !== 'sell' ? (
                        <th className="px-0 py-3 pr-4 font-medium">
                          {parsed.kind === 'triggered-capital' ? 'Triggered buy capital' : 'Pending buy capital'}
                        </th>
                      ) : null}
                      {parsed.scope !== 'buy' ? (
                        <th className="px-0 py-3 pr-4 font-medium">
                          {parsed.kind === 'triggered-capital' ? 'Triggered sell notional' : 'Pending sell notional'}
                        </th>
                      ) : null}
                      {parsed.kind === 'triggered-capital' && parsed.scope !== 'buy' ? (
                        <th className="px-0 py-3 pr-4 font-medium">Triggered sell tokens</th>
                      ) : null}
                      {parsed.kind === 'triggered-capital' && parsed.scope !== 'sell' ? (
                        <th className="px-0 py-3 pr-4 font-medium">Triggered buy tokens</th>
                      ) : null}
                      <th className="px-0 py-3 font-medium">Open planners</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                        <td className="px-0 py-3 pr-4 align-top">
                          <div className="font-medium text-slate-100">{row.label}</div>
                          <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">
                            {row.symbol || row.coinId}
                          </div>
                        </td>
                        {parsed.scope !== 'sell' ? (
                          <td className="px-0 py-3 pr-4 align-top tabular-nums text-slate-200">
                            {fmtCurrency(parsed.kind === 'triggered-capital' ? row.triggeredBuyUsd : row.pendingBuyUsd)}
                          </td>
                        ) : null}
                        {parsed.scope !== 'buy' ? (
                          <td className="px-0 py-3 pr-4 align-top tabular-nums text-slate-200">
                            {fmtCurrency(parsed.kind === 'triggered-capital' ? row.triggeredSellUsd : row.pendingSellUsd)}
                          </td>
                        ) : null}
                        {parsed.kind === 'triggered-capital' && parsed.scope !== 'buy' ? (
                          <td className="px-0 py-3 pr-4 align-top tabular-nums text-slate-200">
                            {row.triggeredSellTokens.toFixed(6)}
                          </td>
                        ) : null}
                        {parsed.kind === 'triggered-capital' && parsed.scope !== 'sell' ? (
                          <td className="px-0 py-3 pr-4 align-top tabular-nums text-slate-200">
                            {row.triggeredBuyTokens.toFixed(6)}
                          </td>
                        ) : null}
                        <td className="px-0 py-3 align-top text-[rgb(163,163,164)]">
                          {row.buyPlannerCount > 0 ? `${row.buyPlannerCount} buy` : null}
                          {row.buyPlannerCount > 0 && row.sellPlannerCount > 0 ? ' · ' : null}
                          {row.sellPlannerCount > 0 ? `${row.sellPlannerCount} sell` : null}
                          {row.buyPlannerCount === 0 && row.sellPlannerCount === 0 ? '—' : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}