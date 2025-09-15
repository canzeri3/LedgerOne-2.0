'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import ProgressBar from '@/components/common/ProgressBar'
import { fmtCurrency } from '@/lib/format'
import { useLivePrice } from '@/lib/useLivePrice'
import { isLevelTouched } from '@/lib/priceTouch'

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
  price: number
  sell_tokens: number | null
}

type SellTrade = {
  price: number
  quantity: number
  trade_time: string
}

export default function SellPlannerLadder({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const { price: livePrice, lastPrice } = useLivePrice(coingeckoId, 15000)

  const {
    data: planner,
    mutate: mutatePlanner
  } = useSWR<SellPlanner | null>(
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

  const {
    data: levels,
    mutate: mutateLevels
  } = useSWR<SellLevel[]>(
    user && planner ? ['/sell-levels', planner.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,price,sell_tokens,user_id,coingecko_id,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', planner!.id)
        .order('level', { ascending: true })
      if (error) throw error
      return (data ?? []).map(l => ({
        level: (l as any).level,
        price: Number((l as any).price),
        sell_tokens: (l as any).sell_tokens ?? null,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const {
    data: sells,
    mutate: mutateSells
  } = useSWR<SellTrade[]>(
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

  // 🔄 Realtime: refresh when planner / levels / sells change
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
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId && row?.side === 'sell') {
          mutateSells()
        }
      })
      .subscribe()

    return () => { supabaseBrowser.removeChannel(ch) }
  }, [user?.id, coingeckoId, mutatePlanner, mutateLevels, mutateSells])

  if (!planner) {
    return (
      <div className="rounded-2xl border border-[#081427] p-4">
        <div className="text-sm text-slate-300 mb-1">Sell Planner</div>
        <div className="text-xs text-slate-500">No active Sell Planner for this coin.</div>
      </div>
    )
  }

  // Waterfall fill in tokens
  const view = (() => {
    const planned = (levels ?? []).map(l => ({
      level: l.level,
      price: l.price,
      plannedTokens: Math.max(0, Number(l.sell_tokens ?? 0)),
    }))

    const totalSoldTokens = (sells ?? []).reduce((a, s) => a + s.quantity, 0)
    let remaining = totalSoldTokens

    return planned.map(row => {
      const fillTokens = Math.max(0, Math.min(row.plannedTokens, remaining))
      remaining -= fillTokens
      const pct = row.plannedTokens > 0 ? (fillTokens / row.plannedTokens) : 0
      return {
        ...row,
        fillTokens,
        pct,
        plannedUsd: row.plannedTokens * row.price,
        fillUsd: fillTokens * row.price,
      }
    })
  })()

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm text-slate-300">Sell Planner Ladder</div>
        <div className="text-xs text-slate-400">
          {(planner.avg_lock_price != null) ? `Avg lock: ${fmtCurrency(Number(planner.avg_lock_price))}` : 'Avg lock: —'}
        </div>
      </div>

      {(levels?.length ?? 0) === 0 ? (
        <div className="text-xs text-slate-500">No ladder levels saved for this planner.</div>
      ) : (
        <div className="space-y-3">
          {view.map(row => {
            const hot = isLevelTouched('sell', row.price, lastPrice ?? null, livePrice ?? null)
            return (
              <div key={row.level} className="rounded-lg border border-[#0b1830] p-3">
                <div className={`flex items-center justify-between text-xs mb-1 ${hot ? 'text-yellow-300' : 'text-slate-300'}`}>
                  <div>L{row.level} · target {fmtCurrency(row.price)}</div>
                  <div>{row.fillTokens.toFixed(6)} / {row.plannedTokens.toFixed(6)} tokens</div>
                </div>
                <ProgressBar pct={row.pct} text={`${(row.pct*100).toFixed(1)}% filled`} />
                <div className="mt-1 text-[10px] text-slate-400">
                  ${fmtCurrency(row.fillUsd)} / ${fmtCurrency(row.plannedUsd)} at target price
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

