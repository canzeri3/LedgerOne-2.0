'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import { useLivePrice } from '@/lib/useLivePrice'
import { isLevelTouched } from '@/lib/priceTouch'
import ProgressBar from '@/components/common/ProgressBar'

type Planner = {
  id: string
  created_at: string
  frozen_at: string | null
  avg_lock_price: number | null
}

type Level = { level: number; price: number; sell_tokens: number | null }
type SellTrade = { quantity: number }

export default function SellPlannerHistory({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const { price: livePrice, lastPrice } = useLivePrice(coingeckoId, 15000)

  const {
    data: planners,
    mutate: mutatePlanners
  } = useSWR<Planner[]>(
    user ? ['/sell-planners/frozen', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,created_at,frozen_at,avg_lock_price,user_id,coingecko_id,is_active')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // 🔄 Realtime update when new planner is frozen/created
  useEffect(() => {
    if (!user) return
    const ch = supabaseBrowser
      .channel(`sell_planner_hist_${user.id}_${coingeckoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sell_planners' }, (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId) {
          mutatePlanners()
        }
      })
      .subscribe()
    return () => { supabaseBrowser.removeChannel(ch) }
  }, [user?.id, coingeckoId, mutatePlanners])

  if (!planners || planners.length === 0) return null

  return (
    <div className="space-y-4">
      {planners.map(p => <HistoryCard key={p.id} coingeckoId={coingeckoId} planner={p} livePrice={livePrice} lastPrice={lastPrice} />)}
    </div>
  )
}

function HistoryCard({ coingeckoId, planner, livePrice, lastPrice }:{
  coingeckoId: string, planner: Planner, livePrice: number | null, lastPrice: number | null
}) {
  const { user } = useUser()

  const {
    data: levels,
    mutate: mutateLevels
  } = useSWR<Level[]>(
    user ? ['/sell-levels/frozen', planner.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,price,sell_tokens,user_id,coingecko_id,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', planner.id)
        .order('level', { ascending: true })
      if (error) throw error
      return (data ?? []).map(l => ({ level: (l as any).level, price: Number((l as any).price), sell_tokens: (l as any).sell_tokens ?? null }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const {
    data: sells,
    mutate: mutateSells
  } = useSWR<SellTrade[]>(
    user ? ['/sell-levels/frozen-sells', planner.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('quantity,user_id,coingecko_id,sell_planner_id,side')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'sell')
        .eq('sell_planner_id', planner.id)
      if (error) throw error
      return (data ?? []).map(r => ({ quantity: Number((r as any).quantity) }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // 🔄 Realtime for levels/sells of this frozen planner
  useEffect(() => {
    if (!user) return
    const ch = supabaseBrowser
      .channel(`sell_hist_levels_${planner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sell_levels' }, (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId && row?.sell_planner_id === planner.id) {
          mutateLevels()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId && row?.sell_planner_id === planner.id && row?.side === 'sell') {
          mutateSells()
        }
      })
      .subscribe()
    return () => { supabaseBrowser.removeChannel(ch) }
  }, [user?.id, coingeckoId, planner.id, mutateLevels, mutateSells])

  // Waterfall view
  const view = (() => {
    const planned = (levels ?? []).map(l => ({ level: l.level, price: l.price, plannedTokens: Math.max(0, Number(l.sell_tokens ?? 0)) }))
    const totalSoldTokens = (sells ?? []).reduce((a, s) => a + s.quantity, 0)
    let remaining = totalSoldTokens
    return planned.map(row => {
      const fill = Math.max(0, Math.min(row.plannedTokens, remaining))
      remaining -= fill
      const pct = row.plannedTokens > 0 ? (fill / row.plannedTokens) : 0
      return { ...row, fillTokens: fill, pct, plannedUsd: row.plannedTokens * row.price, fillUsd: fill * row.price }
    })
  })()

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm text-slate-300">Frozen Sell Planner</div>
        <div className="text-xs text-slate-400">
          {(planner.avg_lock_price != null) ? `Avg lock: ${fmtCurrency(Number(planner.avg_lock_price))}` : 'Avg lock: —'} ·
          {' '}Frozen at: {planner.frozen_at ? new Date(planner.frozen_at).toLocaleString() : '—'}
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

