'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import PortfolioGrowthChart, { type Point } from '@/components/dashboard/PortfolioGrowthChart'
import { fmtCurrency } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import PortfolioHoldingsTable from '@/components/dashboard/PortfolioHoldingsTable'
import { AlertsTooltip } from '@/components/common/AlertsTooltip'
import RecentTradesCard from '@/components/dashboard/RecentTradesCard'

import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'

// TEMP: lib/planner no longer exports SellLevel/SellTrade as types.
// Use loose aliases here so the page compiles without affecting runtime.
type PlannerSellLevel = any
type PlannerSellTrade = any

type TradeLite = { coingecko_id: string; side: 'buy' | 'sell'; price: number; quantity: number; fee: number; trade_time: string }
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

// NOTE: for Max, we anchor to the user's first trade timestamp (not a hardcoded 10y window)
function rangeStartFor(tf: Timeframe, firstTradeMs?: number | null): number | null {
  const now = Date.now(), day = 24 * 60 * 60 * 1000
  switch (tf) {
    case '24h': return now - day
    case '7d': return now - 7 * day
    case '30d': return now - 30 * day
    case '90d': return now - 90 * day
    case '1y': return now - 365 * day
    case 'YTD': return startOfYTD()
    case 'Max': return (firstTradeMs != null && Number.isFinite(firstTradeMs)) ? firstTradeMs : null
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

// NOTE: for Max, request days from first trade -> now (prevents oversized calls + avoids 2-point synth histories)
function daysParamFor(tf: Timeframe, firstTradeMs?: number | null): string {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  switch (tf) {
    case '24h': return '1'
    case '7d': return '7'
    case '30d': return '30'
    case '90d': return '90'
    case '1y': return '365'

    // IMPORTANT: Avoid days="max" for YTD — it can fetch far more than needed and stall charts.
    // We compute a numeric day count from Jan 1 to today.
    case 'YTD': {
      const start = startOfYTD()
      const days = Math.max(1, Math.ceil((now - start) / day) + 1)
      return String(days)
    }

    // IMPORTANT: Max should start at the first transaction, not an arbitrary 10-year window.
    case 'Max': {
      if (firstTradeMs != null && Number.isFinite(firstTradeMs)) {
        const days = Math.max(1, Math.ceil((now - firstTradeMs) / day) + 1)
        return String(days)
      }
      // no trades yet → keep it reasonable
      return '365'
    }
  }
}
/* ── fetch helpers ─────────────────────────────────────────── */
// Choose a sensible interval for /api/price-history based on days
function intervalForDays(days: string): 'minute' | 'hourly' | 'daily' {
  if (days === '1') return 'minute'
  const n = Number(days)
  if (Number.isFinite(n) && n <= 7) return 'hourly'
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

// When CoinGecko fails (401), /api/price-history falls back to consensus.synth,
// which is typically a 2-point series (now and ~24h ago). Rendering that produces
// the diagonal "top-left to bottom-right" artifact on MAX.
// Treat it as unusable so MAX doesn't render misleading garbage.
if (series.length <= 2) return []

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

    // If we have no real history for any coin (or provider fell back to synth),
    // do NOT generate a tiny 2-point series (that becomes the diagonal line after live override).
    if (!Number.isFinite(start)) return []
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
/* ── Total P/L (WAC) series: realized + unrealized over time ───────────── */
type WacCursor = {
  priceIdx: number
  tradeIdx: number
  qtyHeld: number
  basis: number
  realized: number
}

function applyWacTrade(cur: WacCursor, tr: TradeLite) {
  const qty = Number(tr.quantity ?? 0)
  const price = Number(tr.price ?? 0)
  const fee = Number(tr.fee ?? 0)
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return

  if (tr.side === 'buy') {
    cur.basis += qty * price + (Number.isFinite(fee) ? fee : 0)
    cur.qtyHeld += qty
    return
  }

  // sell
  const sellQty = Math.min(qty, Math.max(0, cur.qtyHeld))
  if (sellQty <= 0) return

  const avgCost = cur.qtyHeld > 0 ? cur.basis / cur.qtyHeld : 0
  cur.realized += sellQty * (price - avgCost) - (Number.isFinite(fee) ? fee : 0)
  cur.basis -= sellQty * avgCost
  cur.qtyHeld -= sellQty

  if (cur.qtyHeld <= 1e-12) {
    cur.qtyHeld = 0
    cur.basis = 0
  }
}

function computePortfolioCostBasisAt(
  coinIds: string[],
  tradesByCoin: Map<string, TradeLite[]>,
  atMs: number
): number {
  let total = 0
  for (const id of coinIds) {
    const trades = tradesByCoin.get(id) ?? []
    const cur: WacCursor = { priceIdx: 0, tradeIdx: 0, qtyHeld: 0, basis: 0, realized: 0 }
    while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= atMs) {
      applyWacTrade(cur, trades[cur.tradeIdx++])
    }
    total += cur.basis
  }
  return total
}

function buildAlignedPortfolioPLSeries(
  coinIds: string[],
  historiesMap: Record<string, Point[]>,
  tradesByCoin: Map<string, TradeLite[]>,
  windowStart: number | null,
  stepMs: number,
  livePricesById?: Record<string, number>
): Point[] {
  const now = Date.now()

  // Choose the start of the window
  let start = windowStart ?? Number.POSITIVE_INFINITY
  if (windowStart == null) {
    for (const id of coinIds) {
      const s = historiesMap[id]
      if (s && s.length) start = Math.min(start, s[0].t)
    }

    // Same guard as value mode: don't render a fake/degenerate Max series.
    if (!Number.isFinite(start)) return []
  }

  const end = now

  const cursors = new Map<string, WacCursor>()
  const seriesById = new Map<string, Point[]>()

  for (const id of coinIds) {
    const series = (historiesMap[id] ?? []).slice().sort((a, b) => a.t - b.t)
    seriesById.set(id, series)

    const trades = tradesByCoin.get(id) ?? []
    const cur: WacCursor = { priceIdx: 0, tradeIdx: 0, qtyHeld: 0, basis: 0, realized: 0 }

    // WAC state at window start
    while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= start) {
      applyWacTrade(cur, trades[cur.tradeIdx++])
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
    let totalPL = 0

    for (const id of coinIds) {
      const trades = tradesByCoin.get(id) ?? []
      const cur = cursors.get(id)
      const series = seriesById.get(id) ?? []
      if (!cur) continue

      while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= t) {
        applyWacTrade(cur, trades[cur.tradeIdx++])
      }

      let price: number | null = null
      if (t === end && livePricesById && Number.isFinite(livePricesById[id])) {
        price = Number(livePricesById[id])
      } else {
        const r = priceAt(series, cur.priceIdx, t)
        price = r.price
        cur.priceIdx = r.idx
      }
      if (price == null) continue

      const avgCost = cur.qtyHeld > 0 ? cur.basis / cur.qtyHeld : 0
      const unrealized = cur.qtyHeld * (price - avgCost)
      totalPL += cur.realized + unrealized
    }

    out.push({ t, v: totalPL })
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



/* ── page ──────────────────────────────────────────────────── */
export default function Page() {
  const { user } = useUser()
  const [tf, setTf] = useState<Timeframe>('30d')
  const STORAGE_KEY_TOTAL_PL = 'lg1.dashboard.showTotalPL'
  const [showTotalPL, setShowTotalPL] = useState(false)


  // On mount: load saved preference
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TOTAL_PL)
      if (raw === '1') setShowTotalPL(true)
      if (raw === '0') setShowTotalPL(false)
    } catch {
      // fail-soft (private mode / blocked storage)
    }
  }, [])

  // Whenever it changes: persist preference
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TOTAL_PL, showTotalPL ? '1' : '0')
    } catch {
      // fail-soft
    }
  }, [showTotalPL])

  
  // Trades (all-time) — fail-soft + consistent options
  const { data: trades } = useSWR<TradeLite[]>(
    user ? ['/dashboard/trades-lite', user.id] : null,
    async () => {
      try {
        const { data, error } = await supabaseBrowser
           .from('trades')
          .select('coingecko_id,side,price,quantity,fee,trade_time')
          .eq('user_id', user!.id)
        if (error) throw error
        return (data ?? []).map((t: any) => ({
          coingecko_id: String(t.coingecko_id),
          side: (String(t.side).toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
          price: Number(t.price ?? 0),
          quantity: Number(t.quantity ?? 0),
          fee: Number(t.fee ?? 0),
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
const tradesByCoin = useMemo(() => {
  const m = new Map<string, TradeLite[]>()
  for (const tr of (trades ?? [])) {
    if (!m.has(tr.coingecko_id)) m.set(tr.coingecko_id, [])
    m.get(tr.coingecko_id)!.push(tr)
  }
  for (const [id, arr] of m.entries()) {
    arr.sort((a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime())
    m.set(id, arr)
  }
  return m
}, [trades])
  // First transaction timestamp (used to anchor MAX)
  const firstTradeMs = useMemo<number | null>(() => {
    if (!trades || trades.length === 0) return null
    let min = Number.POSITIVE_INFINITY
    for (const tr of trades) {
      const t = new Date(tr.trade_time).getTime()
      if (Number.isFinite(t)) min = Math.min(min, t)
    }
    return Number.isFinite(min) ? min : null
  }, [trades])

  // TF-dependent histories for the chart series — robust key + keepPreviousData
   // Make history polling environment-aware to avoid hammering CoinGecko in dev.
  // In development: no auto-refresh (refreshInterval 0, no focus revalidation).
  // In production: keep the existing behavior (30s for 24h view, 120s otherwise).
  const isDev = process.env.NODE_ENV === 'development'

  const historyRefreshInterval =
    isDev
      ? 0 // no polling in dev; manual reload is enough
      : tf === '24h'
        ? 30_000
        : 120_000

  const historyRevalidateOnFocus = isDev ? false : tf === '24h'

const daysParam = useMemo(() => daysParamFor(tf, firstTradeMs), [tf, firstTradeMs])

  const { data: historiesMap } = useSWR<Record<string, Point[]>>(
    coinIds.length ? ['portfolio-histories', coinIds.join(','), daysParam] : null,
    () => fetchHistories(coinIds, daysParam),
    {
      revalidateOnFocus: historyRevalidateOnFocus,
      refreshInterval: historyRefreshInterval,
      keepPreviousData: true,
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
const livePricesById = useMemo<Record<string, number>>(() => {
  if (!historiesMapLive || coinIds.length === 0) return {}
  const out: Record<string, number> = {}
  for (const id of coinIds) {
    const series = historiesMapLive[id] ?? []
    const last = series.length ? series[series.length - 1].v : null
    if (last != null && Number.isFinite(last)) out[id] = last
  }
  return out
}, [historiesMapLive, coinIds.join(',')])

const aggregated: Point[] = useMemo(() => {
  if (!historiesMap || !trades || coinIds.length === 0) return []
const windowStart = rangeStartFor(tf, firstTradeMs)
  const step = stepMsFor(tf)

  let series = buildAlignedPortfolioSeries(coinIds, historiesMap, tradesByCoin, windowStart, step)
  if (tf === 'YTD') {
    const ytd = startOfYTD()
    series = series.filter(p => p.t >= ytd)
  }
  return series
}, [historiesMap, trades, coinIds.join(','), tf, tradesByCoin, firstTradeMs])
const totalPLSeries: Point[] = useMemo(() => {
  if (!historiesMap || !trades || coinIds.length === 0) return []
const windowStart = rangeStartFor(tf, firstTradeMs)

  const step = stepMsFor(tf)

  let series = buildAlignedPortfolioPLSeries(coinIds, historiesMap, tradesByCoin, windowStart, step, livePricesById)
  if (tf === 'YTD') {
    const ytd = startOfYTD()
    series = series.filter(p => p.t >= ytd)
  }
  return series
}, [historiesMap, trades, coinIds.join(','), tf, tradesByCoin, livePricesById, firstTradeMs])

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

  // Portfolio profits (full portfolio): realized, unrealized, total
  const { totalProfit, realizedProfit, unrealizedProfit } = useMemo(() => {
    if (!trades || trades.length === 0) return { totalProfit: 0, realizedProfit: 0, unrealizedProfit: 0 }

    const byId = new Map<string, TradeLite[]>()
    for (const tr of trades) {
      if (!byId.has(tr.coingecko_id)) byId.set(tr.coingecko_id, [])
      byId.get(tr.coingecko_id)!.push(tr)
    }

    let realized = 0
    let unrealized = 0

    for (const [id, list] of byId.entries()) {
      const pnl = computePnl(
        list.map((t): PnlTrade => ({
          side: t.side,
          price: t.price,
          quantity: t.quantity,
          fee: t.fee,
          trade_time: t.trade_time,
        }))
      )

      realized += pnl.realizedPnl

      const series = historiesMapLive?.[id] ?? []
      const last = series.length ? series[series.length - 1].v : null
      if (last != null && Number.isFinite(last)) {
        const currentValue = pnl.positionQty * last
        unrealized += currentValue - pnl.costBasis
      }
    }

    return { totalProfit: realized + unrealized, realizedProfit: realized, unrealizedProfit: unrealized }
  }, [trades, historiesMapLive])
const chartSeries: Point[] = useMemo(() => {
  const base = showTotalPL ? totalPLSeries : aggregated
  if (!base || base.length === 0) return []
  const out = base.slice()
  const lastIdx = out.length - 1

  // Keep terminal point “current” for both modes:
  // - Value mode: force last point to liveValue
  // - P/L mode: force last point to totalProfit (same as KPI)
  out[lastIdx] = {
    ...out[lastIdx],
    v: showTotalPL ? totalProfit : liveValue,
  }

  return out
}, [showTotalPL, totalPLSeries, aggregated, totalProfit, liveValue])

  // Timeframe performance for the currently selected chart series
const { delta, pct } = useMemo(() => {
  if (!chartSeries || chartSeries.length < 2) return { delta: 0, pct: 0 }

  const firstPoint = chartSeries[0]
  const lastPoint = chartSeries[chartSeries.length - 1]

  const first = firstPoint.v
  const last = lastPoint.v
  const d = last - first

  // VALUE mode (toggle OFF): percent change in portfolio VALUE over the window.
  // This is intentionally "value change" (can include buy jumps) because the chart is Value.
  if (!showTotalPL) {
    const p = first > 0 ? (d / first) * 100 : 0
    return { delta: d, pct: p }
  }

  // TOTAL P/L mode (toggle ON): percent change in total P/L over the window,
  // scaled by capital deployed over that window (avoid distortions when you add/remove capital).
  const basisStart = computePortfolioCostBasisAt(coinIds, tradesByCoin, firstPoint.t)
  const basisEnd = computePortfolioCostBasisAt(coinIds, tradesByCoin, lastPoint.t)
  const denom = Math.max(basisStart, basisEnd)

  const p = denom > 0 ? (d / denom) * 100 : 0
  return { delta: d, pct: p }
}, [chartSeries, showTotalPL, coinIds.join(','), tradesByCoin])


  const pctAbsText = Math.abs(pct).toFixed(2)
  const deltaDigitsOnly = Math.abs(delta).toFixed(2)

return (
    <div data-dashboard-page className="space-y-6">

      {/* Top row: portfolio profits */}
      <div className="mx-4 md:mx-6 lg:mx-8 mb-8 md:mb-10 lg:mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)]">
            <div className="p-3 h-16 flex flex-col items-center justify-center leading-tight">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Profits</div>
              <div className="text-slate-100 text-base md:text-lg font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(totalProfit)}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)]">
            <div className="p-3 h-16 flex flex-col items-center justify-center leading-tight">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Realized Profits</div>
              <div className="text-slate-100 text-base md:text-lg font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(realizedProfit)}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-transparent ring-0 focus:ring-0 focus:outline-none bg-[rgb(28,29,31)]">
            <div className="p-3 h-16 flex flex-col items-center justify-center leading-tight">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Unrealized Profits</div>
              <div className="text-slate-100 text-base md:text-lg font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(unrealizedProfit)}
              </div>
            </div>
          </div>
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

{/* Chart mode + timeframe selector */}
<div className="ml-auto -mr-0.5 flex items-center gap-2">
  <button
    type="button"
    aria-pressed={showTotalPL}
    onClick={() => setShowTotalPL(v => !v)}
    className={[
      'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
      'bg-[rgb(28,29,31)] border',
      showTotalPL
        ? 'border-[rgb(137,128,213)] text-[rgb(137,128,213)] shadow-[inset_0_0_0_1px_rgba(167,128,205,0.35)]'
        : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-500',
      'focus:ring-0 focus:outline-none'
    ].join(' ')}
title="Toggle Total P&L (realized + unrealized vs your cost basis)"
  >
    Total P&amp;L
  </button>

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
                 <div className="-ml-4 w-[calc(100%+1rem)] h-[260px] md:h-[300px] lg:h-[320px] relative">
            {coinIds.length > 0 && !historiesMap && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Loading portfolio history…
              </div>
            )}
{tf === 'Max' && chartSeries.length === 0 ? (
  <div className="h-[260px] w-full rounded-xl border border-slate-700/40 bg-[rgb(18,19,21)] flex items-center justify-center">
    <div className="text-sm text-slate-400">
      Max history is currently unavailable (price history provider returned limited data).
    </div>
  </div>
) : (
  <PortfolioGrowthChart data={chartSeries} />
)}
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
{/* Transactions (all coins) — exact UI from coin page */}
<div className="mx-4 md:mx-6 lg:mx-8">
  <RecentTradesCard />
</div>
 
    </div>
  )
}
