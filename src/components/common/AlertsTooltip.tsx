'use client'

import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'

// NOTE: Planner sell types in src/lib/planner.ts are runtime-only; we use lightweight aliases here.
type PlannerSellLevel = {
  target_price: number
  planned_tokens: number
}

type PlannerSellTrade = {
  price: number
  quantity: number
  fee?: number | null
  trade_time?: string
}

type TradeLite = {
  coingecko_id: string
  side: 'buy' | 'sell'
  quantity: number
  trade_time: string
}

type CoinMeta = { coingecko_id: string; symbol: string; name: string }

type BuyPlannerRow = {
  id: string
  coingecko_id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: number | null
  growth_per_level: number | null
  is_active: boolean | null
}

type TradeRow = {
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  buy_planner_id: string | null
  sell_planner_id: string | null
}

type AlertItem = { side: 'Buy' | 'Sell'; symbol: string; cid: string }

export function AlertsTooltip({
  coinIds,
  tradesByCoin, // (kept for prop compatibility; not used for fills)
  coins,
}: {
  coinIds: string[]
  tradesByCoin: Map<string, TradeLite[]>
  coins: CoinMeta[] | undefined
}) {

  const { user } = useUser()
  const router = useRouter()

  // Strictly control visibility to avoid "near hover" and allow panel hover
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<number | null>(null)

  const openNow = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }
  const scheduleClose = (e?: PointerEvent | React.PointerEvent) => {
    // Only schedule if pointer truly left the wrapper
    const to = (e?.relatedTarget as Node | null) ?? null
    const wrap = wrapRef.current as unknown as Node | null
    if (to && wrap && wrap.contains(to)) return
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      closeTimer.current = null
    }, 120) as unknown as number
  }

  // --- DATA FETCHES (same sources already used on this page) ---
  const { data: activeBuyPlanners } = useSWR<BuyPlannerRow[]>(
    user ? ['/alerts/buy-planners', user.id] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('buy_planners')
.select('id,coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,is_active,user_id')
          .eq('user_id', user!.id)
          .eq('is_active', true)
        if (error) throw error
        return (data ?? []) as BuyPlannerRow[]
      } catch {
        return []
      }
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      dedupingInterval: 10_000,
    }
  )

  const { data: activeSellPlanners } = useSWR<{ id: string; coingecko_id: string; is_active: boolean | null }[]>(
    user ? ['/alerts/sell-planners', user.id] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('sell_planners')
          .select('id,coingecko_id,is_active,user_id')
          .eq('user_id', user!.id)
          .eq('is_active', true)
        if (error) throw error
        return (data ?? []).map((p: any) => ({ id: p.id, coingecko_id: p.coingecko_id, is_active: p.is_active }))
      } catch {
        return []
      }
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      dedupingInterval: 10_000,
    }
  )

  const sellPlannerIds = useMemo(
    () => (activeSellPlanners ?? []).map(p => p.id).sort(), // stable order for a stable SWR key below
    [activeSellPlanners]
  )

  const { data: sellLevels } = useSWR<{ sell_planner_id: string; level: number; price: number; sell_tokens: number | null }[]>(
    user && sellPlannerIds.length ? ['/alerts/sell-levels', sellPlannerIds.join(',')] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('sell_levels')
          .select('sell_planner_id,level,price,sell_tokens')
          .in('sell_planner_id', sellPlannerIds)
        if (error) throw error
        return (data ?? []) as any
      } catch {
        return []
      }
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      dedupingInterval: 10_000,
    }
  )

  const alertCoinIds = useMemo(() => {
    const s = new Set<string>()
    ;(activeBuyPlanners ?? []).forEach(p => p?.coingecko_id && s.add(String(p.coingecko_id)))
    ;(activeSellPlanners ?? []).forEach(p => p?.coingecko_id && s.add(String(p.coingecko_id)))
    return Array.from(s).sort() // sorted for stable SWR key below
  }, [activeBuyPlanners, activeSellPlanners])

  // Canonicalize ids for the new core
  const alertCoinIdsCanon = useMemo(
    () => alertCoinIds.map(x => String(x || '').toLowerCase().trim()).filter(Boolean),
    [alertCoinIds]
  )

  const { data: pricesMap } = useSWR<Map<string, number>>(
    user && alertCoinIdsCanon.length ? ['/alerts/prices', ...alertCoinIdsCanon].join(':') : null, // stable key
    async () => {
      // Single call to new core → Map<id, price>
      const res = await fetch(`/api/prices?ids=${encodeURIComponent(alertCoinIdsCanon.join(','))}&currency=USD`, { cache: 'no-store' })
      if (!res.ok) return new Map<string, number>()
      const j: any = await res.json() // { rows, updatedAt }
      const m = new Map<string, number>()
      for (const r of (j?.rows ?? [])) {
        const id = String(r?.id || '')
        const price = Number(r?.price)
        if (id && Number.isFinite(price)) m.set(id, price)
      }
      return m
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      refreshInterval: 20_000,
      dedupingInterval: 5_000,
    }
  )

  const sym = (cid: string) =>
    coins?.find(c => c.coingecko_id === cid)?.symbol?.toUpperCase() ?? cid.toUpperCase()

  // Canonicalize coin IDs so alerts work even if DB has casing/whitespace quirks
  const canonId = (id: string | null | undefined) =>
    String(id ?? '').trim().toLowerCase()

  type AlertItem = { side: 'Buy' | 'Sell'; symbol: string; cid: string }

    // ⬇ rich trades to compute fills exactly like Portfolio (fail-soft)
  type TradeRow = {
    coingecko_id: string
    side: 'buy' | 'sell'
    price: number
    quantity: number
    fee: number | null
    trade_time: string
    buy_planner_id: string | null
    sell_planner_id: string | null
  }

  const { data: richTrades } = useSWR<TradeRow[]>(
    user && (alertCoinIds?.length ?? 0) ? ['/alerts/trades-rich', user.id] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('trades')
.select('coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id')
          .eq('user_id', user!.id)
          .order('trade_time', { ascending: true })
        if (error) throw error
        return (data ?? []) as TradeRow[]
      } catch {
        return []
      }
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      dedupingInterval: 10_000,
    }
  )

  const tradesByCoinRich = useMemo(() => {
    const m = new Map<string, TradeRow[]>()
    ;(richTrades ?? []).forEach(t => {
      if (!m.has(t.coingecko_id)) m.set(t.coingecko_id, [])
      m.get(t.coingecko_id)!.push(t)
    })
    return m
  }, [richTrades])

  // ➜ EXACT SAME ALERTS LOGIC AS PORTFOLIO PAGE
  const alertItems: AlertItem[] = useMemo(() => {
    const out: AlertItem[] = []

    // BUY alerts
    for (const p of activeBuyPlanners ?? []) {
      const cid = p.coingecko_id
      const cidCanon = canonId(cid)
      const live = pricesMap instanceof Map ? (pricesMap.get(cidCanon) ?? 0) : 0
      if (!(live > 0)) continue

      const top = Number(p.top_price ?? 0)
      const budget = Number(p.budget_usd ?? p.total_budget ?? 0)
      const depth: 70 | 90 = Number(p.ladder_depth) === 90 ? 90 : 70
      const growth = Number(p.growth_per_level ?? 0)
      if (!(top > 0) || !(budget > 0)) continue

      const plan: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)
      const buys: BuyTrade[] = (tradesByCoinRich.get(cid) ?? [])
        .filter(t => t.side === 'buy' && t.buy_planner_id === p.id)
        .map(t => ({ price: t.price, quantity: t.quantity, fee: t.fee ?? 0, trade_time: t.trade_time }))

      const fills = computeBuyFills(plan, buys, 0)

      const hit = plan.some((lv, i) => {
        const lvl = Number(lv.price)
        if (!(lvl > 0)) return false
        const within = live <= lvl * 1.015
        const notFilled = (fills.fillPct?.[i] ?? 0) < 0.97
        return within && notFilled
      })
      if (hit) out.push({ side: 'Buy', symbol: sym(cid), cid })
    }

    // SELL alerts
    const lvlsByPlanner = new Map<string, { level: number; price: number; sell_tokens: number | null }[]>()
    for (const l of sellLevels ?? []) {
      const arr = lvlsByPlanner.get(l.sell_planner_id) ?? []
      arr.push(l)
      lvlsByPlanner.set(l.sell_planner_id, arr)
    }

    for (const sp of activeSellPlanners ?? []) {
      const cid = sp.coingecko_id
      const cidCanon = canonId(cid)
      const live = pricesMap instanceof Map ? (pricesMap.get(cidCanon) ?? 0) : 0
      if (!(live > 0)) continue

      const raw = (lvlsByPlanner.get(sp.id) ?? []).sort((a,b)=>a.level-b.level)
      if (!raw.length) continue

      const levels: PlannerSellLevel[] = raw.map(l => ({
        target_price: Number(l.price),
        planned_tokens: Math.max(0, Number(l.sell_tokens ?? 0)),
      }))

      const sells: PlannerSellTrade[] = (tradesByCoinRich.get(cid) ?? [])
        .filter(t => t.side === 'sell' && t.sell_planner_id === sp.id)
        .map(t => ({ price: t.price, quantity: t.quantity, fee: t.fee ?? 0, trade_time: t.trade_time }))

      const fill = computeSellFills(levels, sells, 0.05)

      const hit = levels.some((lv, i) => {
        const lvl = Number(lv.target_price)
        if (!(lvl > 0)) return false
        const within = live >= lvl * 0.97
        const notFilled = (fill.fillPct?.[i] ?? 0) < 0.97
        return within && notFilled
      })
      if (hit) out.push({ side: 'Sell', symbol: sym(cid), cid })
    }

    const buysOut = out.filter(x => x.side === 'Buy').sort((a,b)=>a.symbol.localeCompare(b.symbol))
    const sellsOut = out.filter(x => x.side === 'Sell').sort((a,b)=>a.symbol.localeCompare(b.symbol))
    return [...buysOut, ...sellsOut]
  }, [
    JSON.stringify(activeBuyPlanners),
    JSON.stringify(activeSellPlanners),
    JSON.stringify(sellLevels),
    JSON.stringify(pricesMap instanceof Map ? [...(pricesMap as Map<string, number>).entries()] : []),
    JSON.stringify([...tradesByCoinRich.entries()].map(([k,v]) => [k, v.length])),
  ])

  const totalAlerts = alertItems.length

  const Badge = ({ kind }: { kind: 'Buy' | 'Sell' }) => {
    const isBuy = kind === 'Buy'
    return (
      <span
        className={[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          isBuy
            ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30'
            : 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30',
        ].join(' ')}
      >
        {/* Updated icons */}
        {isBuy ? (
          // Buy arrow pointing UP (professional clean style)
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="w-3 h-3 opacity-90"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 19V5" />
            <path d="M6 11l6-6 6 6" />
          </svg>
        ) : (
          // Sell arrow pointing UP-RIGHT (stylish outward direction)
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="w-3 h-3 opacity-90"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M7 17L17 7" />
            <path d="M13 7h4v4" />
          </svg>
        )}
        {kind}
      </span>
    )
  }

  const CountPill = ({ n }: { n: number }) => {
    if (!n) return null
    return (
      <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[rgb(142,123,237)]/25 text-[rgb(205,195,255)] text-[10px] font-bold px-2 py-0.5 ring-1 ring-[rgb(51,52,54)]">
        {n}
      </span>
    )
  }

  // UI (unchanged)
  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={openNow}
      onPointerLeave={(e) => scheduleClose(e)}
    >
      {/* Button (only this and the panel can open the tooltip) */}
      <button
        className="relative px-4 py-2 text-xs font-semibold text-slate-200/90 rounded-md bg-[rgb(34,35,39)] hover:bg-[rgb(25,26,28)] ring-1 ring-slate-600/40 focus-visible:ring-2 focus-visible:ring-[rgb(125,138,206)]/40 transition-all duration-300 overflow-hidden inline-flex items-center gap-2"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onPointerEnter={openNow}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/10 via-indigo-400/10 to-indigo-300/10 blur-xl transition-opacity" />
        <span className="relative flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="w-4 h-4"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.7 1.7 0 0 0 3.4 0" />
          </svg>
          <span>Alerts</span>
          <CountPill n={totalAlerts} />
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Alerts"
          className="absolute right-0 z-50 mt-2 w-[260px] rounded-lg bg-[rgb(42,44,49)] ring-1 ring-slate-700/40 shadow-2xl p-2"
          onPointerEnter={openNow}
          onPointerLeave={(e) => scheduleClose(e)}
        >
          <div className="grid gap-1">
            {alertItems.length === 0 ? (
              <div className="px-2 py-3 text-xs text-slate-300/70">No active alerts</div>
            ) : (
              alertItems.map((it, idx) => (
         <Link
  key={`${it.cid}:${it.side}:${idx}`}
  href={`/coins/${it.cid}`}
  prefetch
  className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-700/20 text-slate-100/95 text-xs ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(125,138,206)]/50 transition-colors"
  onPointerEnter={openNow} /* keeps tooltip open while moving toward it */
  onFocus={openNow}
>
  <span className="flex items-center gap-2">
    <Badge kind={it.side} />
    <span className="text-sm text-slate-100/95">{it.symbol}</span>
  </span>
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-300/80">
    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
  </svg>
</Link>

              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
