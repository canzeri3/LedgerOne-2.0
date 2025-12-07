'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import ProgressBar from '@/components/common/ProgressBar'
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
          const plannerHasAlert =
            !!live &&
            rows.some((r) => {
              const lvl = r.targetPrice
              if (!(lvl > 0)) return false
              // “Alert” if live price is within ~3% of target and level not fully filled
              const within = (live as number) >= lvl * 0.97
              const notFilled = r.pct < 0.97
              return within && notFilled
            })

          return (
            <div
              key={v.planner.id}
              data-history-id={v.planner.id}
              data-has-alert={plannerHasAlert ? '1' : '0'}
              className="overflow-x-auto"
            >
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
                  {v.rows.map((r, i) => {
                    const green = r.pct >= 0.97
                    const hasLiveRow =
                      Number.isFinite(livePrice as number) &&
                      (livePrice as number) > 0
                    // YELLOW when live price is anywhere from 1.5% below the level or anything above it
                    const yellow =
                      !green &&
                      hasLiveRow &&
                      r.targetPrice > 0 &&
                      (livePrice as number) >= r.targetPrice * 0.985

                    const rowClass = green
                      ? 'text-[rgb(121,171,89)]'
                      : yellow
                      ? 'text-[rgb(207,180,45)]'
                      : ''

                    return (
                      <tr
                        key={i}
                        className={`border-t border-[rgb(51,52,54)] align-middle ${rowClass}`}
                      >
                        <td className="px-3 py-2">{r.level}</td>
                        <td className="px-3 py-2">
                          {fmtCurrency(r.targetPrice)}
                        </td>
                        <td className="px-3 py-2">
                          {r.plannedTokens.toFixed(6)}
                        </td>
                        <td className="px-3 py-2">
                          {fmtCurrency(r.plannedUsd)}
                        </td>
                        <td className="px-3 py-2">
                          {fmtCurrency(r.missingUsd)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end items-center gap-2">
                            <div className="w-40">
                              <ProgressBar pct={r.pct} />
                            </div>
                            <span className="w-10 text-right tabular-nums">
                              {Math.round(r.pct * 100)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[rgb(51,52,54)]">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex items-center justify-between text-slate-400 text-xs">
                        {/* Bottom-left: Average lock ONLY (for this frozen planner) */}
                        <div className="inline-flex items-center gap-2">
                          <span>Average lock:</span>
                          <span className="tabular-nums text-slate-300">
                            {v.planner.avg_lock_price != null
                              ? fmtCurrency(num(v.planner.avg_lock_price))
                              : '—'}
                          </span>
                        </div>

                        <div className="inline-flex items-center gap-2">
                          <span>Total planned</span>
                          <span className="tabular-nums">
                            {v.totals.plannedTokens.toFixed(6)}
                          </span>
                          <span className="text-slate-600">/</span>
                          <span className="tabular-nums">
                            {fmtCurrency(v.totals.plannedUsd)}
                          </span>
                        </div>

                        <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                          <span className="text-amber-300">Off-Plan</span>
                          <span className="tabular-nums">0.000000</span>
                          <span className="text-slate-600">/</span>
                          <span className="tabular-nums">
                            {fmtCurrency(v.offPlanUsd)}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
