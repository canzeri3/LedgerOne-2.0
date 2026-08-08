'use client'

import { useMemo, useEffect } from 'react'
import { Layers, Target, Coins, DollarSign, TrendingUp } from 'lucide-react'

import useSWR, { mutate as globalMutate } from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import {
  buildBuyLevels,
  computeBuyFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'
import { fmtCurrency } from '@/lib/format'
import { usePrice } from '@/lib/dataCore'
import SlotPortal from '@/components/planner/SlotPortal'
import PlannerActionAlert from '@/components/planner/PlannerActionAlert'

type ActiveBuyPlanner = {
  id: string
  user_id: string
  coingecko_id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: 70 | 75 | 90
  growth_per_level: number | null
  started_at: string | null
  is_active: boolean | null
}


export default function BuyPlannerLadder({
  coingeckoId,
  onAlertStateChange,
  showEmptyState = false,
}: {
  coingeckoId: string
  onAlertStateChange?: (hasAlert: boolean) => void
  showEmptyState?: boolean
}) {
  const { user, loading: userLoading } = useUser()

  // NEW: robust live price via data core (no legacy adapters)
  const { row: priceRow } = usePrice(coingeckoId, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })
  const livePrice = priceRow?.price ?? null

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

  // Ticker for the banner copy. Coin metadata (not market data), so it reads
  // from the coins table the same way the reports page does.
  const { data: coinSymbol } = useSWR<string | null>(
    coingeckoId ? ['/buy-planner/coin-symbol', coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('coins')
        .select('symbol')
        .eq('coingecko_id', coingeckoId)
        .maybeSingle()
      if (error) throw error
      return ((data?.symbol as string | undefined) ?? '').toUpperCase() || null
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

// Build planned levels from planner settings
const plan: BuyLevel[] = useMemo(() => {
  if (!planner) return []
  const top = Number(planner.top_price || 0)
  const budget = Number(planner.budget_usd ?? planner.total_budget ?? 0)

  const depthNum = Number(planner.ladder_depth || 70)
  const depth = (depthNum === 90
    ? 90
    : depthNum === 75
      ? 75
      : 70) as 70 | 75 | 90

  const growth = Number(planner.growth_per_level ?? 1.25)
  return buildBuyLevels(top, budget, depth, growth)
}, [
  planner?.id,
  planner?.top_price,
  planner?.budget_usd,
  planner?.total_budget,
  planner?.ladder_depth,
  planner?.growth_per_level,
])


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

  // Auto-refresh when a trade is added (or a planner is regenerated). TradesPanel
  // fires 'buyPlannerUpdated'/'sellPlannerUpdated' after every Add Trade; mirror
  // the SellPlannerLadder so the buy ladder re-reads its planner + fills at once.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bump = (e: any) => {
      const detailCoin = e?.detail?.coinId
      if (detailCoin && detailCoin !== coingeckoId) return
      if (!user) return
      globalMutate(['/buy-planner/active-ladder', user.id, coingeckoId])
      if (planner?.id) {
        globalMutate(['/trades/buys/for-ladder', user.id, coingeckoId, planner.id])
      }
    }
    window.addEventListener('buyPlannerUpdated', bump)
    window.addEventListener('sellPlannerUpdated', bump)
    return () => {
      window.removeEventListener('buyPlannerUpdated', bump)
      window.removeEventListener('sellPlannerUpdated', bump)
    }
  }, [user?.id, coingeckoId, planner?.id])

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

    // Avg cost + Off-Plan tokens must reflect the SAME trade slices used by the
  // fill engine (computeBuyFills). Otherwise, the UI can show an average that
  // appears to violate the plan even when the fill engine correctly capped it.
  const allocSummary = useMemo(() => {
    const trades = buys ?? []

    let totalTokens = 0
    for (const tr of trades) {
      const qty = Number(tr.quantity || 0)
      const price = Number(tr.price || 0)
      if (!(qty > 0) || !(price > 0)) continue
      totalTokens += qty
    }

    const onPlanAvgCost = Number(fills?.onPlanAvgCost ?? 0)
    const onPlanTokens = Number(fills?.onPlanTokens ?? 0)

    let offPlanTokens = totalTokens - onPlanTokens
    if (offPlanTokens < 1e-8) offPlanTokens = 0

    return { onPlanAvgCost, offPlanTokens }
  }, [JSON.stringify(buys), fills?.onPlanAvgCost, fills?.onPlanTokens])

  const onPlanAvgCost = allocSummary.onPlanAvgCost
  const offPlanTokens = allocSummary.offPlanTokens

  const EPS = 1e-8

  const actionableNow = useMemo(() => {
    const empty = {
      alertRows: 0,
      remainingCoins: 0,
      remainingUsd: 0,
      lowestAlertPrice: null as number | null,
      actionablePrice: null as number | null,
    }

    if (!plan.length) return empty

    const hasLivePrice = Number.isFinite(livePrice as number) && (livePrice as number) > 0
    if (!hasLivePrice) return empty

    const summary = plan.reduce(
      (acc, lv, i) => {
        const plannedUsd = Number(lv.allocation ?? 0)
        const filledUsd = Number(fills.allocatedUsd[i] ?? 0)
        const missingUsd = Math.max(0, plannedUsd - filledUsd)
        const levelPrice = Number(lv.price ?? 0)

        // Keep summary state aligned with the table's existing row logic.
        const full = plannedUsd > 0 && (missingUsd <= (plannedUsd * 0.02 + EPS))
        const yellow =
          !full &&
          levelPrice > 0 &&
          (livePrice as number) <= levelPrice * 1.015

        if (!yellow || missingUsd <= EPS) return acc

        acc.alertRows += 1
        acc.remainingUsd += missingUsd
        acc.remainingCoins += levelPrice > 0 ? (missingUsd / levelPrice) : 0

        if (acc.lowestAlertPrice === null || levelPrice < acc.lowestAlertPrice) {
          acc.lowestAlertPrice = levelPrice
        }

        return acc
      },
      {
        alertRows: 0,
        remainingCoins: 0,
        remainingUsd: 0,
        lowestAlertPrice: null as number | null,
      }
    )

    // Price to quote in the banner: the one you'd actually pay right now. The
    // alert band allows live up to 1.5% above a level, so only clamp downward —
    // if the market has fallen below the lowest alerting level, the same budget
    // buys more tokens at the live price.
    const actionablePrice =
      summary.lowestAlertPrice === null
        ? null
        : Math.min(summary.lowestAlertPrice, livePrice as number)

    return { ...summary, actionablePrice }
  }, [plan, fills.allocatedUsd, livePrice])

  const hasActionableAlert = actionableNow.alertRows > 0

  useEffect(() => {
    onAlertStateChange?.(hasActionableAlert)
  }, [hasActionableAlert, onAlertStateChange])

  const hasNoPlanner = !userLoading && (user ? planner === null : true)

  if (showEmptyState && hasNoPlanner) {
    return (
      <div
        role="status"
        className="flex min-h-[190px] w-full flex-col items-center justify-center px-7 py-12 text-center"
      >
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(56,58,64)] bg-[rgb(27,28,31)] text-slate-500">
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-slate-200">
          No active Buy Planner
        </h3>
        <p className="mt-1.5 max-w-[270px] text-[13px] leading-5 text-slate-500">
          Create a Buy Planner to see its planned levels here.
        </p>
      </div>
    )
  }

  return (
    // Full-bleed inner card: fill parent width/height (skin: transparent, panel provides surface)
    <div className="w-full h-full">
      {/* Panel-head stat pills (display-only; values already computed above) */}
      <SlotPortal slotId="buy-phead-stats">
        <div className="pl-stat">
          <span className="l">Bought</span>
          <span className="v">{fmtCurrency(Number(fills.allocatedTotal ?? 0))}</span>
        </div>
        <div className="pl-stat key">
          <span className="l">Avg entry</span>
          <span className="v">{onPlanAvgCost > 0 ? fmtCurrency(onPlanAvgCost) : '—'}</span>
        </div>
      </SlotPortal>

      {/* Panel-foot meta line (display-only) */}
      {plan.length > 0 && (
        <SlotPortal slotId="buy-foot-meta">
          <div className="meta">
            Deploys <b>{fmtCurrency(plan.reduce((s, lv) => s + (lv.allocation ?? 0), 0))}</b> across{' '}
            <b>{plan.length}</b> limit buys ·{' '}
            <b>
              {fmtCurrency(
                Math.max(
                  0,
                  plan.reduce((s, lv) => s + (lv.allocation ?? 0), 0) - (fills.allocatedTotal ?? 0)
                )
              )}
            </b>{' '}
            missing.
          </div>
        </SlotPortal>
      )}

      {actionableNow.alertRows > 0 && (
        <PlannerActionAlert
          action="buy"
          rows={actionableNow.alertRows}
          quantity={fmtCurrency(actionableNow.remainingUsd)}
          symbol={coinSymbol}
          price={
            actionableNow.actionablePrice !== null
              ? fmtCurrency(actionableNow.actionablePrice)
              : null
          }
        />
      )}

      <div className="pl-ladder">
        <div className="ldr-scroll">
          <table className="ldr" data-buy-planner>
            <thead>
              <tr>
                <th>
                  <span className="th-l">
                    Lvl <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
                <th>
                  <span className="th-l">
                    Target <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
                <th className="!text-right">
                  <span className="th-l !justify-end">
                    Planned <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
                <th className="!text-right">
                  <span className="th-l !justify-end">
                    Planned <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
                <th className="!text-right">
                  <span className="th-l !justify-end">
                    Missing <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
                <th className="r">
                  <span className="th-l">
                    Progress <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.map((lv, i) => {
                const plannedUsd = lv.allocation ?? 0
                const filledUsd  = fills.allocatedUsd[i] ?? 0
                const missingUsd = Math.max(0, plannedUsd - filledUsd)
                const plannedTokens = lv.est_tokens ?? (lv.price > 0 ? plannedUsd / lv.price : 0)
                const pct = plannedUsd > 0 ? Math.min(1, filledUsd / plannedUsd) : 0

                // Display rule:
                // - Green can still trigger at ≥98% filled (see `full` below)
                // - But the label should only show 100% when truly fully filled (missing ~ $0)
                const fullyFilled = plannedUsd > 0 && (missingUsd <= (0.005 + EPS)) // ~half-cent tolerance
                const pctLabel =
                  plannedUsd > 0
                    ? (fullyFilled ? 100 : Math.min(99, Math.round(pct * 100)))
                    : 0

                // GREEN when ≥98% filled
                const full = plannedUsd > 0 && (missingUsd <= (plannedUsd * 0.02 + EPS))

                // YELLOW when live price is <= the BUY level,
                // plus a small 1.5% buffer above the level.
                const hasLivePrice = Number.isFinite(livePrice as number) && (livePrice as number) > 0
                const yellow =
                  !full &&
                  hasLivePrice &&
                  Number(lv.price) > 0 &&
                  (livePrice as number) <= Number(lv.price) * 1.015

                const rowCls = full ? 'done' : yellow ? 'alert' : ''

                return (
                  <tr key={lv.level} className={rowCls}>
                    <td className="lvl"><span className="ix">{lv.level}</span></td>
                    <td className="tgt">{fmtCurrency(lv.price)}</td>
                    <td className="num coins">{Number(plannedTokens).toFixed(6)}</td>
                    <td className="num amt">{fmtCurrency(plannedUsd)}</td>
                    <td className="num amt">{fmtCurrency(missingUsd)}</td>
                    <td>
                      <div className="ldr-prog">
                        <div className="ldr-prog-track">
                          <div
                            className="ldr-prog-fill"
                            style={{ width: `${(pct * 100).toFixed(2)}%` }}
                          />
                        </div>
                        <span className="ldr-prog-pct">{pctLabel}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td><span className="ft-lbl">Totals</span></td>
                <td className="num coins">
                  {(() => {
                    const totalTokens = plan.reduce((acc, lv) => {
                      const plannedUsd = lv.allocation ?? 0
                      return acc + (lv.price > 0 ? plannedUsd / lv.price : 0)
                    }, 0)
                    return Number(totalTokens).toFixed(6)
                  })()}
                </td>
                <td className="num amt">
                  {fmtCurrency(plan.reduce((s, lv) => s + (lv.allocation ?? 0), 0))}
                </td>
                <td className="num amt">
                  {fmtCurrency(Math.max(0, plan.reduce((s, lv) => s + (lv.allocation ?? 0), 0) - (fills.allocatedTotal ?? 0)))}
                </td>
                <td>
                  {/* Avg cost of ladder + compact Off-Plan (tokens / USD) — matches Sell planner UI */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="inline-flex items-center gap-2">
                      <span className="ft-lbl" style={{ margin: 0 }}>Avg cost</span>
                      <span className="ft-v">
                        {onPlanAvgCost > 0 ? fmtCurrency(onPlanAvgCost) : '—'}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <span className="ft-off" style={{ margin: 0 }}>Off-Plan</span>
                      <span className="ft-m">{offPlanTokens.toFixed(6)}</span>
                      <span className="ft-sep" style={{ margin: 0 }}>/</span>
                      <span className="ft-m">
                        {fmtCurrency(Number(fills.offPlanUsd || 0))}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
