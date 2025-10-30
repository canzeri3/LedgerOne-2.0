'use client'

import { useEffect, useMemo, useState } from 'react'
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

const SHOW_DEBUG = true // set false to hide
const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

function toNumberLoose(x: unknown): number | null {
  if (x == null) return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x === 'string') {
    const cleaned = x.replace(/[,$\s]/g, '')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export default function BuyPlannerCard({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const [err, setErr] = useState<string | null>(null)

  // Load active buy planner config for this coin
  const { data: planner } = useSWR<ActiveBuyPlanner | null>(
    user && coingeckoId ? ['/buy-planner/active', user.id, coingeckoId] : null,
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

  // Build plan levels from planner settings
  const plan: BuyLevel[] = useMemo(() => {
    if (!planner) return []
    const top = Number(planner.top_price || 0)
    const budget = Number(planner.budget_usd ?? planner.total_budget ?? 0)
    const depth = (Number(planner.ladder_depth || 70) === 90 ? 90 : 70) as 70 | 90
    const growth = Number(planner.growth_per_level ?? 25)
    return buildBuyLevels(top, budget, depth, growth)
  }, [planner?.id])

  // Load BUY trades tagged to this active buy planner
  const { data: buysRaw } = useSWR<any[] | null>(
    user && planner?.id
      ? ['/trades/buys/by-planner', user.id, coingeckoId, planner.id]
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

  // STRICT waterfall: tolerance = 0 means "above a level never counts"
  const fills = useMemo(() => computeBuyFills(plan, buys, 0), [plan, buys])

  // DEBUG: compute eligible band per trade (price-desc shallow→deep)
  const debugBands = useMemo(() => {
    if (!SHOW_DEBUG) return []
    const order = plan
      .map((lv, i) => ({ i, p: Number(lv.price), lvl: lv.level }))
      .sort((a, b) => b.p - a.p)
    return buys.map(b => {
      const P = Number(b.price)
      let deepest = -1
      for (let k = 0; k < order.length; k++) {
        if (P <= order[k].p) deepest = k
      }
      const band = deepest >= 0
        ? order.slice(0, deepest + 1).map(o => ({ level: plan[o.i].level, price: plan[o.i].price }))
        : []
      return { price: P, eligible: band }
    })
  }, [plan, buys])

  useEffect(() => setErr(null), [coingeckoId, planner?.id])

  const plannedTotal = useMemo(
    () => plan.reduce((s, lv) => s + (lv.allocation || 0), 0),
    [plan]
  )

  /* --------------------------- LIVE PRICE HIGHLIGHT --------------------------- */
  // Primary: live price endpoint
  const { data: priceResp } = useSWR<any>(
    coingeckoId ? `/api/price/${coingeckoId}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  // Fallback: last point from 24h history if price is missing/unparsable
  const { data: histRaw } = useSWR<any>(
    coingeckoId ? `/api/coin-history?id=${encodeURIComponent(coingeckoId)}&days=1` : null,
    fetcher,
    { refreshInterval: 120_000 }
  )

  const histLatest: number | null = useMemo(() => {
    if (!histRaw) return null
    // Accept either [{t,v}] or {prices:[[t,p],...]} or [[t,p],...]
    if (Array.isArray(histRaw?.prices) && histRaw.prices.length) {
      const last = histRaw.prices[histRaw.prices.length - 1]
      return toNumberLoose(Array.isArray(last) ? last[1] : (last?.[1] ?? null))
    }
    if (Array.isArray(histRaw) && histRaw.length) {
      const last = histRaw[histRaw.length - 1]
      if (Array.isArray(last)) return toNumberLoose(last[1])
      if (last && typeof last === 'object') return toNumberLoose((last as any).v ?? (last as any).price ?? (last as any).p)
    }
    if (histRaw && typeof histRaw === 'object' && 'v' in histRaw) {
      return toNumberLoose((histRaw as any).v)
    }
    return null
  }, [histRaw])

  const livePrice = useMemo(() => {
    const primary = toNumberLoose(priceResp?.price ?? priceResp?.usd ?? priceResp)
    return primary ?? histLatest ?? null
  }, [priceResp, histLatest])

  const hasLivePrice = livePrice != null && Number.isFinite(livePrice)

  // BUY rule: highlight when within ±3% OR price <= level
  const shouldHighlightBuy = (level: number, price: number) => {
    if (!Number.isFinite(level) || !Number.isFinite(price) || level <= 0) return false
    const within = Math.abs(price - level) / level <= 0.03
    const crossed = price <= level
    return within || crossed
  }
  /* --------------------------------------------------------------------------- */

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
      <div className="mb-2 text-sm text-slate-300">Buy Planner</div>

      {!planner ? (
        <div className="text-xs text-slate-400">No active Buy planner.</div>
      ) : (
        <>
          <div className="mb-3 text-xs text-slate-400">
            Top {fmtCurrency(Number(planner.top_price ?? 0))} · Budget{' '}
            {fmtCurrency(Number(planner.budget_usd ?? planner.total_budget ?? 0))}{' '}
            · Depth {String(planner.ladder_depth || 70)}% · Growth x
            {String(planner.growth_per_level ?? 1.25)}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-300">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1">Lvl</th>
                  <th className="px-2 py-1">Price</th>
                  <th className="px-2 py-1">Planned USD</th>
                  <th className="px-2 py-1">Fill USD</th>
                  <th className="px-2 py-1">Fill %</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((lv, i) => {
                  const levelPrice = Number(lv.price)
                  const highlight = hasLivePrice && shouldHighlightBuy(levelPrice, livePrice as number)
                  const rowCls = highlight ? 'text-[rgb(207,180,45)]' : ''
                  const td = (base: string) => `${base}${highlight ? ' text-[rgb(207,180,45)]' : ''}`                  
                  return (
                    <tr key={lv.level} className={`border-t border-slate-800/40 ${rowCls}`}>
                      <td className={td('px-2 py-1')}>{lv.level}</td>
                      <td className={td('px-2 py-1')}>{fmtCurrency(lv.price)}</td>
                      <td className={td('px-2 py-1')}>{fmtCurrency(lv.allocation)}</td>
                      <td className={td('px-2 py-1')}>{fmtCurrency(fills.allocatedUsd[i] ?? 0)}</td>
                      <td className={td('px-2 py-1')}>{Math.round((fills.fillPct[i] ?? 0) * 100)}%</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-800/40">
                  <td className="px-2 py-1" />
                  <td className="px-2 py-1 font-medium">Totals</td>
                  <td className="px-2 py-1">{fmtCurrency(plannedTotal)}</td>
                  <td className="px-2 py-1">{fmtCurrency(fills.allocatedTotal)}</td>
                  <td className="px-2 py-1 text-slate-400">Off-plan: {fmtCurrency(fills.offPlanUsd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {SHOW_DEBUG && (
            <div className="mt-3 rounded-lg bg-slate-800/40 p-2 text-[11px] text-slate-300">
              <div className="mb-1 font-medium text-slate-200">Debug · Eligible band per BUY</div>
              {debugBands.length === 0 && <div className="text-slate-400">No buys.</div>}
              {debugBands.map((b, idx) => (
                <div key={idx} className="mb-1">
                  <span className="text-slate-400">Trade {idx + 1} @ </span>
                  <span>{fmtCurrency(b.price)}</span>
                  <span className="text-slate-400"> → eligible levels: </span>
                  <span>
                    {b.eligible.map(el => `L${el.level}(${fmtCurrency(el.price)})`).join(', ') || '— none —'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {err && <div className="mt-2 text-xs text-red-300">{err}</div>}
    </div>
  )
}

