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

  // Always call hooks; useSWR can take a null key safely.
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

  // Planned levels from planner config (do not use legacy makeLevels)
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

  // Compute totals BEFORE any return so hooks order is stable.
  const plannedTotal = useMemo(
    () => plan.reduce((s, lv) => s + (lv.allocation || 0), 0),
    [plan]
  )

  // Render
  if (!planner) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
        <div className="text-sm text-slate-300 mb-1">Buy Planner</div>
        <div className="text-xs text-slate-500">No active Buy Planner for this coin.</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
      <div className="text-sm text-slate-300">Buy Planner Levels</div>

      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-xs text-slate-300">
          <thead className="text-slate-400">
            <tr>
              <th className="px-2 py-1">Lvl</th>
              <th className="px-2 py-1">Target Price</th>
              <th className="px-2 py-1">Planned USD</th>
              <th className="px-2 py-1">Filled USD</th>
              <th className="px-2 py-1">Fill %</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((lv, i) => (
              <tr key={lv.level} className="border-t border-slate-800/40">
                <td className="px-2 py-1">{lv.level}</td>
                <td className="px-2 py-1">{fmtCurrency(lv.price)}</td>
                <td className="px-2 py-1">{fmtCurrency(lv.allocation)}</td>
                <td className="px-2 py-1">{fmtCurrency(fills.allocatedUsd[i] ?? 0)}</td>
                <td className="px-2 py-1">
                  {Math.round((fills.fillPct[i] ?? 0) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-800/40">
              <td className="px-2 py-1" />
              <td className="px-2 py-1 font-medium">Totals</td>
              <td className="px-2 py-1">{fmtCurrency(plannedTotal)}</td>
              <td className="px-2 py-1">{fmtCurrency(fills.allocatedTotal)}</td>
              <td className="px-2 py-1 text-slate-400">
                Off-plan: {fmtCurrency(fills.offPlanUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

