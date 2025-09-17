'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import ProgressBar from '@/components/common/ProgressBar'
import { useLivePrice } from '@/lib/useLivePrice'
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

type SellLevelRow = {
  level: number
  price: number
  sell_tokens: number | null
}

const SELL_TOLERANCE = 0.03
const EPS = 1e-8

export default function SellPlannerHistory({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const { price: livePrice } = useLivePrice(coingeckoId, 15000)

  const { data: planners } = useSWR<FrozenSellPlanner[]>(
    user ? ['/sell-history/planners', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,user_id,coingecko_id,is_active,avg_lock_price,created_at,frozen_at')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .neq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: false, dedupingInterval: 20000 }
  )

  const plannerIds = useMemo(() => (planners ?? []).map(p => p.id), [planners])

  const { data: allLevels } = useSWR<any[]>(
    user && plannerIds.length ? ['/sell-history/levels', ...plannerIds] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,price,sell_tokens,sell_planner_id,user_id,coingecko_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .in('sell_planner_id', plannerIds)
        .order('level', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: false, dedupingInterval: 20000 }
  )

  const { data: allSells } = useSWR<any[]>(
    user && plannerIds.length ? ['/sell-history/sells', ...plannerIds] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,trade_time,side,sell_planner_id,user_id,coingecko_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'sell')
        .in('sell_planner_id', plannerIds)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: false, dedupingInterval: 20000 }
  )

  const cards = useMemo(() => {
    if (!planners?.length) return []
    const levelsByPlanner = new Map<string, SellLevelRow[]>()
    const sellsByPlanner = new Map<string, SellTradeType[]>()

    ;(allLevels ?? []).forEach((r: any) => {
      const pid = r.sell_planner_id as string
      if (!levelsByPlanner.has(pid)) levelsByPlanner.set(pid, [])
      levelsByPlanner.get(pid)!.push({
        level: Number(r.level),
        price: Number(r.price),
        sell_tokens: r.sell_tokens ?? null,
      })
    })

    ;(allSells ?? []).forEach((t: any) => {
      const pid = t.sell_planner_id as string
      if (!sellsByPlanner.has(pid)) sellsByPlanner.set(pid, [])
      sellsByPlanner.get(pid)!.push({
        price: Number(t.price),
        quantity: Number(t.quantity),
        trade_time: t.trade_time,
      })
    })

    return planners.map(p => {
      const rows = (levelsByPlanner.get(p.id) ?? []).sort((a, b) => a.level - b.level)
      const sells = (sellsByPlanner.get(p.id) ?? [])
      const lvlsForFill = rows.map(r => ({
        target_price: Number(r.price),
        planned_tokens: Math.max(0, Number(r.sell_tokens ?? 0)),
      }))

      const fill = computeSellFills(lvlsForFill, sells, SELL_TOLERANCE)

      const view = rows.map((r, i) => {
        const plannedTokens = Math.max(0, Number(r.sell_tokens ?? 0))
        const targetPrice = Number(r.price)
        const fillTokens = Number(fill.allocatedTokens[i] ?? 0)
        const pct = plannedTokens > 0 ? Math.min(1, fillTokens / plannedTokens) : 0
        const plannedUsd = plannedTokens * targetPrice
        const fillUsd = fillTokens * targetPrice
        const missingTokens = Math.max(0, plannedTokens - fillTokens)
        return {
          level: r.level,
          targetPrice,
          plannedTokens,
          plannedUsd,
          fillTokens,
          fillUsd,
          missingTokens,
          pct,
        }
      })

      const totals = {
        plannedTokens: view.reduce((s, r) => s + r.plannedTokens, 0),
        plannedUsd: view.reduce((s, r) => s + r.plannedUsd, 0),
        missingTokens: view.reduce((s, r) => s + r.missingTokens, 0),
      }

      return { planner: p, view, totals }
    })
  }, [planners, allLevels, allSells])

  if (!planners?.length) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="text-base text-slate-300 mb-1">Sell Planner History</div>
        <div className="text-sm text-slate-500">No frozen planners yet.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {cards.map(({ planner, view, totals }) => (
        <div key={planner.id} className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5" data-history-id={planner.id}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-base text-slate-300">Sell Planner (Frozen)</div>
            <div className="text-sm text-slate-400">
              Avg lock: {planner.avg_lock_price ? fmtCurrency(Number(planner.avg_lock_price)) : '—'}
            </div>
          </div>

          <div className="overflow-x-auto">
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
                      <td className="px-3 py-2">{(row.plannedTokens - row.fillTokens).toFixed(6)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end items-center gap-2">
                          <div className="w-40"><ProgressBar pct={row.pct} /></div>
                          <span className="w-10 text-right tabular-nums">{Math.round(row.pct * 100)}%</span>
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
                  <td className="px-3 py-2">{totals.plannedTokens.toFixed(6)}</td>
                  <td className="px-3 py-2">{fmtCurrency(totals.plannedUsd)}</td>
                  <td className="px-3 py-2">{(totals.plannedTokens - view.reduce((s,r)=>s+r.fillTokens,0)).toFixed(6)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

