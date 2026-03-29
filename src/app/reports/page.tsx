'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
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
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import { fmtCurrency, fmtPct } from '@/lib/format'

type ReportId =
  | 'money-needed-now-by-coin'
  | 'value-ready-to-sell-now-by-coin'
  | 'total-money-left-in-buy-plans'
  | 'total-value-left-to-sell'
  | 'triggered-rows-summary'
  | 'filled-vs-unfilled-plan-progress'
  | 'plan-progress-by-coin'
  | 'allocation-drift'
  | 'avg-buy-vs-current'
  | 'realized-profit-from-sells'
  | 'unrealized-gain-loss-by-coin'
  | 'planner-coverage-report'
  | 'inactive-capital-report'
  | 'execution-history-by-period'
  | 'biggest-exposure-report'

type ReportGroup = 'Action now' | 'Plan status' | 'Portfolio' | 'Health checks'

type ReportDefinition = {
  id: ReportId
  group: ReportGroup
  title: string
  description: string
}

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

type BuyPlanMetric = {
  coinId: string
  plannerId: string
  plannedUsd: number
  filledUsd: number
  remainingUsd: number
  plannedTokens: number
  filledTokens: number
  remainingTokens: number
  triggeredUsd: number
  triggeredTokens: number
  triggeredLevels: number
  remainingLevels: number
}

type SellPlanMetric = {
  coinId: string
  plannerId: string
  plannedUsd: number
  filledUsd: number
  remainingUsd: number
  plannedTokens: number
  filledTokens: number
  remainingTokens: number
  triggeredUsd: number
  triggeredTokens: number
  triggeredLevels: number
  remainingLevels: number
}

type AssetPlannerMetric = {
  coinId: string
  label: string
  symbol: string
  plannedBuyUsd: number
  filledBuyUsd: number
  remainingBuyUsd: number
  triggeredBuyUsd: number
  triggeredBuyTokens: number
  triggeredBuyLevels: number
  plannedSellUsd: number
  filledSellUsd: number
  remainingSellUsd: number
  triggeredSellUsd: number
  triggeredSellTokens: number
  triggeredSellLevels: number
  buyPlannerCount: number
  sellPlannerCount: number
}

type PortfolioMetric = {
  coinId: string
  label: string
  symbol: string
  qty: number
  avgCost: number
  currentPrice: number | null
  currentValue: number
  costBasis: number
  unrealized: number
  realized: number
  buyUsd: number
  sellValue: number
  buyCount: number
  sellCount: number
  tradeCount: number
}

type CombinedAssetRow = AssetPlannerMetric & {
  qty: number
  avgCost: number
  currentPrice: number | null
  currentValue: number
  costBasis: number
  unrealized: number
  realized: number
  buyUsd: number
  sellValue: number
  buyCount: number
  sellCount: number
  tradeCount: number
  currentWeight: number
  targetWeight: number
  driftPct: number
  futureValue: number
}

type PlannerProgressRow = {
  key: string
  type: 'Buy' | 'Sell'
  coinId: string
  label: string
  symbol: string
  plannerId: string
  plannedUsd: number
  filledUsd: number
  remainingUsd: number
  completionPct: number
  triggeredLevels: number
  remainingLevels: number
}

type ExecutionAssetRow = {
  coinId: string
  label: string
  symbol: string
  trades: number
  buys: number
  sells: number
  buyUsd: number
  sellValue: number
  netTokens: number
}

const REPORTS: ReportDefinition[] = [
  {
    id: 'money-needed-now-by-coin',
    group: 'Action now',
    title: 'Money needed now by coin',
    description: 'How much cash is needed right now for triggered buy rows.',
  },
  {
    id: 'value-ready-to-sell-now-by-coin',
    group: 'Action now',
    title: 'Value ready to sell now by coin',
    description: 'How much sell value is currently ready across triggered sell rows.',
  },
  {
    id: 'triggered-rows-summary',
    group: 'Action now',
    title: 'Triggered rows summary',
    description: 'Quick view of triggered buy rows, sell rows, and totals that need attention now.',
  },
  {
    id: 'total-money-left-in-buy-plans',
    group: 'Plan status',
    title: 'Total money left in buy plans',
    description: 'Remaining buy capital across all active buy planners.',
  },
  {
    id: 'total-value-left-to-sell',
    group: 'Plan status',
    title: 'Total value left to sell',
    description: 'Remaining sell value across all active sell planners.',
  },
  {
    id: 'filled-vs-unfilled-plan-progress',
    group: 'Plan status',
    title: 'Filled vs unfilled plan progress',
    description: 'Planner-level progress showing what is done, what is left, and what is already triggered.',
  },
  {
    id: 'plan-progress-by-coin',
    group: 'Plan status',
    title: 'Plan progress by coin',
    description: 'Aggregated planner progress by asset across buys and sells.',
  },
  {
    id: 'allocation-drift',
    group: 'Portfolio',
    title: 'Allocation drift',
    description: 'Current portfolio weight compared with the weight implied by today’s holdings plus active planners.',
  },
  {
    id: 'avg-buy-vs-current',
    group: 'Portfolio',
    title: 'Average buy price vs current price',
    description: 'Compare average entry price with the live market price for current holdings.',
  },
  {
    id: 'realized-profit-from-sells',
    group: 'Portfolio',
    title: 'Realized profit from sells',
    description: 'Profit already locked in from recorded sells.',
  },
  {
    id: 'unrealized-gain-loss-by-coin',
    group: 'Portfolio',
    title: 'Unrealized gain/loss by coin',
    description: 'Open gain or loss on current holdings using live prices.',
  },
  {
    id: 'biggest-exposure-report',
    group: 'Portfolio',
    title: 'Biggest exposure report',
    description: 'Largest current holdings, pending buy exposure, and triggered exposure by asset.',
  },
  {
    id: 'planner-coverage-report',
    group: 'Health checks',
    title: 'Planner coverage report',
    description: 'Spot holdings with no exit plan and planners that do not match current holdings.',
  },
  {
    id: 'inactive-capital-report',
    group: 'Health checks',
    title: 'Inactive capital report',
    description: 'See money or sell value parked in active planners that is not triggered yet.',
  },
  {
    id: 'execution-history-by-period',
    group: 'Health checks',
    title: 'Execution history by period',
    description: 'Review buys, sells, and net token flow over a selected period.',
  },
]

const DEFAULT_REPORT_ID: ReportId = 'money-needed-now-by-coin'
const DEFAULT_PERIOD: PeriodKey = '30d'
const BUY_ALERT_MULT = 1.015
const SELL_ALERT_MULT = 0.985
const BUY_FULL_EPS = 1e-8
const SELL_FULL_PCT = 0.97
const SELL_TOLERANCE = 0.05
const HOLDING_EPS = 1e-8

type PeriodKey = '7d' | '30d' | '90d' | 'all'

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; days: number | null }> = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: null },
]

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

function fmtSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return fmtCurrency(0)
  if (value > 0) return `+${fmtCurrency(value)}`
  if (value < 0) return `-${fmtCurrency(Math.abs(value))}`
  return fmtCurrency(0)
}

function fmtSignedPctValue(value: number): string {
  if (!Number.isFinite(value)) return fmtPct(0)
  if (value > 0) return `+${fmtPct(value)}`
  if (value < 0) return `-${fmtPct(Math.abs(value))}`
  return fmtPct(0)
}

function shortPlannerId(id: string): string {
  return id.slice(0, 8)
}

