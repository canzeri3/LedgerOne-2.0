// src/components/planner/BuyPlannerLadder.tsx
'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import {
  buildBuyLevels,
  computeBuyFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'
import { fmtCurrency } from '@/lib/format'
import ProgressBar from '@/components/common/ProgressBar'

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

export default function BuyPlannerLadder({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()

  // Active Buy planner for this coin
  const { data: planner } = useSWR<ActiveBuyPlanner | null>(
    user && coingeckoId ? ['/buy-planner/active-ladder', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select(
          'id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,started_at,is_active'
        )
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

  // Build planned levels from planner settings
  const plan: BuyLevel[] = useMemo(() => {
    if (!planner) return []
    const top = Number(planner.top_price || 0)
    const budget = Number(planner.budget_usd ?? planner.total_budget ?? 0)
    const depth = (Number(planner.ladder_depth || 70) === 90 ? 90 : 70) as 70 | 90
    const growth = Number(planner.growth_per_level ?? 25)
    return buildBuyLevels(top, budget, depth, growth)
  }, [planner?.id])

  // BUY trades tied to this active Buy planner (chronological)
  const { data: buysRaw } = useSWR<any[] | null>(
    user && planner?.id
      ? ['/trades/buys/for-ladder', user.id, coingeckoId, planner.id]
      : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,fee,trade_time,side,buy_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'buy')
        .eq('buy_planner_id', planner!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  )

  const buys: BuyTrade[] = useMemo(
    () =>
      (buysRaw ?? []).map((t: any) => ({
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: Number(t.fee ?? 0),
        trade_time: t.trade_time as string,
      })),
    [buysRaw]
  )

  // STRICT waterfall: tolerance = 0 → “above a level never counts”
  const fills = useMemo(() => computeBuyFills(plan, buys, 0), [plan, buys])

  // Totals (keep hooks before any return)
  const plannedTotalUsd = useMemo(
    () => plan.reduce((s, lv) => s + (lv.allocation || 0), 0),
    [plan]
  )

  const plannedTotalTokens = useMemo(
    () => plan.reduce((s, lv) => s + (lv.est_tokens || 0), 0),
    [plan]
  )

  // Avg (live): on-plan average buy price = ΣallocatedUSD / ΣtokensFromAllocatedUSD
  const liveAvgPrice = useMemo(() => {
    if (!plan.length) return 0
    const sumUsd = (fills.allocatedUsd ?? []).reduce((s, v) => s + (v || 0), 0)
    if (sumUsd <= 0) return 0
    const sumTokens = plan.reduce((acc, lv, i) => {
      const usd = fills.allocatedUsd[i] ?? 0
      return acc + (usd > 0 ? usd / lv.price : 0)
    }, 0)
    return sumTokens > 0 ? sumUsd / sumTokens : 0
  }, [plan, fills])

  if (!planner) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="text-base text-slate-300 mb-1">Buy Planner</div>
        <div className="text-sm text-slate-500">No active Buy Planner for this coin.</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-base text-slate-300">Buy Planner Levels</div>
        <div className="text-sm text-slate-400">
          Avg (live): {liveAvgPrice > 0 ? fmtCurrency(liveAvgPrice) : '—'}
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
              <th className="w-1/6 px-3 py-2">Missing USD</th>
              <th className="w-1/6 px-3 py-2 text-right">Progress</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((lv, i) => {
              const plannedUsd = lv.allocation ?? 0
              const filledUsd  = fills.allocatedUsd[i] ?? 0
              const missingUsd = Math.max(0, plannedUsd - filledUsd)
              const plannedTokens = lv.est_tokens ?? (lv.price > 0 ? plannedUsd / lv.price : 0)
              const pct = plannedUsd > 0 ? Math.min(1, filledUsd / plannedUsd) : 0

              return (
                <tr key={lv.level} className="border-t border-slate-800/40 align-middle">
                  <td className="px-3 py-2">{lv.level}</td>
                  <td className="px-3 py-2">{fmtCurrency(lv.price)}</td>
                  <td className="px-3 py-2">{Number(plannedTokens).toFixed(6)}</td>
                  <td className="px-3 py-2">{fmtCurrency(plannedUsd)}</td>
                  <td className="px-3 py-2">{fmtCurrency(missingUsd)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end items-center gap-3">
                      <div className="w-48">
                        <ProgressBar pct={pct} />
                      </div>
                      <span className="w-12 text-right tabular-nums">
                        {Math.round(pct * 100)}%
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
              <td className="px-3 py-2">{Number(plannedTotalTokens).toFixed(6)}</td>
              <td className="px-3 py-2">{fmtCurrency(plannedTotalUsd)}</td>
              <td className="px-3 py-2">
                {fmtCurrency(Math.max(0, plannedTotalUsd - (fills.allocatedTotal ?? 0)))}
              </td>
              <td className="px-3 py-2 text-right text-slate-400">
                Off-plan: {fmtCurrency(fills.offPlanUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

