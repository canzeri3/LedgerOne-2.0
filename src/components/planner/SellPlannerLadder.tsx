'use client'

import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import ProgressBar from '@/components/common/ProgressBar'
import { fmtCurrency } from '@/lib/format'
import { useLivePrice } from '@/lib/useLivePrice'
import { isLevelTouched } from '@/lib/priceTouch'
import {
  buildBuyLevels,
  computeBuyFills,
  type BuyLevel,
  type BuyTrade as BuyTradeType,
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
  rise_pct: number
  price: number
  sell_tokens: number | null
  sell_pct_of_remaining?: number | null
}

type SellTrade = {
  price: number
  quantity: number
  trade_time: string
}

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

export default function SellPlannerLadder({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const { price: livePrice, lastPrice } = useLivePrice(coingeckoId, 15000)

  // ── Active Sell Planner
  const { data: planner, mutate: mutatePlanner } = useSWR<SellPlanner | null>(
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

  // ── Sell Levels (we’ll reuse rise_pct & sizing; price may be overridden dynamically)
  const { data: levels, mutate: mutateLevels } = useSWR<SellLevel[]>(
    user && planner ? ['/sell-levels', planner.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,rise_pct,price,sell_tokens,sell_pct_of_remaining,user_id,coingecko_id,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', planner!.id)
        .order('level', { ascending: true })
      if (error) throw error
      return (data ?? []).map(l => ({
        level: (l as any).level,
        rise_pct: Number((l as any).rise_pct ?? 0),
        price: Number((l as any).price),
        sell_tokens: (l as any).sell_tokens ?? null,
        sell_pct_of_remaining: (l as any).sell_pct_of_remaining ?? null,
      }))
    },
    { revalidateOnFocus: true, dedupingInterval: 8000 }
  )

  // ── Sell trades (for the token-progress bars you already show)
  const { data: sells, mutate: mutateSells } = useSWR<SellTrade[]>(
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

  // ── Active Buy Planner (to compute live baseline from ON-PLAN buys)
  const { data: buyPlanner } = useSWR<ActiveBuyPlanner | null>(
    user ? ['/buy-planner/for-sell', user.id, coingeckoId] : null,
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

  // ── Buy trades for the active Buy Planner (to keep baseline live)
  const { data: buysRaw, mutate: mutateBuys } = useSWR<any[] | null>(
    user && buyPlanner?.id
      ? ['/trades/buys/by-planner-for-sell', user.id, coingeckoId, buyPlanner.id]
      : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,fee,trade_time,side,buy_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'buy')
        .eq('buy_planner_id', buyPlanner!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: true, dedupingInterval: 8000 }
  )

  const buys: BuyTradeType[] = useMemo(
    () =>
      (buysRaw ?? []).map((t: any) => ({
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: Number(t.fee ?? 0),
        trade_time: t.trade_time as string,
      })),
    [buysRaw]
  )

  // ── Live baseline (strict on-plan only). If locked, we'll ignore this later.
  const liveBaseline = useMemo(() => {
    if (!buyPlanner) return 0
    const top = Number(buyPlanner.top_price || 0)
    const budget = Number(buyPlanner.budget_usd ?? buyPlanner.total_budget ?? 0)
    const depth = (Number(buyPlanner.ladder_depth || 70) === 90 ? 90 : 70) as 70 | 90
    const growth = Number(buyPlanner.growth_per_level ?? 25)
    const blvls: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)
    if (!blvls.length || !buys.length) return 0

    // STRICT: tolerance=0 → buying above a level never counts as on-plan
    const fills = computeBuyFills(blvls, buys, 0)

    const sumUsd = fills.allocatedUsd.reduce((s, v) => s + v, 0)
    const sumTokens = blvls.reduce((acc, lv, i) => {
      const usd = fills.allocatedUsd[i] ?? 0
      return acc + (usd > 0 ? usd / lv.price : 0)
    }, 0)

    return sumTokens > 0 ? (sumUsd / sumTokens) : 0
  }, [buyPlanner?.id, buys])

  // ── Choose baseline: locked avg if present, else live baseline
  const baseline = useMemo(() => {
    const locked = Number(planner?.avg_lock_price ?? 0)
    return locked > 0 ? locked : Number(liveBaseline || 0)
  }, [planner?.avg_lock_price, liveBaseline])

  // ── Build the rendered ladder rows (dynamic target price if active & unlocked)
  const rows = useMemo(() => {
    const lvl = levels ?? []
    const activeUnlocked = !!planner?.is_active && !planner?.avg_lock_price
    return lvl.map(r => {
      const targetPrice = (activeUnlocked && baseline > 0)
        ? Number((baseline * (1 + Number(r.rise_pct) / 100)).toFixed(8))
        : Number(r.price)
      return {
        ...r,
        targetPrice,
        plannedTokens: Math.max(0, Number(r.sell_tokens ?? 0)),
      }
    })
  }, [levels, baseline, planner?.is_active, planner?.avg_lock_price])

  // ── Token-based “fill” progress (unchanged logic; USD is just for display)
  const view = useMemo(() => {
    const totalSoldTokens = (sells ?? []).reduce((a, s) => a + s.quantity, 0)
    let remaining = totalSoldTokens

    return rows.map(row => {
      const fillTokens = Math.max(0, Math.min(row.plannedTokens, remaining))
      remaining -= fillTokens
      const pct = row.plannedTokens > 0 ? (fillTokens / row.plannedTokens) : 0
      const plannedUsd = row.plannedTokens * row.targetPrice
      const fillUsd = fillTokens * row.targetPrice
      return { ...row, fillTokens, pct, plannedUsd, fillUsd }
    })
  }, [rows, sells])

  // ── Realtime subscriptions (add BUY trades so baseline updates live)
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
        if (row?.user_id === user.id && row?.coingecko_id === coingeckoId) {
          if (row?.side === 'sell') mutateSells()
          if (row?.side === 'buy')  mutateBuys()
        }
      })
      .subscribe()

    return () => { supabaseBrowser.removeChannel(ch) }
  }, [user?.id, coingeckoId, mutatePlanner, mutateLevels, mutateSells, mutateBuys])

  // ── Render
  if (!planner) {
    return (
      <div className="rounded-2xl border border-[#081427] p-4">
        <div className="text-sm text-slate-300 mb-1">Sell Planner</div>
        <div className="text-xs text-slate-500">No active Sell Planner for this coin.</div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm text-slate-300">Sell Planner Ladder</div>
        <div className="text-xs text-slate-400">
          {planner.avg_lock_price != null && planner.avg_lock_price > 0
            ? `Avg lock: ${fmtCurrency(Number(planner.avg_lock_price))}`
            : baseline > 0
              ? <>Avg (live): {fmtCurrency(baseline)}</>
              : 'Avg lock: —'}
        </div>
      </div>

      {(rows.length === 0) ? (
        <div className="text-xs text-slate-500">No ladder levels saved for this planner.</div>
      ) : (
        <div className="space-y-3">
          {view.map(row => {
            const hot = isLevelTouched('sell', row.targetPrice, lastPrice ?? null, livePrice ?? null)
            return (
              <div key={row.level} className="rounded-lg border border-[#0b1830] p-3">
                <div className={`flex items-center justify-between text-xs mb-1 ${hot ? 'text-yellow-300' : 'text-slate-300'}`}>
                  <div>
                    L{row.level} · target {fmtCurrency(row.targetPrice)}
                    {!planner.avg_lock_price && baseline > 0 && (
                      <span className="ml-1 text-[10px] text-slate-500">(dynamic)</span>
                    )}
                  </div>
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