function kpiTone(value: number): string {
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-[rgba(220,96,102,1)]'
  return 'text-slate-100'
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

function StatCard(props: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-[rgb(28,29,31)] p-4 md:p-5 ring-1 ring-inset ring-[rgb(41,42,45)]/70 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[rgb(140,140,142)]">{props.label}</div>
      <div className={["mt-2 text-[22px] font-semibold tabular-nums md:text-[24px]", props.tone ?? 'text-slate-100'].join(' ')}>{props.value}</div>
      <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">{props.sub}</div>
    </div>
  )
}

function ReportOptionCard(props: { report: ReportDefinition; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={[
        'group rounded-2xl border p-4 text-left transition',
        props.selected
          ? 'border-[rgba(136,128,213,0.7)] bg-[rgba(136,128,213,0.14)] shadow-[0_18px_60px_rgba(0,0,0,0.24)]'
          : 'border-[rgb(60,61,65)] bg-[rgb(28,29,31)] hover:border-[rgb(86,88,92)] hover:bg-[rgb(31,32,34)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-medium text-slate-100">{props.report.title}</div>
          <p className="mt-1 text-[13px] leading-5 text-[rgb(163,163,164)]">{props.report.description}</p>
        </div>
        <div
          className={[
            'mt-0.5 shrink-0 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]',
            props.selected
              ? 'bg-[rgba(136,128,213,0.24)] text-slate-100'
              : 'bg-[rgb(35,36,38)] text-[rgb(163,163,164)]',
          ].join(' ')}
        >
          {props.selected ? 'Selected' : 'Choose'}
        </div>
      </div>
    </button>
  )
}

function FilterPill(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'rounded-full border px-3 py-1.5 text-[12px] transition',
        props.active
          ? 'border-[rgba(136,128,213,0.7)] bg-[rgba(136,128,213,0.14)] text-slate-100'
          : 'border-[rgb(60,61,65)] bg-[rgb(28,29,31)] text-[rgb(163,163,164)] hover:text-slate-100',
      ].join(' ')}
    >
      {props.children}
    </button>
  )
}

function EmptyReportState(props: { text: string }) {
  return <div className="text-sm text-[rgb(163,163,164)]">{props.text}</div>
}

