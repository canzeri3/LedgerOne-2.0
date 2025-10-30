'use client'

import { useMemo, useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import ProgressBar from '@/components/common/ProgressBar'
import { useLivePrice } from '@/lib/useLivePrice'
import {
  computeSellFills,
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
  rise_pct: number | null
  price: number | null
  sell_tokens: number | null
  sell_pct_of_remaining: number | null
  sell_planner_id: string
  user_id: string
  coingecko_id: string
}

type SellTrade = {
  price: number
  quantity: number
  fee?: number | null
  trade_time?: string
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

const SELL_TOLERANCE = 0.0005 // strict for active

export default function SellPlannerLadder({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  useLivePrice(coingeckoId, 15000)

  const { data: active } = useSWR<SellPlanner | null>(
    user ? ['/sell-active', user.id, coingeckoId] : null,
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
      return (data as SellPlanner) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const { data: levels } = useSWR<SellLevel[]>(
    user && active ? ['/sell-levels', user.id, coingeckoId, active.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,rise_pct,price,sell_tokens,sell_pct_of_remaining,sell_planner_id,user_id,coingecko_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', active!.id)
        .order('level', { ascending: true })
      if (error) throw error
      return (data ?? []) as SellLevel[]
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const { data: sells } = useSWR<SellTrade[]>(
    user && active ? ['/sells', user.id, coingeckoId, active.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('id,user_id,coingecko_id,quantity,price,fee,trade_time,side,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'sell')
        .eq('sell_planner_id', active!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        price: num(r.price),
        quantity: num(r.quantity),
        fee: num(r.fee),
        trade_time: r.trade_time,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // NEW: refresh when regeneration finished (or when buy-planner broadcast happens)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bump = (e: any) => {
      const detailCoin = e?.detail?.coinId
      if (detailCoin && detailCoin !== coingeckoId) return
      if (!user || !active) return
      globalMutate(['/sell-active', user.id, coingeckoId])
      globalMutate(['/sell-levels', user.id, coingeckoId, active.id])
    }
    window.addEventListener('sellPlannerUpdated', bump)
    window.addEventListener('buyPlannerUpdated', bump)
    return () => {
      window.removeEventListener('sellPlannerUpdated', bump)
      window.removeEventListener('buyPlannerUpdated', bump)
    }
  }, [user?.id, coingeckoId, active?.id])

  const lvls = useMemo(
    () =>
      (levels ?? []).map(l => ({
        level: l.level,
        targetPrice: num(l.price),
        plannedTokens: Math.max(0, num(l.sell_tokens)),
      })),
    [JSON.stringify(levels)]
  )

  const fill = useMemo(() => {
    if (!lvls.length) return null as any
    return computeSellFills(
      lvls.map(({ targetPrice, plannedTokens }) => ({ target_price: targetPrice, planned_tokens: plannedTokens })),
      sells ?? [],
      SELL_TOLERANCE
    ) as any
  }, [JSON.stringify(lvls), JSON.stringify(sells)])

  const allocated: number[] = Array.isArray(fill?.allocatedTokens)
    ? (fill.allocatedTokens as any[]).map(num)
    : lvls.map(() => 0)

  const rows: ViewRow[] = (lvls ?? []).map((lv, i) => {
    const plannedTokens = lv.plannedTokens || 0
    const plannedUsd = plannedTokens * lv.targetPrice
    const missingTokens = Math.max(0, plannedTokens - (allocated[i] ?? 0))
    const missingUsd = missingTokens * lv.targetPrice
    const pct = plannedTokens > 0 ? Math.min(1, (allocated[i] ?? 0) / plannedTokens) : 0
    return {
      level: lv.level,
      targetPrice: lv.targetPrice,
      plannedTokens,
      plannedUsd,
      missingUsd,
      pct,
    }
  })

  const { data: livePrice } = useSWR<number | null>(['/live', coingeckoId], null as any)

  const offPlan = useMemo(() => {
    if (!sells?.length) return { tokens: 0, usd: 0 }
    const plannedTotal = rows.reduce((acc, r) => acc + r.plannedTokens, 0)
    const allocatedTotal = (Array.isArray(fill?.allocatedTokens) ? (fill!.allocatedTokens as any[]).reduce((a, b) => a + num(b), 0) : 0)
    const offPlanTokens = Math.max(0, allocatedTotal - plannedTotal)
    const lastPrice = Number.isFinite(livePrice as number) ? (livePrice as number) : (rows[0]?.targetPrice ?? 0)
    return { tokens: offPlanTokens, usd: offPlanTokens * lastPrice }
  }, [JSON.stringify(rows), JSON.stringify(lvls), JSON.stringify(sells), JSON.stringify(fill?.allocatedTokens)])

  if (!active) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="text-sm text-slate-400">No active Sell Planner yet.</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-auto">
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
            {rows.map((r, i) => {
              const rowClass = r.pct >= 0.97 ? 'text-[rgb(121,171,89)]' : ''
              return (
                <tr key={i} className={`border-t border-[rgb(51,52,54)] align-middle ${rowClass}`}>
                  <td className="px-3 py-2">{r.level}</td>
                  <td className="px-3 py-2">{fmtCurrency(r.targetPrice)}</td>
                  <td className="px-3 py-2">{r.plannedTokens.toFixed(6)}</td>
                  <td className="px-3 py-2">{fmtCurrency(r.plannedUsd)}</td>
                  <td className="px-3 py-2">{fmtCurrency(r.missingUsd)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end items-center gap-2">
                      <div className="w-40"><ProgressBar pct={r.pct} /></div>
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
                  <div className="inline-flex items-center gap-2">
                    <span>Total planned</span>
                    <span className="tabular-nums">{rows.reduce((s, r) => s + r.plannedTokens, 0).toFixed(6)}</span>
                    <span className="text-slate-600">/</span>
                    <span className="tabular-nums">
                      {fmtCurrency(rows.reduce((s, r) => s + r.plannedUsd, 0))}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <span className="text-amber-300">Off-Plan</span>
                    <span className="tabular-nums">{num((Array.isArray(fill?.allocatedTokens) ? (fill!.allocatedTokens as any[]).reduce((a, b) => a + num(b), 0) : 0) - rows.reduce((s, r) => s + r.plannedTokens, 0)).toFixed(6)}</span>
                    <span className="text-slate-600">/</span>
                    <span className="tabular-nums">{fmtCurrency(0)}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
