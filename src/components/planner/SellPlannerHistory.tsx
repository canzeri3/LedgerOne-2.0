'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import { Layers, Target, Coins, DollarSign, TrendingUp, Zap } from 'lucide-react'
import { useLivePrice } from '@/lib/useLivePrice'
import { usePrice } from '@/lib/dataCore'
import {
  computeSellFills,
  type SellTrade as SellTradeType,
} from '@/lib/planner'

type FrozenSellPlanner = {
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
  rise_pct: number | null
  price: number | null
  sell_tokens: number | null
  sell_pct_of_remaining: number | null
  sell_planner_id: string
  user_id: string
  coingecko_id: string
}

type SellTrade = {
  id: string
  user_id: string
  coingecko_id: string
  quantity: number
  price: number
  fee: number
  trade_time: string
  is_buy: boolean
}

type ViewRow = {
  level: number
  targetPrice: number
  plannedTokens: number
  plannedUsd: number
  missingUsd: number
  pct: number
}

function num(n: any): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}
const EPS = 1e-8

export default function SellPlannerHistory({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  useLivePrice(coingeckoId, 15000)

  // NEW: live price from NEW data core (for row highlight)
  const { row: priceRow } = usePrice(coingeckoId, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })
  const livePrice = priceRow?.price ?? null

  // Frozen (history) planners for this coin
  const { data: planners } = useSWR<FrozenSellPlanner[]>(
    user ? ['/sell-history/planners', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,user_id,coingecko_id,is_active,avg_lock_price,created_at,frozen_at')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FrozenSellPlanner[]
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Levels grouped by planner id
  const { data: levelsByPlanner } = useSWR<Record<string, SellLevel[]>>(
    user && (planners?.length ?? 0) > 0 ? ['/sell-history/levels', user.id, coingeckoId] : null,
    async () => {
      const ids = (planners ?? []).map(p => p.id)
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,rise_pct,price,sell_tokens,sell_pct_of_remaining,sell_planner_id,user_id,coingecko_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .in('sell_planner_id', ids)
        .order('sell_planner_id', { ascending: false })
        .order('level', { ascending: true })
      if (error) throw error
      const by: Record<string, SellLevel[]> = {}
      ;(data ?? []).forEach((l: any) => {
        const k = l.sell_planner_id as string
        by[k] = by[k] || []
        by[k].push(l as SellLevel)
      })
      return by
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Sells grouped by planner id (only SELL side)
  const { data: sellsByPlanner } = useSWR<Record<string, SellTrade[]>>(
    user && (planners?.length ?? 0) > 0 ? ['/sell-history/sells', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('sell_planner_id,price,quantity,trade_time,side')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'sell')
        .order('trade_time', { ascending: true })
      if (error) throw error

      const by: Record<string, SellTrade[]> = {}
      for (const r of (data ?? [])) {
        if (!r.sell_planner_id) continue
        ;(by[r.sell_planner_id] || (by[r.sell_planner_id] = [])).push({
          id: '',
          user_id: user!.id,
          coingecko_id: coingeckoId,
          quantity: num(r.quantity),
          price: num(r.price),
          fee: 0,
          trade_time: r.trade_time,
          is_buy: false,
        } as SellTrade)
      }
      return by
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const views = useMemo(() => {
    if (!planners?.length) return []
    return (planners ?? []).map((p) => {
      const lvlList = levelsByPlanner?.[p.id] ?? []
      const lvls = lvlList.map(l => ({
        level: l.level,
        targetPrice: num(l.price),
        plannedTokens: Math.max(0, num(l.sell_tokens)),
      }))

      const sells = sellsByPlanner?.[p.id] ?? []

      // shape adapter for computeSellFills
      const { allocatedTokens, offPlanUsd } = computeSellFills(
        lvls.map(lv => ({ target_price: lv.targetPrice, planned_tokens: lv.plannedTokens })),
        sells
      )

      const rows: ViewRow[] = lvls.map((lv, i) => {
        const plannedTokens = lv.plannedTokens || 0
        const plannedUsd = plannedTokens * lv.targetPrice
        const filledTokens = allocatedTokens[i] ?? 0
        const missingTokens = Math.max(0, plannedTokens - filledTokens)
        const missingUsd = missingTokens * lv.targetPrice
        const pct = plannedTokens > 0 ? Math.min(1, filledTokens / plannedTokens) : 0
        return {
          level: lv.level,
          targetPrice: lv.targetPrice,
          plannedTokens,
          plannedUsd,
          missingUsd,
          pct,
        }
      })

      const totals = rows.reduce(
        (acc, r) => {
          return {
            plannedTokens: acc.plannedTokens + r.plannedTokens,
            plannedUsd: acc.plannedUsd + r.plannedUsd,
          }
        },
        { plannedTokens: 0, plannedUsd: 0 }
      )

      return { planner: p, rows, totals, offPlanUsd: num(offPlanUsd) }
    })
  }, [JSON.stringify(planners), JSON.stringify(levelsByPlanner), JSON.stringify(sellsByPlanner)])

  if (!views || !views.length) {
    return (
      <div className="w-full h-full">
        <div className="text-sm text-slate-500">No frozen planners yet.</div>
      </div>
    )
  }

   return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-auto space-y-6">
        {(views ?? []).map((v) => {
          const hasLive =
            Number.isFinite(livePrice as number) && (livePrice as number) > 0
          const live = hasLive ? (livePrice as number) : null

          const rows = v.rows ?? []

          const actionableNow = rows.reduce(
            (acc, r) => {
              const green = r.pct >= 0.98
              const yellow =
                !!live &&
                !green &&
                r.targetPrice > 0 &&
                (live as number) >= r.targetPrice * 0.985

              const missingTokens =
                r.targetPrice > 0
                  ? Math.max(0, r.missingUsd / r.targetPrice)
                  : 0

              if (!yellow || missingTokens <= 0) return acc

              acc.alertRows += 1
              acc.remainingTokens += missingTokens
              acc.remainingUsd += r.missingUsd

              if (acc.lowestAlertPrice === null || r.targetPrice < acc.lowestAlertPrice) {
                acc.lowestAlertPrice = r.targetPrice
              }

              return acc
            },
            {
              alertRows: 0,
              remainingTokens: 0,
              remainingUsd: 0,
              lowestAlertPrice: null as number | null,
            }
          )

          const plannerHasAlert = actionableNow.alertRows > 0

          return (
            <div
              key={v.planner.id}
              data-history-id={v.planner.id}
              data-has-alert={plannerHasAlert ? '1' : '0'}
              className="space-y-3"
            >
              {actionableNow.alertRows > 0 && (
                <div className="pl-banner">
                  <span className="dot" aria-hidden="true">
                    <Zap strokeWidth={2.5} />
                  </span>
                  <b className="alert-txt">Actionable now</b>

                  <span className="sep">·</span>

                  <span>
                    <b className="tabular-nums">{actionableNow.alertRows}</b>{' '}
                    {actionableNow.alertRows === 1 ? 'alert row' : 'alert rows'}
                  </span>

                  <span className="sep">·</span>

                  <span>
                    Sell <b className="tabular-nums">{actionableNow.remainingTokens.toFixed(6)}</b> coins
                  </span>

                  {actionableNow.lowestAlertPrice !== null && (
                    <>
                      <span className="sep">@</span>
                      <span>
                        Target <b className="tabular-nums">{fmtCurrency(actionableNow.lowestAlertPrice)}</b>
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="ldr-scroll">
                <table className="ldr">
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
                    {v.rows.map((r, i) => {
                      const green = r.pct >= 0.98

                      // Display rule:
                      // - Row can be green at ≥98%
                      // - But only show 100% when truly fully filled (missing USD ~ 0)
                      const fullyFilled = r.plannedUsd > 0 && r.missingUsd <= (0.005 + EPS) // ~half-cent tolerance
                      const pctLabel =
                        r.plannedUsd > 0
                          ? (fullyFilled ? 100 : Math.min(99, Math.round(r.pct * 100)))
                          : 0
                      const hasLiveRow =
                        Number.isFinite(livePrice as number) &&
                        (livePrice as number) > 0
                      // YELLOW when live price is anywhere from 1.5% below the level or anything above it
                      const yellow =
                        !green &&
                        hasLiveRow &&
                        r.targetPrice > 0 &&
                        (livePrice as number) >= r.targetPrice * 0.985

                      const rowClass = green ? 'done' : yellow ? 'alert' : ''

                      return (
                        <tr key={i} className={rowClass}>
                          <td className="lvl"><span className="ix">{r.level}</span></td>
                          <td className="tgt">{fmtCurrency(r.targetPrice)}</td>
                          <td className="num coins">{r.plannedTokens.toFixed(6)}</td>
                          <td className="num amt">{fmtCurrency(r.plannedUsd)}</td>
                          <td className="num amt">{fmtCurrency(r.missingUsd)}</td>
                          <td>
                            <div className="ldr-prog">
                              <div className="ldr-prog-track">
                                <div
                                  className="ldr-prog-fill"
                                  style={{ width: `${(r.pct * 100).toFixed(2)}%` }}
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
                      <td colSpan={6}>
                        <div className="flex items-center justify-between">
                          {/* Bottom-left: Average lock ONLY (for this frozen planner) */}
                          <div className="inline-flex items-center gap-2">
                            <span className="ft-lbl" style={{ margin: 0 }}>Average lock</span>
                            <span className="ft-v">
                              {v.planner.avg_lock_price != null
                                ? fmtCurrency(num(v.planner.avg_lock_price))
                                : '—'}
                            </span>
                          </div>

                          <div className="inline-flex items-center gap-2">
                            <span className="ft-lbl" style={{ margin: 0 }}>Total planned</span>
                            <span className="ft-v">{v.totals.plannedTokens.toFixed(6)}</span>
                            <span className="ft-sep" style={{ margin: 0 }}>/</span>
                            <span className="ft-v">{fmtCurrency(v.totals.plannedUsd)}</span>
                          </div>

                          <div className="inline-flex items-center gap-2">
                            <span className="ft-off" style={{ margin: 0 }}>Off-Plan</span>
                            <span className="ft-m">0.000000</span>
                            <span className="ft-sep" style={{ margin: 0 }}>/</span>
                            <span className="ft-m">{fmtCurrency(v.offPlanUsd)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
