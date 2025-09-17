'use client'

import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import ProgressBar from '@/components/common/ProgressBar'
import { fmtCurrency } from '@/lib/format'
import { useLivePrice } from '@/lib/useLivePrice'
import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyLevel,
  type BuyTrade as BuyTradeType,
  type SellTrade as SellTradeType,
} from '@/lib/planner'

type SellPlanner = {
  id: string
  user_id: string
  coingecko_id: string
  is_active: boolean
  avg_lock_price: number | null
  created_at: string
  frozen_at: string | null
}

type SellLevel = {
  level: number
  rise_pct: number
  price: number
  sell_tokens: number | null
  sell_pct_of_remaining?: number | null
}

type ActiveBuyPlanner = {
  id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: 70 | 90
  growth_per_level: number | null
  started_at: string | null
  is_active: boolean | null
}

// Highlight when near (±3%) or crossed ≥ target
const SELL_TOLERANCE = 0.03
const EPS = 1e-8

export default function SellPlannerLadder({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const { price: livePrice } = useLivePrice(coingeckoId, 15000)

  // Active Sell Planner
  const { data: planner, mutate: mutatePlanner } = useSWR<SellPlanner | null>(
    user ? ['/sell-planner/active', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,user_id,coingecko_id,is_active,avg_lock_price,created_at,frozen_at')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Sell Levels
  const { data: levels, mutate: mutateLevels } = useSWR<SellLevel[]>(
    user && planner ? ['/sell-levels', planner.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,rise_pct,price,sell_tokens,sell_pct_of_remaining,user_id,coingecko_id,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', planner!.id)
        .order('level', { ascending: true })
      if (error) throw error
      return (data ?? []).map(l => ({
        level: (l as any).level,
        rise_pct: Number((l as any).rise_pct ?? 0),
        price: Number((l as any).price),
        sell_tokens: (l as any).sell_tokens ?? null,
        sell_pct_of_remaining: (l as any).sell_pct_of_remaining ?? null,
      }))
    },
    { revalidateOnFocus: true, dedupingInterval: 8000 }
  )

  // Sell trades (for progress)
  const { data: sells, mutate: mutateSells } = useSWR<SellTradeType[]>(
    user && planner ? ['/sell-planner/sells', planner.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,trade_time,user_id,coingecko_id,sell_planner_id,side')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'sell')
        .eq('sell_planner_id', planner!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map(t => ({
        price: Number((t as any).price),
        quantity: Number((t as any).quantity),
        trade_time: (t as any).trade_time,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Active Buy Planner (for live baseline)
  const { data: buyPlanner } = useSWR<ActiveBuyPlanner | null>(
    user ? ['/buy-planner/for-sell', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select('id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,started_at,is_active')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', true)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as ActiveBuyPlanner) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Buy trades (for live baseline)
  const { data: buysRaw, mutate: mutateBuys } = useSWR<any[] | null>(
    user && buyPlanner?.id
      ? ['/trades/buys/by-planner-for-sell', user.id, coingeckoId, buyPlanner.id]
      : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,fee,trade_time,side,buy_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'buy')
        .eq('buy_planner_id', buyPlanner!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: true, dedupingInterval: 8000 }
  )

  const buys: BuyTradeType[] = useMemo(
    () =>
      (buysRaw ?? []).map((t: any) => ({
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: Number(t.fee ?? 0),
        trade_time: t.trade_time as string,
      })),
    [buysRaw]
  )

  // Live baseline (strict on-plan avg)
  const liveBaseline = useMemo(() => {
    if (!buyPlanner) return 0
    const top = Number(buyPlanner.top_price || 0)
    const budget = Number(buyPlanner.budget_usd ?? buyPlanner.total_budget ?? 0)
    const depth = (Number(buyPlanner.ladder_depth || 70) === 90 ? 90 : 70) as 70 | 90
    const growth = Number(buyPlanner.growth_per_level ?? 25)
    const blvls: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)
    if (!blvls.length || !buys.length) return 0

    const fills = computeBuyFills(blvls, buys, 0)

    const sumUsd = fills.allocatedUsd.reduce((s, v) => s + v, 0)
    const sumTokens = blvls.reduce((acc, lv, i) => {
      const usd = fills.allocatedUsd[i] ?? 0
      return acc + (usd > 0 ? usd / lv.price : 0)
    }, 0)

    return sumTokens > 0 ? (sumUsd / sumTokens) : 0
  }, [buyPlanner?.id, buys])

  // Baseline: locked avg if present, else live baseline
  const baseline = useMemo(() => {
    const locked = Number(planner?.avg_lock_price ?? 0)
    return locked > 0 ? locked : Number(liveBaseline || 0)
  }, [planner?.avg_lock_price, liveBaseline])

  // Rows with target price (dynamic when active & unlocked)
  const rows = useMemo(() => {
    const lvl = levels ?? []
    const activeUnlocked = !!planner?.is_active && !planner?.avg_lock_price
    return lvl.map(r => {
      const targetPrice = (activeUnlocked && baseline > 0)
        ? Number((baseline * (1 + Number(r.rise_pct) / 100)).toFixed(8))
        : Number(r.price)
      return {
        ...r,
        targetPrice,
        plannedTokens: Math.max(0, Number(r.sell_tokens ?? 0)),
      }
    })
  }, [levels, baseline, planner?.is_active, planner?.avg_lock_price])

  // Waterfall allocation for SELL progress
  const sellFill = useMemo(() => {
    if (!rows.length || !(sells?.length)) {
      return {
        allocatedTokens: rows.map(() => 0),
        fillPct: rows.map(() => 0),
        allocatedUsd: rows.map(() => 0),
        offPlanTokens: 0,
        offPlanUsd: 0,
      }
    }
    const lvls = rows.map(r => ({
      target_price: r.targetPrice,
      planned_tokens: r.plannedTokens,
    }))
    return computeSellFills(lvls, sells, SELL_TOLERANCE)
  }, [rows, sells])

  // Build view for UI
  const view = useMemo(() => {
    return rows.map((row, i) => {
      const fillTokens = Number(sellFill.allocatedTokens[i] ?? 0)
      const pct = row.plannedTokens > 0 ? Math.min(1, fillTokens / row.plannedTokens) : 0
      const plannedUsd = row.plannedTokens * row.targetPrice
      const fillUsd = fillTokens * row.targetPrice
      const missingTokens = Math.max(0, row.plannedTokens - fillTokens)
      return { ...row, fillTokens, pct, plannedUsd, fillUsd, missingTokens }
    })
  }, [rows, sellFill])

  // Realtime updates
  useEffect(() => {
    if (!user) return
    const ch = supabaseBrowser
      .channel(`sell_planner_${user.id}_${coingeckoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sell_planners' }, (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId) {
          mutatePlanner()
          mutateLevels()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sell_levels' }, (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId) {
          mutateLevels()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId) {
          if (row?.side === 'sell') mutateSells()
          if (row?.side === 'buy')  mutateBuys()
        }
      })
      .subscribe()

    return () => { supabaseBrowser.removeChannel(ch) }
  }, [user?.id, coingeckoId, mutatePlanner, mutateLevels, mutateSells, mutateBuys])

  // Totals
  const totalPlannedTokens = useMemo(() => view.reduce((s, r) => s + r.plannedTokens, 0), [view])
  const totalPlannedUsd    = useMemo(() => view.reduce((s, r) => s + r.plannedUsd, 0), [view])
  const totalMissingTokens = useMemo(() => view.reduce((s, r) => s + r.missingTokens, 0), [view])

  if (!planner) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="text-base text-slate-300 mb-1">Sell Planner</div>
        <div className="text-sm text-slate-500">No active Sell Planner for this coin.</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-base text-slate-300">Sell Planner Levels</div>
        <div className="text-sm text-slate-400">
          Baseline: {baseline > 0 ? fmtCurrency(baseline) : '—'}
          {planner.avg_lock_price ? (
            <span className="ml-1 text-amber-300/80 text-[11px]">(locked)</span>
          ) : baseline > 0 ? (
            <span className="ml-1 text-green-300/80 text-[11px]">(live)</span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm text-slate-300">
          <thead className="text-slate-400">
            <tr>
              <th className="w-1/6 px-3 py-2">Lvl</th>
              <th className="w-1/6 px-3 py-2">Target Price</th>
              <th className="w-1/6 px-3 py-2">Planned Tokens</th>
              <th className="w-1/6 px-3 py-2">Planned USD</th>
              <th className="w-1/6 px-3 py-2">Missing Tokens</th>
              <th className="w-1/6 px-3 py-2 text-right">Progress</th>
            </tr>
          </thead>
          <tbody>
            {view.map(row => {
              const full = row.missingTokens <= EPS
              const nearOrCross =
                Number.isFinite(livePrice as any) &&
                (
                  Math.abs((livePrice as number) - Number(row.targetPrice)) / Number(row.targetPrice) <= SELL_TOLERANCE ||
                  (livePrice as number) >= Number(row.targetPrice)
                )
              const rowCls = full ? 'text-emerald-400' : nearOrCross ? 'text-yellow-300' : ''

              return (
                <tr key={row.level} className={`border-t border-slate-800/40 align-middle ${rowCls}`}>
                  <td className="px-3 py-2">{row.level}</td>
                  <td className="px-3 py-2">{fmtCurrency(row.targetPrice)}</td>
                  <td className="px-3 py-2">{row.plannedTokens.toFixed(6)}</td>
                  <td className="px-3 py-2">{fmtCurrency(row.plannedUsd)}</td>
                  <td className="px-3 py-2">{row.missingTokens.toFixed(6)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end items-center gap-2">
                      <div className="w-40">
                        <ProgressBar pct={row.pct} />
                      </div>
                      <span className="w-10 text-right tabular-nums">
                        {Math.round(row.pct * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-800/40">
              <td className="px-3 py-2" />
              <td className="px-3 py-2 font-medium">Totals</td>
              <td className="px-3 py-2">{totalPlannedTokens.toFixed(6)}</td>
              <td className="px-3 py-2">{fmtCurrency(totalPlannedUsd)}</td>
              <td className="px-3 py-2">{totalMissingTokens.toFixed(6)}</td>
              <td className="px-3 py-2 text-right text-slate-400">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

