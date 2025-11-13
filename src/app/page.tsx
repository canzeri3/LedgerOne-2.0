'use client'

import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import PortfolioGrowthChart, { type Point } from '@/components/dashboard/PortfolioGrowthChart'
import { fmtCurrency } from '@/lib/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PortfolioHoldingsTable from '@/components/dashboard/PortfolioHoldingsTable'
import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyLevel,
  type BuyTrade,
  type SellLevel as PlannerSellLevel,
  type SellTrade as PlannerSellTrade,
} from '@/lib/planner'

type TradeLite = { coingecko_id: string; side: 'buy' | 'sell'; quantity: number; trade_time: string }
type Timeframe = '24h' | '7d' | '30d' | '90d' | '1y' | 'YTD' | 'Max'
const TIMEFRAMES: Timeframe[] = ['24h', '7d', '30d', '90d', '1y', 'YTD', 'Max']

// minimal extra types used by the tooltip
type CoinMeta = { coingecko_id: string; symbol: string; name: string }
type BuyPlannerRow = {
  coingecko_id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: number | null
  growth_per_level: number | null
  is_active: boolean | null
}

/* ── timeframe helpers ─────────────────────────────────────── */
function startOfYTD(): number {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1).getTime()
}
function rangeStartFor(tf: Timeframe): number | null {
  const now = Date.now(), day = 24 * 60 * 60 * 1000
  switch (tf) {
    case '24h': return now - day
    case '7d': return now - 7 * day
    case '30d': return now - 30 * day
    case '90d': return now - 90 * day
    case '1y': return now - 365 * day
    case 'YTD': return startOfYTD()
    case 'Max': return null
  }
}
function stepMsFor(tf: Timeframe): number {
  const m = 60_000, h = 60 * m
  switch (tf) {
    case '24h': return 5 * m
    case '7d': return 30 * m
    case '30d': return 2 * h
    case '90d': return 6 * h
    case '1y': return 24 * h
    case 'YTD': return 12 * h
    case 'Max': return 24 * h
  }
}
function daysParamFor(tf: Timeframe): string {
  switch (tf) {
    case '24h': return '1'
    case '7d': return '7'
    case '30d': return '30'
    case '90d': return '90'
    case '1y': return '365'
    case 'YTD': return 'max'
    case 'Max': return 'max'
  }
}

/* ── fetch helpers ─────────────────────────────────────────── */
// Choose a sensible interval for /api/price-history based on days
function intervalForDays(days: string): 'minute' | 'hourly' | 'daily' {
  if (days === '1') return 'minute'
  if (days === '7' || days === '30' || days === '90') return 'hourly'
  return 'daily'
}

async function fetchHistories(ids: string[], days: string): Promise<Record<string, Point[]>> {
  const interval = intervalForDays(days)
  const urls = ids.map(
    id => `/api/price-history?id=${encodeURIComponent(id)}&days=${encodeURIComponent(days)}&interval=${interval}`
  )
  const settled = await Promise.allSettled(
    urls.map(async (u) => {
      const r = await fetch(u, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      // NEW CORE SHAPE: { id, currency, points:[{t,p}], updatedAt }
      const j = await r.json()
      const pts = Array.isArray(j?.points) ? j.points : []
      const series: Point[] = pts
        .map((row: any) => ({ t: Number(row.t), v: Number(row.p) })) // map p -> v for chart
        .filter((p: any) => Number.isFinite(p.t) && Number.isFinite(p.v))
        .sort((a: Point, b: Point) => a.t - b.t)
      return series
    })
  )
  const byId: Record<string, Point[]> = {}
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') byId[ids[i]] = res.value as Point[]
  })
  return byId
}

