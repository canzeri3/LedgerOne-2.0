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
import { useLivePrice } from '@/lib/useLivePrice' // live price hook

type ActiveBuyPlanner = {
  id: string
  user_id: string
  coingecko_id: string
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
  const { price: livePrice } = useLivePrice(coingeckoId, 15000)

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
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const buys: BuyTrade[] = useMemo(() => {
    const rows = buysRaw ?? []
    return rows.map((r: any) => ({
      price: Number(r.price),
      quantity: Number(r.quantity),
      fee: r.fee ? Number(r.fee) : 0,
      trade_time: r.trade_time,
    }))
  }, [buysRaw])

  // Compute fills (allocated USD per level)
  const fills = useMemo(() => {
    return computeBuyFills(plan, buys, 0)
  }, [JSON.stringify(plan), JSON.stringify(buys)])

  // Live avg price (only for header display) – kept (no header visible now)
  const liveAvgPrice = useMemo(() => {
    const allocated = fills.allocatedUsd ?? []
    const sumUsd = allocated.reduce((s, v) => s + v, 0)
    const sumTokens = plan.reduce((acc, lv, i) => {
      const usd = allocated[i] ?? 0
      return acc + (lv.price > 0 ? usd / lv.price : 0)
    }, 0)
    return sumTokens > 0 ? sumUsd / sumTokens : 0
  }, [fills, plan])

  // Helper (kept as-is even if unused elsewhere)
  const shouldHighlightBuy = (level: number, price: number) => {
    if (!Number.isFinite(level) || !Number.isFinite(price) || level <= 0) return false
    const within = Math.abs(price - level) / level <= 0.03 // ±3%
    const crossed = price <= level                         // reached or under
    return within || crossed
  }

  const EPS = 1e-8

  /* ---------- Off-Plan tokens (unchanged) ---------- */
  const offPlanTokens = useMemo(() => {
    const totalBoughtTokens = (buys ?? []).reduce((s, tr) => s + Number(tr.quantity || 0), 0)
    const allocatedUsd = fills?.allocatedUsd ?? []
    const allocatedTokensSum = plan.reduce((s, lv, i) => {
      const usd = allocatedUsd[i] ?? 0
      return s + (lv.price > 0 ? usd / lv.price : 0)
    }, 0)
    const diff = totalBoughtTokens - allocatedTokensSum
    return diff > 0 ? diff : 0
  }, [JSON.stringify(buys), JSON.stringify(fills?.allocatedUsd), JSON.stringify(plan)])

  return (
    // Full-bleed inner card: fill parent width/height; keep requested bg color
    <div className="w-full h-full bg-[rgb(28,29,31)]">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm text-slate-300">
          <thead className="text-[rgba(237, 237, 237, 1)]">

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

              // GREEN when ≥98% filled
              const full = plannedUsd > 0 && (missingUsd <= (plannedUsd * 0.02 + EPS))

              // YELLOW when live price is <= the BUY level
              const hasLivePrice = Number.isFinite(livePrice as number) && (livePrice as number) > 0
              const yellow =
                !full &&
                hasLivePrice &&
                Number(lv.price) > 0 &&
                ((livePrice as number) <= Number(lv.price))

                const rowCls = full ? 'text-[rgb(115,171,84)]' : yellow ? 'text-[rgb(207,180,45)]' : ''

              return (
                <tr key={lv.level} className={`border-t border-[rgb(51,52,54)] align-middle ${rowCls}`}>
                  <td className="px-3 py-2">{lv.level}</td>
                  <td className="px-3 py-2">{fmtCurrency(lv.price)}</td>
                  <td className="px-3 py-2">{Number(plannedTokens).toFixed(6)}</td>
                  <td className="px-3 py-2">{fmtCurrency(plannedUsd)}</td>
                  <td className="px-3 py-2">{fmtCurrency(missingUsd)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end items-center gap-2">
                      <div className="w-40"><ProgressBar pct={pct} /></div>
                      <span className="w-10 text-right tabular-nums">{Math.round(pct * 100)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
          <tr className="border-t border-[rgb(51,52,54)]">
              <td className="px-3 py-2" />
              <td className="px-3 py-2 font-medium">Totals</td>
              <td className="px-3 py-2">
                {(() => {
                  const totalTokens = plan.reduce((acc, lv) => {
                    const plannedUsd = lv.allocation ?? 0
                    return acc + (lv.price > 0 ? plannedUsd / lv.price : 0)
                  }, 0)
                  return Number(totalTokens).toFixed(6)
                })()}
              </td>
              <td className="px-3 py-2">
                {fmtCurrency(plan.reduce((s, lv) => s + (lv.allocation ?? 0), 0))}
              </td>
              <td className="px-3 py-2">
                {fmtCurrency(Math.max(0, plan.reduce((s, lv) => s + (lv.allocation ?? 0), 0) - (fills.allocatedTotal ?? 0)))}
              </td>
              <td className="px-3 py-2 text-right">
                {/* Compact Off-Plan (tokens / USD) — matches Sell planner UI */}
                <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-amber-300">Off-Plan</span>
                  <span className="tabular-nums">{offPlanTokens.toFixed(6)}</span>
                  <span className="text-slate-600">/</span>
                  <span className="tabular-nums">{fmtCurrency(Number(fills.offPlanUsd || 0))}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