export default function ReportsPage() {
  const { user, loading: userLoading } = useUser()
  const [selectedReportId, setSelectedReportId] = useState<ReportId>(DEFAULT_REPORT_ID)
  const [executionPeriod, setExecutionPeriod] = useState<PeriodKey>(DEFAULT_PERIOD)

  const selectedReport = useMemo(
    () => REPORTS.find((report) => report.id === selectedReportId) ?? REPORTS[0],
    [selectedReportId]
  )

  const reportGroups = useMemo(
    () => [
      { title: 'Action now' as const, icon: Clock3, items: REPORTS.filter((report) => report.group === 'Action now') },
      { title: 'Plan status' as const, icon: CheckCircle2, items: REPORTS.filter((report) => report.group === 'Plan status') },
      { title: 'Portfolio' as const, icon: Wallet, items: REPORTS.filter((report) => report.group === 'Portfolio') },
      { title: 'Health checks' as const, icon: ShieldCheck, items: REPORTS.filter((report) => report.group === 'Health checks') },
    ],
    []
  )

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

  const allCoinIds = useMemo(() => {
    const ids = new Set<string>()
    ;(buyPlanners ?? []).forEach((row) => ids.add(row.coingecko_id))
    ;(sellPlanners ?? []).forEach((row) => ids.add(row.coingecko_id))
    ;(trades ?? []).forEach((row) => ids.add(row.coingecko_id))
    return Array.from(ids)
  }, [buyPlanners, sellPlanners, trades])

  const { rows: priceRows } = usePrices(allCoinIds, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  })

  const priceMap = useMemo(() => {
    const map = new Map<string, number>()
    priceRows.forEach((row) => {
      const price = Number(row.price)
      if (Number.isFinite(price) && price > 0) {
        map.set(row.id, price)
      }
    })
    return map
  }, [priceRows])

  const { data: coinMeta } = useSWR<CoinMeta[]>(
    allCoinIds.length > 0 ? ['/reports/coin-meta', allCoinIds.slice().sort().join(',')] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('coins')
        .select('coingecko_id,symbol,name')
        .in('coingecko_id', allCoinIds)

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

  const tradesByCoin = useMemo(() => {
    const map = new Map<string, TradeRow[]>()
    ;(trades ?? []).forEach((trade) => {
      const current = map.get(trade.coingecko_id) ?? []
      current.push(trade)
      map.set(trade.coingecko_id, current)
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

  const buyPlanMetrics = useMemo<BuyPlanMetric[]>(() => {
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

      let plannedUsd = 0
      let filledUsd = 0
      let remainingUsd = 0
      let plannedTokens = 0
      let filledTokens = 0
      let remainingTokens = 0
      let triggeredUsd = 0
      let triggeredTokens = 0
      let triggeredLevels = 0
      let remainingLevels = 0

      levels.forEach((level, index) => {
        const levelPrice = Number(level.price ?? 0)
        const levelPlannedUsd = Number(level.allocation ?? 0)
        const levelFilledUsd = Number(fill.allocatedUsd[index] ?? 0)
        const missingUsd = Math.max(0, levelPlannedUsd - levelFilledUsd)
        const levelPlannedTokens = levelPrice > 0 ? levelPlannedUsd / levelPrice : 0
        const levelFilledTokens = levelPrice > 0 ? levelFilledUsd / levelPrice : 0
        const levelMissingTokens = Math.max(0, levelPlannedTokens - levelFilledTokens)
        const full = levelPlannedUsd > 0 && missingUsd <= levelPlannedUsd * 0.02 + BUY_FULL_EPS
        const yellow = !full && hasLive && levelPrice > 0 && livePrice <= levelPrice * BUY_ALERT_MULT

        plannedUsd += levelPlannedUsd
        filledUsd += levelFilledUsd
        remainingUsd += missingUsd
        plannedTokens += levelPlannedTokens
        filledTokens += levelFilledTokens
        remainingTokens += levelMissingTokens
        if (missingUsd > BUY_FULL_EPS) remainingLevels += 1
        if (yellow && missingUsd > BUY_FULL_EPS) {
          triggeredUsd += missingUsd
          triggeredTokens += levelMissingTokens
          triggeredLevels += 1
        }
      })

      return {
        coinId: planner.coingecko_id,
        plannerId: planner.id,
        plannedUsd: Number(plannedUsd.toFixed(2)),
        filledUsd: Number(filledUsd.toFixed(2)),
        remainingUsd: Number(remainingUsd.toFixed(2)),
        plannedTokens: Number(plannedTokens.toFixed(8)),
        filledTokens: Number(filledTokens.toFixed(8)),
        remainingTokens: Number(remainingTokens.toFixed(8)),
        triggeredUsd: Number(triggeredUsd.toFixed(2)),
        triggeredTokens: Number(triggeredTokens.toFixed(8)),
        triggeredLevels,
        remainingLevels,
      }
    })
  }, [buyPlanners, buyTradesByPlanner, priceMap])

  const sellPlanMetrics = useMemo<SellPlanMetric[]>(() => {
    return (sellPlanners ?? []).map((planner) => {
      const levels = sellLevelsByPlanner.get(planner.id) ?? []
      const fill = computeSellFills(levels, sellTradesByPlanner.get(planner.id) ?? [], SELL_TOLERANCE)
      const livePrice = priceMap.get(planner.coingecko_id) ?? null
      const hasLive = livePrice != null && livePrice > 0

      let plannedUsd = 0
      let filledUsd = 0
      let remainingUsd = 0
      let plannedTokens = 0
      let filledTokens = 0
      let remainingTokens = 0
      let triggeredUsd = 0
      let triggeredTokens = 0
      let triggeredLevels = 0
      let remainingLevels = 0

      levels.forEach((level, index) => {
        const plannedTokensLevel = Math.max(0, Number(level.planned_tokens))
        const filledTokensLevel = Number(fill.allocatedTokens[index] ?? 0)
        const remainingTokensLevel = Math.max(0, plannedTokensLevel - filledTokensLevel)
        const plannedUsdLevel = plannedTokensLevel * level.target_price
        const filledUsdLevel = Number(fill.allocatedUsd[index] ?? 0)
        const remainingUsdLevel = remainingTokensLevel * level.target_price
        const pct = plannedTokensLevel > 0 ? Math.min(1, filledTokensLevel / plannedTokensLevel) : 0
        const green = pct >= SELL_FULL_PCT
        const yellow = !green && hasLive && level.target_price > 0 && livePrice >= level.target_price * SELL_ALERT_MULT

        plannedUsd += plannedUsdLevel
        filledUsd += filledUsdLevel
        remainingUsd += remainingUsdLevel
        plannedTokens += plannedTokensLevel
        filledTokens += filledTokensLevel
        remainingTokens += remainingTokensLevel
        if (remainingTokensLevel > HOLDING_EPS) remainingLevels += 1
        if (yellow && remainingTokensLevel > HOLDING_EPS) {
          triggeredUsd += remainingUsdLevel
          triggeredTokens += remainingTokensLevel
          triggeredLevels += 1
        }
      })

      return {
        coinId: planner.coingecko_id,
        plannerId: planner.id,
        plannedUsd: Number(plannedUsd.toFixed(2)),
        filledUsd: Number(filledUsd.toFixed(2)),
        remainingUsd: Number(remainingUsd.toFixed(2)),
        plannedTokens: Number(plannedTokens.toFixed(8)),
        filledTokens: Number(filledTokens.toFixed(8)),
        remainingTokens: Number(remainingTokens.toFixed(8)),
        triggeredUsd: Number(triggeredUsd.toFixed(2)),
        triggeredTokens: Number(triggeredTokens.toFixed(8)),
        triggeredLevels,
        remainingLevels,
      }
    })
  }, [sellPlanners, sellLevelsByPlanner, sellTradesByPlanner, priceMap])

  const plannerAssetRows = useMemo<AssetPlannerMetric[]>(() => {
    const map = new Map<string, AssetPlannerMetric>()

    const ensure = (coinId: string) => {
      const existing = map.get(coinId)
      if (existing) return existing
      const meta = coinMetaMap.get(coinId)
      const row: AssetPlannerMetric = {
        coinId,
        label: meta?.name?.trim() || humanizeCoinId(coinId),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        plannedBuyUsd: 0,
        filledBuyUsd: 0,
        remainingBuyUsd: 0,
        triggeredBuyUsd: 0,
        triggeredBuyTokens: 0,
        triggeredBuyLevels: 0,
        plannedSellUsd: 0,
        filledSellUsd: 0,
        remainingSellUsd: 0,
        triggeredSellUsd: 0,
        triggeredSellTokens: 0,
        triggeredSellLevels: 0,
        buyPlannerCount: 0,
        sellPlannerCount: 0,
      }
      map.set(coinId, row)
      return row
    }

    buyPlanMetrics.forEach((metric) => {
      const row = ensure(metric.coinId)
      row.plannedBuyUsd += metric.plannedUsd
      row.filledBuyUsd += metric.filledUsd
      row.remainingBuyUsd += metric.remainingUsd
      row.triggeredBuyUsd += metric.triggeredUsd
      row.triggeredBuyTokens += metric.triggeredTokens
      row.triggeredBuyLevels += metric.triggeredLevels
      row.buyPlannerCount += 1
    })

    sellPlanMetrics.forEach((metric) => {
      const row = ensure(metric.coinId)
      row.plannedSellUsd += metric.plannedUsd
      row.filledSellUsd += metric.filledUsd
      row.remainingSellUsd += metric.remainingUsd
      row.triggeredSellUsd += metric.triggeredUsd
      row.triggeredSellTokens += metric.triggeredTokens
      row.triggeredSellLevels += metric.triggeredLevels
      row.sellPlannerCount += 1
    })

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        plannedBuyUsd: Number(row.plannedBuyUsd.toFixed(2)),
        filledBuyUsd: Number(row.filledBuyUsd.toFixed(2)),
        remainingBuyUsd: Number(row.remainingBuyUsd.toFixed(2)),
        triggeredBuyUsd: Number(row.triggeredBuyUsd.toFixed(2)),
        triggeredBuyTokens: Number(row.triggeredBuyTokens.toFixed(8)),
        plannedSellUsd: Number(row.plannedSellUsd.toFixed(2)),
        filledSellUsd: Number(row.filledSellUsd.toFixed(2)),
        remainingSellUsd: Number(row.remainingSellUsd.toFixed(2)),
        triggeredSellUsd: Number(row.triggeredSellUsd.toFixed(2)),
        triggeredSellTokens: Number(row.triggeredSellTokens.toFixed(8)),
      }))
      .sort((a, b) => b.remainingBuyUsd + b.remainingSellUsd - (a.remainingBuyUsd + a.remainingSellUsd))
  }, [buyPlanMetrics, sellPlanMetrics, coinMetaMap])

  const portfolioRows = useMemo<PortfolioMetric[]>(() => {
    return Array.from(new Set((trades ?? []).map((trade) => trade.coingecko_id))).map((coinId) => {
      const list = tradesByCoin.get(coinId) ?? []
      const pnl = computePnl(
        list.map((trade): PnlTrade => ({
          side: trade.side,
          price: trade.price,
          quantity: trade.quantity,
          fee: trade.fee ?? 0,
          trade_time: trade.trade_time,
        }))
      )
      const meta = coinMetaMap.get(coinId)
      const currentPrice = priceMap.get(coinId) ?? null
      const currentValue = currentPrice != null ? pnl.positionQty * currentPrice : 0
      const unrealized = currentPrice != null ? currentValue - pnl.costBasis : 0
      const buyTrades = list.filter((trade) => trade.side === 'buy')
      const sellTrades = list.filter((trade) => trade.side === 'sell')
      const buyUsd = buyTrades.reduce((sum, trade) => sum + trade.price * trade.quantity + Number(trade.fee ?? 0), 0)
      const sellValue = sellTrades.reduce((sum, trade) => sum + trade.price * trade.quantity - Number(trade.fee ?? 0), 0)

      return {
        coinId,
        label: meta?.name?.trim() || humanizeCoinId(coinId),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        qty: Number(pnl.positionQty.toFixed(8)),
        avgCost: Number(pnl.avgCost.toFixed(8)),
        currentPrice,
        currentValue: Number(currentValue.toFixed(2)),
        costBasis: Number(pnl.costBasis.toFixed(2)),
        unrealized: Number(unrealized.toFixed(2)),
        realized: Number(pnl.realizedPnl.toFixed(2)),
        buyUsd: Number(buyUsd.toFixed(2)),
        sellValue: Number(sellValue.toFixed(2)),
        buyCount: buyTrades.length,
        sellCount: sellTrades.length,
        tradeCount: list.length,
      }
    })
  }, [trades, tradesByCoin, coinMetaMap, priceMap])

  const combinedAssetRows = useMemo<CombinedAssetRow[]>(() => {
    const map = new Map<string, CombinedAssetRow>()
    const totalCurrentValue = portfolioRows.reduce((sum, row) => sum + row.currentValue, 0)

    const ensure = (coinId: string) => {
      const existing = map.get(coinId)
      if (existing) return existing
      const meta = coinMetaMap.get(coinId)
      const row: CombinedAssetRow = {
        coinId,
        label: meta?.name?.trim() || humanizeCoinId(coinId),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        plannedBuyUsd: 0,
        filledBuyUsd: 0,
        remainingBuyUsd: 0,
        triggeredBuyUsd: 0,
        triggeredBuyTokens: 0,
        triggeredBuyLevels: 0,
        plannedSellUsd: 0,
        filledSellUsd: 0,
        remainingSellUsd: 0,
        triggeredSellUsd: 0,
        triggeredSellTokens: 0,
        triggeredSellLevels: 0,
        buyPlannerCount: 0,
        sellPlannerCount: 0,
        qty: 0,
        avgCost: 0,
        currentPrice: null,
        currentValue: 0,
        costBasis: 0,
        unrealized: 0,
        realized: 0,
        buyUsd: 0,
        sellValue: 0,
        buyCount: 0,
        sellCount: 0,
        tradeCount: 0,
        currentWeight: 0,
        targetWeight: 0,
        driftPct: 0,
        futureValue: 0,
      }
      map.set(coinId, row)
      return row
    }

    plannerAssetRows.forEach((row) => Object.assign(ensure(row.coinId), { ...ensure(row.coinId), ...row }))
    portfolioRows.forEach((row) => Object.assign(ensure(row.coinId), { ...ensure(row.coinId), ...row }))

    const rows = Array.from(map.values())
    const totalFutureValue = rows.reduce((sum, row) => sum + Math.max(0, row.currentValue + row.remainingBuyUsd - row.remainingSellUsd), 0)

    return rows
      .map((row) => {
        const futureValue = Math.max(0, row.currentValue + row.remainingBuyUsd - row.remainingSellUsd)
        const currentWeight = totalCurrentValue > 0 ? row.currentValue / totalCurrentValue : 0
        const targetWeight = totalFutureValue > 0 ? futureValue / totalFutureValue : 0
        return {
          ...row,
          currentWeight,
          targetWeight,
          driftPct: currentWeight - targetWeight,
          futureValue: Number(futureValue.toFixed(2)),
        }
      })
      .sort((a, b) => b.currentValue - a.currentValue)
  }, [plannerAssetRows, portfolioRows, coinMetaMap])

  const plannerProgressRows = useMemo<PlannerProgressRow[]>(() => {
    const buys = buyPlanMetrics.map((metric) => {
      const meta = coinMetaMap.get(metric.coinId)
      return {
        key: `buy-${metric.plannerId}`,
        type: 'Buy' as const,
        coinId: metric.coinId,
        label: meta?.name?.trim() || humanizeCoinId(metric.coinId),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        plannerId: metric.plannerId,
        plannedUsd: metric.plannedUsd,
        filledUsd: metric.filledUsd,
        remainingUsd: metric.remainingUsd,
        completionPct: metric.plannedUsd > 0 ? metric.filledUsd / metric.plannedUsd : 0,
        triggeredLevels: metric.triggeredLevels,
        remainingLevels: metric.remainingLevels,
      }
    })
    const sells = sellPlanMetrics.map((metric) => {
      const meta = coinMetaMap.get(metric.coinId)
      return {
        key: `sell-${metric.plannerId}`,
        type: 'Sell' as const,
        coinId: metric.coinId,
        label: meta?.name?.trim() || humanizeCoinId(metric.coinId),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        plannerId: metric.plannerId,
        plannedUsd: metric.plannedUsd,
        filledUsd: metric.filledUsd,
        remainingUsd: metric.remainingUsd,
        completionPct: metric.plannedUsd > 0 ? metric.filledUsd / metric.plannedUsd : 0,
        triggeredLevels: metric.triggeredLevels,
        remainingLevels: metric.remainingLevels,
      }
    })
    return [...buys, ...sells].sort((a, b) => b.remainingUsd - a.remainingUsd)
  }, [buyPlanMetrics, sellPlanMetrics, coinMetaMap])

  const executionWindow = useMemo(() => PERIOD_OPTIONS.find((option) => option.key === executionPeriod) ?? PERIOD_OPTIONS[1], [executionPeriod])

  const filteredTradesForPeriod = useMemo(() => {
    if (!trades || executionWindow.days == null) return trades ?? []
    const cutoff = Date.now() - executionWindow.days * 24 * 60 * 60 * 1000
    return trades.filter((trade) => Date.parse(trade.trade_time) >= cutoff)
  }, [trades, executionWindow.days])

  const executionRows = useMemo<ExecutionAssetRow[]>(() => {
    const map = new Map<string, ExecutionAssetRow>()
    filteredTradesForPeriod.forEach((trade) => {
      const existing = map.get(trade.coingecko_id)
      const meta = coinMetaMap.get(trade.coingecko_id)
      const row: ExecutionAssetRow = existing ?? {
        coinId: trade.coingecko_id,
        label: meta?.name?.trim() || humanizeCoinId(trade.coingecko_id),
        symbol: (meta?.symbol ?? '').toUpperCase(),
        trades: 0,
        buys: 0,
        sells: 0,
        buyUsd: 0,
        sellValue: 0,
        netTokens: 0,
      }
      row.trades += 1
      if (trade.side === 'buy') {
        row.buys += 1
        row.buyUsd += trade.price * trade.quantity + Number(trade.fee ?? 0)
        row.netTokens += trade.quantity
      } else {
        row.sells += 1
        row.sellValue += trade.price * trade.quantity - Number(trade.fee ?? 0)
        row.netTokens -= trade.quantity
      }
      map.set(trade.coingecko_id, row)
    })
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        buyUsd: Number(row.buyUsd.toFixed(2)),
        sellValue: Number(row.sellValue.toFixed(2)),
        netTokens: Number(row.netTokens.toFixed(8)),
      }))
      .sort((a, b) => b.buyUsd + b.sellValue - (a.buyUsd + a.sellValue))
  }, [filteredTradesForPeriod, coinMetaMap])

  const totals = useMemo(() => {
    const pendingBuyUsd = buyPlanMetrics.reduce((sum, row) => sum + row.remainingUsd, 0)
    const pendingSellUsd = sellPlanMetrics.reduce((sum, row) => sum + row.remainingUsd, 0)
    const triggeredBuyUsd = buyPlanMetrics.reduce((sum, row) => sum + row.triggeredUsd, 0)
    const triggeredSellUsd = sellPlanMetrics.reduce((sum, row) => sum + row.triggeredUsd, 0)
    const triggeredBuyTokens = buyPlanMetrics.reduce((sum, row) => sum + row.triggeredTokens, 0)
    const triggeredSellTokens = sellPlanMetrics.reduce((sum, row) => sum + row.triggeredTokens, 0)
    const triggeredBuyLevels = buyPlanMetrics.reduce((sum, row) => sum + row.triggeredLevels, 0)
    const triggeredSellLevels = sellPlanMetrics.reduce((sum, row) => sum + row.triggeredLevels, 0)
    const currentValue = portfolioRows.reduce((sum, row) => sum + row.currentValue, 0)
    const unrealized = portfolioRows.reduce((sum, row) => sum + row.unrealized, 0)
    const realized = portfolioRows.reduce((sum, row) => sum + row.realized, 0)
    const futureValue = combinedAssetRows.reduce((sum, row) => sum + row.futureValue, 0)

    return {
      pendingBuyUsd: Number(pendingBuyUsd.toFixed(2)),
      pendingSellUsd: Number(pendingSellUsd.toFixed(2)),
      pendingCombined: Number((pendingBuyUsd + pendingSellUsd).toFixed(2)),
      triggeredBuyUsd: Number(triggeredBuyUsd.toFixed(2)),
      triggeredSellUsd: Number(triggeredSellUsd.toFixed(2)),
      triggeredCombined: Number((triggeredBuyUsd + triggeredSellUsd).toFixed(2)),
      triggeredBuyTokens: Number(triggeredBuyTokens.toFixed(8)),
      triggeredSellTokens: Number(triggeredSellTokens.toFixed(8)),
      triggeredBuyLevels,
      triggeredSellLevels,
      currentValue: Number(currentValue.toFixed(2)),
      unrealized: Number(unrealized.toFixed(2)),
      realized: Number(realized.toFixed(2)),
      futureValue: Number(futureValue.toFixed(2)),
    }
  }, [buyPlanMetrics, sellPlanMetrics, portfolioRows, combinedAssetRows])

  const coverage = useMemo(() => {
    const rows = combinedAssetRows
    const holdingsNoSellPlan = rows.filter((row) => row.qty > HOLDING_EPS && row.sellPlannerCount === 0)
    const buyPlanNoSellPlan = rows.filter((row) => row.buyPlannerCount > 0 && row.sellPlannerCount === 0)
    const sellPlanNoHoldings = rows.filter((row) => row.sellPlannerCount > 0 && row.qty <= HOLDING_EPS)
    const holdingsNoPlanner = rows.filter((row) => row.qty > HOLDING_EPS && row.buyPlannerCount === 0 && row.sellPlannerCount === 0)
    return { holdingsNoSellPlan, buyPlanNoSellPlan, sellPlanNoHoldings, holdingsNoPlanner }
  }, [combinedAssetRows])

  const inactiveRows = useMemo(() => {
    return combinedAssetRows
      .filter((row) => (row.remainingBuyUsd > 0 && row.triggeredBuyUsd <= 0) || (row.remainingSellUsd > 0 && row.triggeredSellUsd <= 0))
      .sort((a, b) => (b.remainingBuyUsd - b.triggeredBuyUsd) + (b.remainingSellUsd - b.triggeredSellUsd) - ((a.remainingBuyUsd - a.triggeredBuyUsd) + (a.remainingSellUsd - a.triggeredSellUsd)))
  }, [combinedAssetRows])

  const isLoading = userLoading || buyLoading || sellPlannerLoading || sellLevelsLoading || tradesLoading

  function renderTriggeredBuyReport() {
    const rows = combinedAssetRows.filter((row) => row.triggeredBuyUsd > 0).sort((a, b) => b.triggeredBuyUsd - a.triggeredBuyUsd)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Money needed now" value={fmtCurrency(totals.triggeredBuyUsd)} sub={`${totals.triggeredBuyLevels} triggered buy rows`} />
          <StatCard label="Triggered buy tokens" value={totals.triggeredBuyTokens.toFixed(6)} sub="Estimated coins still left on triggered buy rows" />
          <StatCard label="Coins in report" value={String(rows.length)} sub="Assets with buy rows that need action now" />
        </div>

        <SectionCard title="By coin" description="Current yellow buy rows grouped by asset.">
          {rows.length === 0 ? (
            <EmptyReportState text="No buy rows are triggered right now." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Money needed now</th>
                    <th className="px-0 py-3 pr-4 font-medium">Triggered buy rows</th>
                    <th className="px-0 py-3 font-medium">Open buy planners</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.triggeredBuyUsd)}</td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.triggeredBuyLevels}</td>
                      <td className="px-0 py-3 text-[rgb(163,163,164)]">{row.buyPlannerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderTriggeredSellReport() {
    const rows = combinedAssetRows.filter((row) => row.triggeredSellUsd > 0).sort((a, b) => b.triggeredSellUsd - a.triggeredSellUsd)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Value ready to sell" value={fmtCurrency(totals.triggeredSellUsd)} sub={`${totals.triggeredSellLevels} triggered sell rows`} />
          <StatCard label="Triggered sell tokens" value={totals.triggeredSellTokens.toFixed(6)} sub="Coins still left on triggered sell rows" />
          <StatCard label="Coins in report" value={String(rows.length)} sub="Assets with sell rows ready now" />
        </div>

        <SectionCard title="By coin" description="Current yellow sell rows grouped by asset.">
          {rows.length === 0 ? (
            <EmptyReportState text="No sell rows are triggered right now." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Value ready now</th>
                    <th className="px-0 py-3 pr-4 font-medium">Triggered sell rows</th>
                    <th className="px-0 py-3 font-medium">Triggered sell tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.triggeredSellUsd)}</td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.triggeredSellLevels}</td>
                      <td className="px-0 py-3 tabular-nums text-[rgb(163,163,164)]">{row.triggeredSellTokens.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderTriggeredSummaryReport() {
    const rows = combinedAssetRows.filter((row) => row.triggeredBuyUsd > 0 || row.triggeredSellUsd > 0)
      .sort((a, b) => b.triggeredBuyUsd + b.triggeredSellUsd - (a.triggeredBuyUsd + a.triggeredSellUsd))
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Triggered buy rows" value={String(totals.triggeredBuyLevels)} sub={fmtCurrency(totals.triggeredBuyUsd)} />
          <StatCard label="Triggered sell rows" value={String(totals.triggeredSellLevels)} sub={fmtCurrency(totals.triggeredSellUsd)} />
          <StatCard label="Combined total now" value={fmtCurrency(totals.triggeredCombined)} sub="Buy money needed + sell value ready now" />
          <StatCard label="Assets needing attention" value={String(rows.length)} sub="Coins with at least one triggered row" />
        </div>

        <SectionCard title="Triggered rows by asset" description="Use this as the quick operating checklist for what needs action right now.">
          {rows.length === 0 ? (
            <EmptyReportState text="Nothing is triggered right now." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Buy money needed</th>
                    <th className="px-0 py-3 pr-4 font-medium">Sell value ready</th>
                    <th className="px-0 py-3 pr-4 font-medium">Triggered buy rows</th>
                    <th className="px-0 py-3 font-medium">Triggered sell rows</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.triggeredBuyUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.triggeredSellUsd)}</td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.triggeredBuyLevels}</td>
                      <td className="px-0 py-3 text-[rgb(163,163,164)]">{row.triggeredSellLevels}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderPendingBuyReport() {
    const rows = combinedAssetRows.filter((row) => row.remainingBuyUsd > 0).sort((a, b) => b.remainingBuyUsd - a.remainingBuyUsd)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Money left in buy plans" value={fmtCurrency(totals.pendingBuyUsd)} sub={`${buyPlanMetrics.length} active buy planners`} />
          <StatCard label="Currently triggered" value={fmtCurrency(totals.triggeredBuyUsd)} sub="Part of the remaining buy total that needs action now" />
          <StatCard label="Coins in report" value={String(rows.length)} sub="Assets with remaining buy capital" />
        </div>
        <SectionCard title="By coin" description="Remaining buy capital across all active buy planners.">
          {rows.length === 0 ? (
            <EmptyReportState text="There is no remaining buy capital in active planners." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Money left</th>
                    <th className="px-0 py-3 pr-4 font-medium">Money needed now</th>
                    <th className="px-0 py-3 font-medium">Buy planners</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.remainingBuyUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-[rgb(163,163,164)]">{fmtCurrency(row.triggeredBuyUsd)}</td>
                      <td className="px-0 py-3 text-[rgb(163,163,164)]">{row.buyPlannerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderPendingSellReport() {
    const rows = combinedAssetRows.filter((row) => row.remainingSellUsd > 0).sort((a, b) => b.remainingSellUsd - a.remainingSellUsd)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Value left to sell" value={fmtCurrency(totals.pendingSellUsd)} sub={`${sellPlanMetrics.length} active sell planners`} />
          <StatCard label="Ready now" value={fmtCurrency(totals.triggeredSellUsd)} sub="Part of the remaining sell total that is already triggered" />
          <StatCard label="Coins in report" value={String(rows.length)} sub="Assets with remaining sell value" />
        </div>
        <SectionCard title="By coin" description="Remaining sell value across all active sell planners.">
          {rows.length === 0 ? (
            <EmptyReportState text="There is no remaining sell value in active planners." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Value left to sell</th>
                    <th className="px-0 py-3 pr-4 font-medium">Value ready now</th>
                    <th className="px-0 py-3 font-medium">Sell planners</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.remainingSellUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-[rgb(163,163,164)]">{fmtCurrency(row.triggeredSellUsd)}</td>
                      <td className="px-0 py-3 text-[rgb(163,163,164)]">{row.sellPlannerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderPlannerProgressReport() {
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Buy plans filled" value={fmtCurrency(buyPlanMetrics.reduce((s, r) => s + r.filledUsd, 0))} sub={fmtCurrency(totals.pendingBuyUsd) + ' still left'} />
          <StatCard label="Sell plans filled" value={fmtCurrency(sellPlanMetrics.reduce((s, r) => s + r.filledUsd, 0))} sub={fmtCurrency(totals.pendingSellUsd) + ' still left'} />
          <StatCard label="Triggered buy rows" value={String(totals.triggeredBuyLevels)} sub="Rows already actionable" />
          <StatCard label="Triggered sell rows" value={String(totals.triggeredSellLevels)} sub="Rows already actionable" />
        </div>
        <SectionCard title="Planner progress" description="Progress for each active planner. Completion is based on planned amount versus recorded fills.">
          {plannerProgressRows.length === 0 ? (
            <EmptyReportState text="No active planners found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Planner</th>
                    <th className="px-0 py-3 pr-4 font-medium">Type</th>
                    <th className="px-0 py-3 pr-4 font-medium">Planned</th>
                    <th className="px-0 py-3 pr-4 font-medium">Filled</th>
                    <th className="px-0 py-3 pr-4 font-medium">Remaining</th>
                    <th className="px-0 py-3 pr-4 font-medium">Complete</th>
                    <th className="px-0 py-3 font-medium">Triggered rows</th>
                  </tr>
                </thead>
                <tbody>
                  {plannerProgressRows.map((row) => (
                    <tr key={row.key} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId} · {shortPlannerId(row.plannerId)}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.type}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.plannedUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.filledUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-[rgb(163,163,164)]">{fmtCurrency(row.remainingUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-[rgb(163,163,164)]">{fmtPct(row.completionPct)}</td>
                      <td className="px-0 py-3 text-[rgb(163,163,164)]">{row.triggeredLevels}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderPlanProgressByCoinReport() {
    const rows = combinedAssetRows.filter((row) => row.buyPlannerCount > 0 || row.sellPlannerCount > 0)
      .sort((a, b) => b.remainingBuyUsd + b.remainingSellUsd - (a.remainingBuyUsd + a.remainingSellUsd))
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Planned buy total" value={fmtCurrency(combinedAssetRows.reduce((s, r) => s + r.plannedBuyUsd, 0))} sub={fmtCurrency(combinedAssetRows.reduce((s, r) => s + r.filledBuyUsd, 0)) + ' already filled'} />
          <StatCard label="Planned sell total" value={fmtCurrency(combinedAssetRows.reduce((s, r) => s + r.plannedSellUsd, 0))} sub={fmtCurrency(combinedAssetRows.reduce((s, r) => s + r.filledSellUsd, 0)) + ' already filled'} />
          <StatCard label="Buy money left" value={fmtCurrency(totals.pendingBuyUsd)} sub="Across all coins" />
          <StatCard label="Sell value left" value={fmtCurrency(totals.pendingSellUsd)} sub="Across all coins" />
        </div>
        <SectionCard title="By coin" description="Aggregated planner progress by asset.">
          {rows.length === 0 ? (
            <EmptyReportState text="No active planners found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Buy progress</th>
                    <th className="px-0 py-3 pr-4 font-medium">Sell progress</th>
                    <th className="px-0 py-3 pr-4 font-medium">Buy money left</th>
                    <th className="px-0 py-3 font-medium">Sell value left</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.plannedBuyUsd > 0 ? fmtPct(row.filledBuyUsd / row.plannedBuyUsd) : '—'}</td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.plannedSellUsd > 0 ? fmtPct(row.filledSellUsd / row.plannedSellUsd) : '—'}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.remainingBuyUsd)}</td>
                      <td className="px-0 py-3 tabular-nums text-slate-100">{fmtCurrency(row.remainingSellUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderAllocationDriftReport() {
    const rows = combinedAssetRows
      .filter((row) => row.currentValue > 0 || row.remainingBuyUsd > 0 || row.remainingSellUsd > 0)
      .sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct))
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Current portfolio value" value={fmtCurrency(totals.currentValue)} sub="Based on live prices from the new data core" />
          <StatCard label="Implied future value" value={fmtCurrency(totals.futureValue)} sub="Current holdings plus active buy plans minus active sell plans" />
          <StatCard label="Assets with drift" value={String(rows.length)} sub="Compared against the portfolio mix implied by active planners" />
        </div>
        <SectionCard title="Allocation drift" description="Assumption used: target weight = current holding value + remaining buy money − remaining sell value, clamped at zero.">
          {rows.length === 0 ? (
            <EmptyReportState text="There is not enough holdings or planner data to calculate drift." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Current weight</th>
                    <th className="px-0 py-3 pr-4 font-medium">Target weight</th>
                    <th className="px-0 py-3 pr-4 font-medium">Drift</th>
                    <th className="px-0 py-3 font-medium">Implied future value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{fmtPct(row.currentWeight)}</td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{fmtPct(row.targetWeight)}</td>
                      <td className={["px-0 py-3 pr-4", kpiTone(-row.driftPct)].join(' ')}>{fmtSignedPctValue(row.driftPct)}</td>
                      <td className="px-0 py-3 tabular-nums text-slate-100">{fmtCurrency(row.futureValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderAvgVsCurrentReport() {
    const rows = combinedAssetRows.filter((row) => row.qty > HOLDING_EPS && row.currentPrice != null && row.avgCost > 0)
      .sort((a, b) => ((b.currentPrice ?? 0) / b.avgCost) - ((a.currentPrice ?? 0) / a.avgCost))
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Coins with holdings" value={String(rows.length)} sub="Assets with both a live price and an average entry" />
          <StatCard label="Current portfolio value" value={fmtCurrency(totals.currentValue)} sub="Only current holdings, not pending planners" />
          <StatCard label="Unrealized total" value={fmtSignedCurrency(totals.unrealized)} sub="Current gain or loss on open holdings" tone={kpiTone(totals.unrealized)} />
        </div>
        <SectionCard title="Average buy vs current" description="Compare today’s market price with your average entry for current holdings.">
          {rows.length === 0 ? (
            <EmptyReportState text="There are no current holdings with enough data for this comparison." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Avg buy price</th>
                    <th className="px-0 py-3 pr-4 font-medium">Current price</th>
                    <th className="px-0 py-3 pr-4 font-medium">Gap</th>
                    <th className="px-0 py-3 font-medium">Holdings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const gapPct = row.avgCost > 0 && row.currentPrice != null ? row.currentPrice / row.avgCost - 1 : 0
                    return (
                      <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                        <td className="px-0 py-3 pr-4">
                          <div className="font-medium text-slate-100">{row.label}</div>
                          <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                        </td>
                        <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.avgCost)}</td>
                        <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.currentPrice)}</td>
                        <td className={["px-0 py-3 pr-4", kpiTone(gapPct)].join(' ')}>{fmtSignedPctValue(gapPct)}</td>
                        <td className="px-0 py-3 tabular-nums text-[rgb(163,163,164)]">{row.qty.toFixed(6)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderRealizedReport() {
    const rows = combinedAssetRows.filter((row) => Math.abs(row.realized) > 0.005).sort((a, b) => b.realized - a.realized)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Realized profit total" value={fmtSignedCurrency(totals.realized)} sub="Based on recorded sell activity" tone={kpiTone(totals.realized)} />
          <StatCard label="Coins with realized P/L" value={String(rows.length)} sub="Assets where recorded sells changed realized results" />
          <StatCard label="Current holdings value" value={fmtCurrency(totals.currentValue)} sub="Useful for comparing realized vs still-open exposure" />
        </div>
        <SectionCard title="Realized profit from sells" description="Realized P/L is computed from the recorded trade ledger using weighted average cost.">
          {rows.length === 0 ? (
            <EmptyReportState text="No realized profit or loss has been recorded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Realized P/L</th>
                    <th className="px-0 py-3 pr-4 font-medium">Sell value recorded</th>
                    <th className="px-0 py-3 font-medium">Current holdings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className={["px-0 py-3 pr-4 tabular-nums", kpiTone(row.realized)].join(' ')}>{fmtSignedCurrency(row.realized)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.sellValue)}</td>
                      <td className="px-0 py-3 tabular-nums text-[rgb(163,163,164)]">{row.qty.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderUnrealizedReport() {
    const rows = combinedAssetRows.filter((row) => row.qty > HOLDING_EPS && row.currentPrice != null).sort((a, b) => b.unrealized - a.unrealized)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Unrealized total" value={fmtSignedCurrency(totals.unrealized)} sub="Current gain or loss on open holdings" tone={kpiTone(totals.unrealized)} />
          <StatCard label="Current portfolio value" value={fmtCurrency(totals.currentValue)} sub="Live value of current holdings" />
          <StatCard label="Coins with holdings" value={String(rows.length)} sub="Assets included in unrealized P/L" />
        </div>
        <SectionCard title="Unrealized gain/loss by coin" description="Unrealized P/L uses current holdings, weighted average cost, and live prices from the new data core.">
          {rows.length === 0 ? (
            <EmptyReportState text="There are no current holdings to evaluate." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Current value</th>
                    <th className="px-0 py-3 pr-4 font-medium">Cost basis</th>
                    <th className="px-0 py-3 pr-4 font-medium">Unrealized P/L</th>
                    <th className="px-0 py-3 font-medium">Holdings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.currentValue)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.costBasis)}</td>
                      <td className={["px-0 py-3 pr-4 tabular-nums", kpiTone(row.unrealized)].join(' ')}>{fmtSignedCurrency(row.unrealized)}</td>
                      <td className="px-0 py-3 tabular-nums text-[rgb(163,163,164)]">{row.qty.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderCoverageReport() {
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Holdings with no sell plan" value={String(coverage.holdingsNoSellPlan.length)} sub="Current positions missing an active exit plan" />
          <StatCard label="Buy plans with no sell plan" value={String(coverage.buyPlanNoSellPlan.length)} sub="Assets still being accumulated without an active sell planner" />
          <StatCard label="Sell plans with no holdings" value={String(coverage.sellPlanNoHoldings.length)} sub="Exit plans that do not currently match holdings" />
          <StatCard label="Holdings with no planner" value={String(coverage.holdingsNoPlanner.length)} sub="Positions with neither a buy nor sell planner" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionCard title="Holdings with no sell plan" description="Current positions that do not have an active sell planner.">
            {coverage.holdingsNoSellPlan.length === 0 ? <EmptyReportState text="Every current holding has an active sell plan." /> : (
              <div className="space-y-2 text-sm">
                {coverage.holdingsNoSellPlan.map((row) => (
                  <div key={`hns-${row.coinId}`} className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2">
                    <div className="font-medium text-slate-100">{row.label}</div>
                    <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">{row.qty.toFixed(6)} coins · {fmtCurrency(row.currentValue)} current value</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Buy plans with no sell plan" description="Assets still being accumulated but missing an active exit plan.">
            {coverage.buyPlanNoSellPlan.length === 0 ? <EmptyReportState text="Every active buy plan has a matching active sell plan." /> : (
              <div className="space-y-2 text-sm">
                {coverage.buyPlanNoSellPlan.map((row) => (
                  <div key={`bpns-${row.coinId}`} className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2">
                    <div className="font-medium text-slate-100">{row.label}</div>
                    <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">{fmtCurrency(row.remainingBuyUsd)} still left in buy plans</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Sell plans with no holdings" description="Active sell planners where current holdings are zero.">
            {coverage.sellPlanNoHoldings.length === 0 ? <EmptyReportState text="Every active sell plan still maps to current holdings." /> : (
              <div className="space-y-2 text-sm">
                {coverage.sellPlanNoHoldings.map((row) => (
                  <div key={`spnh-${row.coinId}`} className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2">
                    <div className="font-medium text-slate-100">{row.label}</div>
                    <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">{fmtCurrency(row.remainingSellUsd)} still left in sell plans</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Holdings with no planner" description="Current positions that do not have any active planner coverage.">
            {coverage.holdingsNoPlanner.length === 0 ? <EmptyReportState text="Every current holding has at least one active planner attached." /> : (
              <div className="space-y-2 text-sm">
                {coverage.holdingsNoPlanner.map((row) => (
                  <div key={`hnp-${row.coinId}`} className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2">
                    <div className="font-medium text-slate-100">{row.label}</div>
                    <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">{row.qty.toFixed(6)} coins · {fmtCurrency(row.currentValue)} current value</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </>
    )
  }

  function renderInactiveCapitalReport() {
    const standbyBuy = inactiveRows.reduce((sum, row) => sum + (row.remainingBuyUsd > 0 ? row.remainingBuyUsd - row.triggeredBuyUsd : 0), 0)
    const standbySell = inactiveRows.reduce((sum, row) => sum + (row.remainingSellUsd > 0 ? row.remainingSellUsd - row.triggeredSellUsd : 0), 0)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Standby buy money" value={fmtCurrency(standbyBuy)} sub="Active buy capital not triggered yet" />
          <StatCard label="Standby sell value" value={fmtCurrency(standbySell)} sub="Active sell value not triggered yet" />
          <StatCard label="Assets on standby" value={String(inactiveRows.length)} sub="Coins with active planners but no current trigger" />
        </div>
        <SectionCard title="Inactive capital" description="Money or sell value still parked in active planners but not currently actionable.">
          {inactiveRows.length === 0 ? (
            <EmptyReportState text="All remaining planner amounts are already triggered or there is no remaining planner capital." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Standby buy money</th>
                    <th className="px-0 py-3 pr-4 font-medium">Standby sell value</th>
                    <th className="px-0 py-3 font-medium">Triggered now</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveRows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(Math.max(0, row.remainingBuyUsd - row.triggeredBuyUsd))}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(Math.max(0, row.remainingSellUsd - row.triggeredSellUsd))}</td>
                      <td className="px-0 py-3 text-[rgb(163,163,164)]">{fmtCurrency(row.triggeredBuyUsd + row.triggeredSellUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderExecutionHistoryReport() {
    const totalBuyUsd = executionRows.reduce((sum, row) => sum + row.buyUsd, 0)
    const totalSellValue = executionRows.reduce((sum, row) => sum + row.sellValue, 0)
    const totalTrades = filteredTradesForPeriod.length
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <FilterPill key={option.key} active={executionPeriod === option.key} onClick={() => setExecutionPeriod(option.key)}>
              {option.label}
            </FilterPill>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Trades in period" value={String(totalTrades)} sub={`Window: ${executionWindow.label}`} />
          <StatCard label="Buy money used" value={fmtCurrency(totalBuyUsd)} sub="Recorded buys in the selected period" />
          <StatCard label="Sell value recorded" value={fmtCurrency(totalSellValue)} sub="Recorded sells in the selected period" />
        </div>

        <SectionCard title="Execution history" description="Grouped by asset for the selected time window.">
          {executionRows.length === 0 ? (
            <EmptyReportState text="No trade activity was recorded in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Trades</th>
                    <th className="px-0 py-3 pr-4 font-medium">Buy money used</th>
                    <th className="px-0 py-3 pr-4 font-medium">Sell value recorded</th>
                    <th className="px-0 py-3 font-medium">Net tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {executionRows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{row.trades}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.buyUsd)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.sellValue)}</td>
                      <td className={["px-0 py-3 tabular-nums", kpiTone(row.netTokens)].join(' ')}>{row.netTokens.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderExposureReport() {
    const rows = combinedAssetRows.filter((row) => row.currentValue > 0 || row.remainingBuyUsd > 0 || row.triggeredBuyUsd > 0 || row.triggeredSellUsd > 0)
      .sort((a, b) => b.currentValue - a.currentValue)
    return (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Current holdings value" value={fmtCurrency(totals.currentValue)} sub="Largest source of current exposure" />
          <StatCard label="Pending buy exposure" value={fmtCurrency(totals.pendingBuyUsd)} sub="Money still left in active buy plans" />
          <StatCard label="Triggered exposure now" value={fmtCurrency(totals.triggeredCombined)} sub="Triggered buys plus triggered sells" />
          <StatCard label="Coins in report" value={String(rows.length)} sub="Assets with current or planned exposure" />
        </div>
        <SectionCard title="Biggest exposure report" description="Sort order is based on current holdings value. Use this report to spot concentration quickly.">
          {rows.length === 0 ? (
            <EmptyReportState text="There is no current or planned exposure to show." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(41,42,45)] text-[12px] uppercase tracking-[0.12em] text-[rgb(140,140,142)]">
                    <th className="px-0 py-3 pr-4 font-medium">Asset</th>
                    <th className="px-0 py-3 pr-4 font-medium">Current value</th>
                    <th className="px-0 py-3 pr-4 font-medium">Portfolio weight</th>
                    <th className="px-0 py-3 pr-4 font-medium">Pending buy money</th>
                    <th className="px-0 py-3 font-medium">Triggered total now</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.coinId} className="border-b border-[rgb(41,42,45)]/60 last:border-b-0">
                      <td className="px-0 py-3 pr-4">
                        <div className="font-medium text-slate-100">{row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[rgb(163,163,164)]">{row.symbol || row.coinId}</div>
                      </td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.currentValue)}</td>
                      <td className="px-0 py-3 pr-4 text-[rgb(163,163,164)]">{fmtPct(row.currentWeight)}</td>
                      <td className="px-0 py-3 pr-4 tabular-nums text-slate-100">{fmtCurrency(row.remainingBuyUsd)}</td>
                      <td className="px-0 py-3 tabular-nums text-slate-100">{fmtCurrency(row.triggeredBuyUsd + row.triggeredSellUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </>
    )
  }

  function renderReportContent() {
    switch (selectedReport.id) {
      case 'money-needed-now-by-coin':
        return renderTriggeredBuyReport()
      case 'value-ready-to-sell-now-by-coin':
        return renderTriggeredSellReport()
      case 'triggered-rows-summary':
        return renderTriggeredSummaryReport()
      case 'total-money-left-in-buy-plans':
        return renderPendingBuyReport()
      case 'total-value-left-to-sell':
        return renderPendingSellReport()
      case 'filled-vs-unfilled-plan-progress':
        return renderPlannerProgressReport()
      case 'plan-progress-by-coin':
        return renderPlanProgressByCoinReport()
      case 'allocation-drift':
        return renderAllocationDriftReport()
      case 'avg-buy-vs-current':
        return renderAvgVsCurrentReport()
      case 'realized-profit-from-sells':
        return renderRealizedReport()
      case 'unrealized-gain-loss-by-coin':
        return renderUnrealizedReport()
      case 'planner-coverage-report':
        return renderCoverageReport()
      case 'inactive-capital-report':
        return renderInactiveCapitalReport()
      case 'execution-history-by-period':
        return renderExecutionHistoryReport()
      case 'biggest-exposure-report':
        return renderExposureReport()
      default:
        return null
    }
  }

  if (!userLoading && !user) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 md:px-8 md:py-8 lg:px-10">
        <div className="space-y-2 border-b border-[rgb(41,42,45)]/80 pb-3">
          <h1 className="text-[20px] font-semibold text-white/90 md:text-[22px]">Reports</h1>
          <p className="text-[13px] text-[rgb(163,163,164)] md:text-[14px]">
            Choose a report and LedgerOne will build the matching analytics view from your planners and trade ledger.
          </p>
        </div>

        <SectionCard
          title="Sign in required"
          description="Reports use your private planner and trade data."
          right={<BarChart3 className="h-4 w-4 text-slate-400" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Sign in to run reports against your portfolio and planner data.</p>
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
              Choose a report from the dropdown below. This keeps the page cleaner and easier to navigate while preserving every report.
            </p>
                      </div>
        </div>
      </div>

      <SectionCard
        title="Select report"
        description="Choose a report from the dropdown. The output below updates immediately."
        right={<Sparkles className="h-4 w-4 text-slate-400" />}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[rgb(140,140,142)]">
              Report
            </span>
            <select
              value={selectedReport.id}
              onChange={(event) => setSelectedReportId(event.target.value as ReportId)}
              className="h-11 w-full rounded-xl border border-[rgb(60,61,65)] bg-[rgb(32,33,35)] px-3 text-sm text-slate-100 outline-none transition hover:border-[rgb(86,88,92)] focus:border-[rgba(136,128,213,0.8)]"
            >
              {reportGroups.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.items.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[rgb(140,140,142)]">
              Selected report
            </div>
            <div className="mt-2 text-[15px] font-medium text-slate-100">
              {selectedReport.title}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[rgb(163,163,164)]">
              {selectedReport.description}
            </p>
          </div>
        </div>
      </SectionCard>

      {isLoading ? (
        <SectionCard title="Running report" description="Loading your active planners, fills, trade ledger, and live prices.">
          <div className="text-sm text-slate-400">Loading report data…</div>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title={selectedReport.title}
            description={selectedReport.description}
            right={
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[rgb(163,163,164)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Selected report
              </div>
            }
          >
            <div className="rounded-xl border border-[rgb(60,61,65)] bg-[rgb(25,26,28)] px-3 py-2 text-[12px] text-[rgb(163,163,164)]">
              Reports use your trade ledger, active planners, and live market prices from the new data core. Portfolio drift is inferred from today’s holdings plus active planner changes because no dedicated target-allocation table exists in this repo.
            </div>
          </SectionCard>

          {renderReportContent()}
        </>
      )}
    </div>
  )
}