/* ── alignment-based aggregation (smooth, with interpolation) ───────────── */
function buildAlignedPortfolioSeries(
  coinIds: string[],
  historiesMap: Record<string, Point[]>,
  tradesByCoin: Map<string, TradeLite[]>,
  windowStart: number | null,
  stepMs: number
): Point[] {
  const now = Date.now()

  // Choose the start of the window
  let start = windowStart ?? Number.POSITIVE_INFINITY
  if (windowStart == null) {
    for (const id of coinIds) {
      const s = historiesMap[id]
      if (s && s.length) start = Math.min(start, s[0].t)
    }
    if (!Number.isFinite(start)) start = now - 24 * 60 * 60 * 1000
  }
  const end = now

  type Cursor = { priceIdx: number; tradeIdx: number; qty: number }

  const cursors = new Map<string, Cursor>()
  for (const id of coinIds) {
    const series = (historiesMap[id] ?? []).slice().sort((a, b) => a.t - b.t)
    const trades = (tradesByCoin.get(id) ?? []).slice().sort(
      (a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime()
    )

    const cur: Cursor = { priceIdx: 0, tradeIdx: 0, qty: 0 }

    // qty at window start
    while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= start) {
      const tr = trades[cur.tradeIdx++]
      cur.qty += tr.side === 'buy' ? tr.quantity : -tr.quantity
    }
    // price cursor at/just before start
    if (series.length) {
      while (cur.priceIdx + 1 < series.length && series[cur.priceIdx + 1].t <= start) cur.priceIdx++
    }
    cursors.set(id, cur)
  }

  function priceAt(series: Point[], idx: number, t: number): { price: number | null; idx: number } {
    const n = series.length
    if (!n) return { price: null, idx }
    while (idx + 1 < n && series[idx + 1].t <= t) idx++
    if (t <= series[0].t) return { price: series[0].v, idx: 0 }
    if (t >= series[n - 1].t) return { price: series[n - 1].v, idx: n - 1 }
    const a = series[idx], b = series[idx + 1]
    if (!a || !b) return { price: a?.v ?? null, idx }
    const span = b.t - a.t
    if (span <= 0) return { price: a.v, idx }
    const ratio = (t - a.t) / span
    return { price: a.v + (b.v - a.v) * ratio, idx }
  }

  const out: Point[] = []
  for (let t = start; t <= end; t += stepMs) {
    let total = 0
    for (const id of coinIds) {
      const series = historiesMap[id] ?? []
      const trades = (tradesByCoin.get(id) ?? [])
      const cur = cursors.get(id)!
      if (!cur) continue

      while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= t) {
        const tr = trades[cur.tradeIdx++]
        cur.qty += tr.side === 'buy' ? tr.quantity : -tr.quantity
      }

      const { price, idx } = priceAt(series, cur.priceIdx, t)
      cur.priceIdx = idx
      if (price != null && Number.isFinite(cur.qty)) total += cur.qty * price
    }
    out.push({ t, v: Math.max(0, total) })
  }

  if (out.length === 1) {
    const only = out[0]
    out.unshift({ t: only.t - stepMs, v: only.v })
  }
  return out
}

/* ── Coin-page timeframe UI port (exact styles) ───────────── */
type WindowKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'ytd' | 'max'
const TF_TO_WINDOW: Record<Timeframe, WindowKey> = {
  '24h': '24h', '7d': '7d', '30d': '30d', '90d': '90d', '1y': '1y', 'YTD': 'ytd', 'Max': 'max',
}
const WINDOW_TO_TF: Record<WindowKey, Timeframe> = {
  '24h': '24h', '7d': '7d', '30d': '30d', '90d': '90d', '1y': '1y', 'ytd': 'YTD', 'max': 'Max',
}

function WindowTabs({ value, onChange }: { value: WindowKey; onChange: (v: WindowKey) => void }) {
  const opts: WindowKey[] = ['24h', '7d', '30d', '90d', '1y', 'ytd', 'max']
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {opts.map(opt => {
        const active = value === opt
        return (
          <button
            key={opt}
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={[
              'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
              'bg-[rgb(28,29,31)] border',
              active
                ? 'border-[rgb(137,128,213)] text-[rgb(137,128,213)] shadow-[inset_0_0_0_1px_rgba(167,128,205,0.35)]'
                : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-500',
              'focus:ring-0 focus:outline-none'
            ].join(' ')}
          >
            {opt.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

/* ── Digit scroll (odometer) components — hydration-safe ──── */
const DIGITS = '0123456789'
function DigitReel({ digit }: { digit: string }) {
  if (!DIGITS.includes(digit)) return <span className="inline-block">{digit}</span>
  const idx = DIGITS.indexOf(digit)
  return (
    <span className="inline-block h-[1em] overflow-hidden align-baseline" style={{ lineHeight: '1em' }}>
      <span
        className="block will-change-transform"
        style={{ transform: `translateY(${-idx}em)`, transition: 'transform 500ms ease-out' }}
      >
        {DIGITS.split('').map(d => (
          <span key={d} className="block h-[1em]" style={{ lineHeight: '1em' }}>{d}</span>
        ))}
      </span>
    </span>
  )
}
function ScrollingNumericText({ text }: { text: string }) {
  return (
    <span className="inline-flex items-baseline" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {Array.from(text).map((ch, i) => <DigitReel key={i} digit={ch} />)}
    </span>
  )
}

function AlertsTooltip({
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
          .select('coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,is_active,user_id')
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

  type AlertItem = { side: 'Buy' | 'Sell'; symbol: string; cid: string }

  // ⬇ rich trades to compute fills exactly like Portfolio (fail-soft)
  type TradeRow = {
    coingecko_id: string
    side: 'buy' | 'sell'
    price: number
    quantity: number
    fee: number | null
    trade_time: string
    sell_planner_id: string | null
  }

  const { data: richTrades } = useSWR<TradeRow[]>(
    user && (alertCoinIds?.length ?? 0) ? ['/alerts/trades-rich', user.id] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('trades')
          .select('coingecko_id,side,price,quantity,fee,trade_time,sell_planner_id')
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
      const live = pricesMap instanceof Map ? (pricesMap.get(cid.toLowerCase()) ?? 0) : 0
      if (!(live > 0)) continue

      const top = Number(p.top_price ?? 0)
      const budget = Number(p.budget_usd ?? p.total_budget ?? 0)
      const depth: 70 | 90 = Number(p.ladder_depth) === 90 ? 90 : 70
      const growth = Number(p.growth_per_level ?? 0)
      if (!(top > 0) || !(budget > 0)) continue

      const plan: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)
      const buys: BuyTrade[] = (tradesByCoinRich.get(cid) ?? [])
        .filter(t => t.side === 'buy')
        .map(t => ({ price: t.price, quantity: t.quantity, fee: t.fee ?? 0, trade_time: t.trade_time }))

      const fills = computeBuyFills(plan, buys, 0)

      const hit = plan.some((lv, i) => {
        const lvl = Number(lv.price)
        if (!(lvl > 0)) return false
        const within = live <= lvl * 1.03
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
      const live = pricesMap instanceof Map ? (pricesMap.get(cid.toLowerCase()) ?? 0) : 0
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

/* ── page ──────────────────────────────────────────────────── */
export default function Page() {
  const { user } = useUser()
  const [tf, setTf] = useState<Timeframe>('30d')

  // Trades (all-time) — fail-soft + consistent options
  const { data: trades } = useSWR<TradeLite[]>(
    user ? ['/dashboard/trades-lite', user.id] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('trades')
          .select('coingecko_id,side,quantity,trade_time')
          .eq('user_id', user!.id)
        if (error) throw error
        return (data ?? []).map((t: any) => ({
          coingecko_id: String(t.coingecko_id),
          side: (String(t.side).toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
          quantity: Number(t.quantity ?? 0),
          trade_time: String(t.trade_time),
        })) as TradeLite[]
      } catch {
        return []
      }
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: tf === '24h',
      revalidateOnReconnect: true,
      keepPreviousData: true,
      refreshInterval: tf === '24h' ? 30_000 : 120_000,
      dedupingInterval: 10_000,
    }
  )

  const coinIds = useMemo(
    () => Array.from(new Set((trades ?? []).map(t => t.coingecko_id))).sort(), // sorted for stable keys below
    [trades]
  )

  // coins meta for tooltip labels — fail-soft
  const { data: coins } = useSWR<CoinMeta[]>(
    user ? ['/portfolio/coins'] : null,
    async () => {
      try {
        const res = await fetch('/api/coins', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const j = await res.json()
        return (j ?? []) as CoinMeta[]
      } catch {
        return []
      }
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      dedupingInterval: 30_000,
    }
  )

  // light trades map for tooltip deps (does not change existing logic)
  const tradesByCoinForAlerts = useMemo(() => {
    const m = new Map<string, TradeLite[]>()
    for (const tr of (trades ?? [])) {
      if (!m.has(tr.coingecko_id)) m.set(tr.coingecko_id, [])
      m.get(tr.coingecko_id)!.push(tr)
    }
    return m
  }, [trades])

  // TF-dependent histories for the chart series — robust key + keepPreviousData
  const { data: historiesMap } = useSWR<Record<string, Point[]>>(
    coinIds.length ? ['portfolio-histories', coinIds.join(','), daysParamFor(tf)] : null,
    () => fetchHistories(coinIds, daysParamFor(tf)),
    {
      revalidateOnMount: true,
      revalidateOnFocus: tf === '24h',
      revalidateOnReconnect: true,
      keepPreviousData: true,
      refreshInterval: tf === '24h' ? 30_000 : 120_000,
      dedupingInterval: 10_000,
    }
  )

  // TF-INDEPENDENT live histories for live balance display only (refresh 30s)
  const { data: historiesMapLive } = useSWR<Record<string, Point[]>>(
    coinIds.length ? ['portfolio-histories-live', coinIds.join(','), '1'] : null,
    () => fetchHistories(coinIds, '1'),
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      refreshInterval: 30_000,
      dedupingInterval: 10_000,
    }
  )

  const aggregated: Point[] = useMemo(() => {
    if (!historiesMap || !trades || coinIds.length === 0) return []
    const windowStart = rangeStartFor(tf)
    const step = stepMsFor(tf)

    const tradesByCoin = new Map<string, TradeLite[]>()
    for (const t of (trades ?? [])) {
      if (!tradesByCoin.has(t.coingecko_id)) tradesByCoin.set(t.coingecko_id, [])
      tradesByCoin.get(t.coingecko_id)!.push(t)
    }

    let series = buildAlignedPortfolioSeries(coinIds, historiesMap, tradesByCoin, windowStart, step)
    if (tf === 'YTD') {
      const ytd = startOfYTD()
      series = series.filter(p => p.t >= ytd)
    }
    return series
  }, [historiesMap, trades, coinIds.join(','), tf])

  // Live, timeframe-invariant total portfolio value
  const liveValue = useMemo(() => {
    if (!historiesMapLive || !trades || coinIds.length === 0) return 0
    const qtyById = new Map<string, number>()
    for (const id of coinIds) qtyById.set(id, 0)
    for (const tr of trades) {
      const cur = qtyById.get(tr.coingecko_id) ?? 0
      qtyById.set(tr.coingecko_id, cur + (tr.side === 'buy' ? tr.quantity : -tr.quantity))
    }
    let total = 0
    for (const id of coinIds) {
      const series = historiesMapLive[id] ?? []
      const last = series.length ? series[series.length - 1].v : null
      const qty = qtyById.get(id) ?? 0
      if (last != null && Number.isFinite(last) && Number.isFinite(qty)) {
        total += qty * last
      }
    }
    return Math.max(0, total)
  }, [historiesMapLive, trades, coinIds.join(',')])

  // Timeframe performance (from current aggregated series)
  const { delta, pct } = useMemo(() => {
    if (!aggregated || aggregated.length < 2) return { delta: 0, pct: 0 }
    const first = aggregated[0].v
    const last = aggregated[aggregated.length - 1].v
    const d = last - first
    const p = first > 0 ? (d / first) * 100 : 0
    return { delta: d, pct: p }
  }, [aggregated])

  const pctAbsText = Math.abs(pct).toFixed(2)
  const deltaDigitsOnly = Math.abs(delta).toFixed(2)

  return (
    <div data-portfolio-page className="space-y-6">
      {/* Top row: three mini-cards */}
      <div className="mx-4 md:mx-6 lg:mx-8 mb-8 md:mb-10 lg:mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)]">
            <div className="p-3 h-16 flex items-center justify-center">
              <span className="text-slate-200 text-base md:text-lg font-medium">x</span>
            </div>
          </div>
          <div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)]">
            <div className="p-3 h-16 flex items-center justify-center">
              <span className="text-slate-200 text-base md:text-lg font-medium">y</span>
            </div>
          </div>
               <Link
            href="/how-to"
            prefetch
            className="rounded-md border border-transparent ring-0 focus:ring-2 focus:ring-[rgba(51,65,85,0.35)] focus:outline-none bg-[rgb(28,29,31)] hover:bg-[rgba(28,29,31,0.9)] transition block"
          >
            <div className="p-3 h-16 flex items-center justify-center">
              <span className="text-slate-200 text-base md:text-lg font-medium">How to Use</span>
            </div>
          </Link>

        </div>
      </div>

      {/* Portfolio Balance (Live) card) */}
      <div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)] mx-4 md:mx-6 lg:mx-8 relative">
        {/* ABSOLUTE: Alerts in the card's top-right corner */}
        <div className="absolute top-4 right-4">
          <AlertsTooltip
            coinIds={coinIds}
            tradesByCoin={tradesByCoinForAlerts}
            coins={coins}
          />
        </div>

        {/* Header (left content spans full width now) */}
        <div className="px-4 pt-4">
          <div className="flex flex-col gap-4 md:gap-6">
            <h2 className="text-l md:text-l font-semibold tracking-tight pl-2 md:pl-3 lg:pl-4">Portfolio Balance</h2>
            <div className="text-3xl md:text-4xl font-bold text-slate-100 pl-2 md:pl-3 lg:pl-4">
              {fmtCurrency(liveValue)}
            </div>

            {/* % change row now spans the whole card width */}
            <div className="flex items-center">
              <div
                className={[
                  'text-sm md:text-lg font-medium',
                  'pl-2 md:pl-3 lg:pl-4',
                  pct >= 0 ? 'text-[rgb(124,188,97)]' : 'text-[rgb(214,66,78)]',
                ].join(' ')}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                <span>{pct >= 0 ? '+' : '-'}</span>
                <ScrollingNumericText text={pctAbsText} />
                <span>%</span>
                <span> (</span>
                <span>{delta >= 0 ? '' : '-'}</span>
                <span>$</span>
                <ScrollingNumericText text={deltaDigitsOnly} />
                <span>)</span>
              </div>

              {/* Timeframe selector: leave a small gap from the right edge */}
              <div className="ml-auto -mr-0.5">
                <WindowTabs
                  value={TF_TO_WINDOW[tf]}
                  onChange={(win) => setTf(WINDOW_TO_TF[win])}
                />
              </div>

            </div>
          </div>
        </div>

        {/* Card body */}
        <div className="p-4">
          <div className="-ml-4 w-[calc(100%+1rem)] h-[260px] md:h-[300px] lg:h-[320px]">
            <PortfolioGrowthChart data={aggregated} />
          </div>
        </div>

      </div>

      {/* Spacer */}
      <div className="h-2 md:h-2 lg:h-2"></div>

{/* Portfolio Holdings */}
<div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)] mx-4 md:mx-6 lg:mx-8">
  <div className="px-4 pt-4">
 <h2 className="text-md md:text-2xmd font-semibold tracking-tight">Portfolio Holdings</h2>
  </div>
  {/* Edge-to-edge table: no horizontal padding */}
  <div className="px-0 py-2 md:py-4">
    <PortfolioHoldingsTable
      coinIds={coinIds}
      historiesMapLive={historiesMapLive ?? {}}
      trades={trades}
      coins={coins}
    />
  </div>

</div>

 
    </div>
  )
}
