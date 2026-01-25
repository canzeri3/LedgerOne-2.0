'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import { useHistory, usePrice } from '@/lib/dataCore'

type Props = {
  coingeckoId?: string
  id?: string
}

type HistoryPoint = { t: number; p: number } // unix ms, price
type WindowKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'ytd' | 'max'
type Interval = 'minute' | 'hourly' | 'daily'

/* --------------------------------- helpers -------------------------------- */

function startOfYTD(): number {
  const n = new Date()
  return new Date(n.getFullYear(), 0, 1).getTime()
}

/**
 * Map UI window → NEW data core args (days + interval).
 * NOTE: MAX days is overridden in-component to start at the first trade.
 */
function historySpec(win: WindowKey): { days: number; interval?: Interval; ytdStart?: number } {
  const DAY = 24 * 60 * 60 * 1000

  if (win === 'ytd') {
    const y0 = startOfYTD()
    const days = Math.max(1, Math.ceil((Date.now() - y0) / DAY) + 1)
    return { days, interval: 'daily', ytdStart: y0 }
  }

  switch (win) {
    case '24h':
      return { days: 1, interval: 'minute' }
    case '7d':
      return { days: 7, interval: 'hourly' }
    case '30d':
      return { days: 30, interval: 'daily' }
    case '90d':
      return { days: 90, interval: 'daily' }
    case '1y':
      return { days: 365, interval: 'daily' }
    case 'max':
      // Placeholder; real MAX starts at first trade (computed in component).
      return { days: 3650, interval: 'daily' }
    default:
      return { days: 30, interval: 'daily' }
  }
}

function dedupByTime(points: HistoryPoint[]): HistoryPoint[] {
  const seen = new Set<number>()
  const out: HistoryPoint[] = []
  for (const pt of points) {
    if (!seen.has(pt.t)) {
      out.push(pt)
      seen.add(pt.t)
    }
  }
  return out
}

function n(v: any): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/* ------------------------- WAC P/L helpers (coin) -------------------------- */

type TradeRow = {
  side: string
  quantity: number
  price: number
  fee: number
  trade_time: string
}

type WacState = {
  qtyHeld: number
  basis: number
  realized: number
}

function applyWacTrade(cur: WacState, tr: TradeRow) {
  const qty = n(tr.quantity)
  const price = n(tr.price)
  const fee = n(tr.fee)

  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return

  const side = String(tr.side ?? '').toLowerCase()
  const isBuy = side.startsWith('b')

  if (isBuy) {
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

function wacStateAt(trades: TradeRow[], atMs: number): WacState {
  const cur: WacState = { qtyHeld: 0, basis: 0, realized: 0 }
  for (const tr of trades) {
    const t = new Date(tr.trade_time).getTime()
    if (t <= atMs) applyWacTrade(cur, tr)
    else break
  }
  return cur
}

function totalPlAtPrice(cur: WacState, price: number): number {
  if (!Number.isFinite(price)) return cur.realized
  const avgCost = cur.qtyHeld > 0 ? cur.basis / cur.qtyHeld : 0
  const unrealized = cur.qtyHeld * (price - avgCost)
  return cur.realized + unrealized
}

/* ---------------------------------- UI ------------------------------------ */

function WindowTabs({ value, onChange }: { value: WindowKey; onChange: (v: WindowKey) => void }) {
  const opts: WindowKey[] = ['24h', '7d', '30d', '90d', '1y', 'ytd', 'max']
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {opts.map((opt) => {
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
            ].join(' ')}
          >
            {opt.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

function dateFormatter(ts: number, win: WindowKey) {
  const d = new Date(ts)
  if (win === '24h' || win === '7d') {
    return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
  }
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/* -------------------- Odometer-style percent ticker ---------------------- */

function PercentTicker({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="tabular-nums">--.--%</span>
  }

  const target = useMemo(() => {
    const v = Math.max(-9999.99, Math.min(9999.99, value))
    const abs = Math.abs(v)
    const s = abs.toFixed(2) + '%'
    return s
  }, [value])

  const chars = target.split('')

  return (
    <span className="inline-flex items-center gap-0.5 align-middle tabular-nums">
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitWheel key={i} digit={Number(ch)} direction={value >= 0 ? 'up' : 'down'} />
        ) : (
          <span key={i} className="tabular-nums leading-none">
            {ch}
          </span>
        )
      )}
    </span>
  )
}

/* -------------------- Odometer-style amount ticker ----------------------- */

function AmountTicker({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="tabular-nums">{fmtCurrency(0)}</span>
  }

  const target = useMemo(() => {
    const absStr = fmtCurrency(Math.abs(value))
    return absStr
  }, [value])

  const chars = target.split('')

  return (
    <span className="inline-flex items-center gap-0.5 align-middle tabular-nums">
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitWheel key={i} digit={Number(ch)} direction={value >= 0 ? 'up' : 'down'} />
        ) : (
          <span key={i} className="leading-none">
            {ch}
          </span>
        )
      )}
    </span>
  )
}

function DigitWheel({
  digit,
  direction,
  duration = 420,
}: {
  digit: number
  direction: 'up' | 'down'
  duration?: number
}) {
  const [curr, setCurr] = useState<number>(digit)
  const [pos, setPos] = useState<number>(0)
  const prevRef = useRef<number>(digit)

  const sequence = useMemo(() => {
    const base = Array.from({ length: 10 }, (_, d) => d)
    return base.concat(base)
  }, [])

  const computeIndices = (from: number, to: number) => {
    const baseIndex = from
    const forwardTarget = to >= from ? to : to + 10
    const backwardTarget = to <= from ? to : to - 10
    const deltaUp = Math.abs(forwardTarget - baseIndex)
    const deltaDown = Math.abs(baseIndex - backwardTarget)
    if (direction === 'up') return { start: baseIndex, end: forwardTarget, delta: deltaUp }
    return { start: baseIndex, end: backwardTarget, delta: deltaDown }
  }

  useEffect(() => {
    const prev = prevRef.current
    if (prev === digit) return

    const { start, end } = computeIndices(prev, digit)
    setPos(-start)

    const raf = requestAnimationFrame(() => {
      setPos(-end)
    })

    const t = setTimeout(() => {
      prevRef.current = digit
      setCurr(digit)
      setPos(-digit)
    }, duration + 40)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digit, direction, duration])

  useEffect(() => {
    setCurr(digit)
    prevRef.current = digit
    setPos(-digit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span className="relative inline-block h-[1em] overflow-hidden align-middle" style={{ lineHeight: '1em', width: '0.62em' }}>
      <span
        className="flex flex-col tabular-nums leading-none"
        style={{
          transform: `translateY(${pos}em)`,
          transition: `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
          willChange: 'transform',
        }}
      >
        {sequence.map((d, idx) => (
          <span key={idx} className="leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

/* ------------------------------ main component --------------------------- */

function CustomTooltip({
  active,
  label,
  payload,
  win,
}: {
  active?: boolean
  label?: any
  payload?: any[]
  win: WindowKey
}) {
  if (!active || !payload || !payload.length) return null

  // We plot "value" (either coin value OR total P/L depending on toggle).
  const entry = payload[0]
  const vNum = Number(entry?.value)
  const vText = Number.isFinite(vNum) ? fmtCurrency(vNum) : '--'

  const dateText = dateFormatter(Number(label), win)

  return (
    <div
      style={{
        background: 'rgb(28,29,31)',
        border: '1px solid rgb(55,56,57)',
        borderRadius: 6,
        padding: '12px 16px',
        minWidth: '180px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: 'rgb(225,225,225)' }}>{vText}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'rgb(160,161,162)' }}>{dateText}</div>
    </div>
  )
}

export default function CoinValueChart({ coingeckoId, id }: Props) {
  const coinId = coingeckoId ?? id!
  const { user, loading } = useUser()

  const [win, setWin] = useState<WindowKey>('30d')

  // Persisted toggle (same behavior as dashboard)
  const STORAGE_KEY_TOTAL_PL = 'lg1.coinChart.showTotalPL'
  const [showTotalPL, setShowTotalPL] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TOTAL_PL)
      if (raw === '1') setShowTotalPL(true)
      if (raw === '0') setShowTotalPL(false)
    } catch {
      // fail-soft
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TOTAL_PL, showTotalPL ? '1' : '0')
    } catch {
      // fail-soft
    }
  }, [showTotalPL])

  // ---- Fetch trades (needed for qty + WAC P/L)
  const { data: trades } = useSWR<TradeRow[]>(
    !loading && user ? ['coin-chart/trades', user.id, coinId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('side,quantity,price,fee,trade_time')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coinId)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []) as TradeRow[]
    },
    { refreshInterval: 60_000 }
  )

  const firstTradeMs = useMemo(() => {
    if (!trades || trades.length === 0) return null
    const t0 = new Date(trades[0].trade_time).getTime()
    return Number.isFinite(t0) ? t0 : null
  }, [trades])

  // Precompute qty steps over time (step function) for VALUE mode
  const qtySteps = useMemo(() => {
    const steps: { t: number; qty: number }[] = []
    let running = 0
    for (const tr of trades ?? []) {
      const t = new Date(tr.trade_time).getTime()
      const q = n(tr.quantity)
      const isBuy = String(tr.side ?? '').toLowerCase().startsWith('b')
      running += isBuy ? q : -q
      if (steps.length && steps[steps.length - 1].t === t) {
        steps[steps.length - 1].qty = running
      } else {
        steps.push({ t, qty: running })
      }
    }
    return steps
  }, [trades])

  const currentQty = useMemo(() => {
    if (!qtySteps.length) return 0
    return qtySteps[qtySteps.length - 1].qty
  }, [qtySteps])

  // Price history for the selected window (NEW data core: /api/price-history)
  const spec = useMemo(() => historySpec(win), [win])

  // MAX: start at first transaction (no 10y lookback)
  const daysArg = useMemo(() => {
    const DAY = 24 * 60 * 60 * 1000
    if (win !== 'max') return spec.days
    if (firstTradeMs == null) return 365 // safe fallback when no trades
    const days = Math.max(1, Math.ceil((Date.now() - firstTradeMs) / DAY) + 1)
    return Math.min(3650, days)
  }, [win, spec.days, firstTradeMs])

  const intervalArg = useMemo<Interval | undefined>(() => {
    if (win === 'max') return 'daily'
    return spec.interval
  }, [win, spec.interval])

  const { points: histRaw, isLoading: historyLoading } = useHistory(
    coinId ? coinId : null,
    daysArg,
    intervalArg,
    'USD',
    { refreshInterval: 60_000 }
  )

  // Live price (NEW data core)
  const { row: liveRow } = usePrice(coinId ? coinId : null, 'USD', { refreshInterval: 60_000 })
  const livePrice = Number(liveRow?.price)

  // Normalize history: order/dupes + YTD filter; guard degenerate 2-pt synth series
  const history = useMemo(() => {
    const arr = Array.isArray(histRaw) ? histRaw : []
    const norm = arr
      .map((pt: any) => ({ t: Number(pt.t), p: Number(pt.p) }))
      .filter((pt: any) => Number.isFinite(pt.t) && Number.isFinite(pt.p))
      .sort((a: any, b: any) => a.t - b.t)

    const deduped = dedupByTime(norm)

    // If provider fell back to a synthetic 2-point series, treat as unusable (prevents MAX artifacts).
    if (win === 'max' && deduped.length <= 2) return []

    if (spec.ytdStart != null) return deduped.filter((pt) => pt.t >= spec.ytdStart!)
    return deduped
  }, [histRaw, spec.ytdStart, win])

  // VALUE series: qty_at_t * price_t
  type SeriesPoint = { t: number; value: number }

  const valueSeries = useMemo<SeriesPoint[]>(() => {
    const hist = history ?? []
    if (!hist.length) return []
    if (!qtySteps.length) return hist.map((h) => ({ t: h.t, value: 0 }))

    const times = qtySteps.map((s) => s.t)

    function qtyAt(t: number) {
      let lo = 0,
        hi = times.length - 1,
        ansIdx = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (times[mid] <= t) {
          ansIdx = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      return ansIdx >= 0 ? qtySteps[ansIdx].qty : 0
    }

    const out: SeriesPoint[] = []
    for (const h of hist) {
      const qty = qtyAt(h.t)
      out.push({ t: h.t, value: qty * h.p })
    }
    return out
  }, [history, qtySteps])

  // TOTAL P/L series (WAC): realized + unrealized at each price timestamp
  const plSeries = useMemo<SeriesPoint[]>(() => {
    const hist = history ?? []
    if (!hist.length) return []
    const tds = trades ?? []
    if (!tds.length) return hist.map((h) => ({ t: h.t, value: 0 }))

    const cur: WacState = { qtyHeld: 0, basis: 0, realized: 0 }
    let tradeIdx = 0

    const out: SeriesPoint[] = []
    for (const h of hist) {
      const t = h.t
      while (tradeIdx < tds.length && new Date(tds[tradeIdx].trade_time).getTime() <= t) {
        applyWacTrade(cur, tds[tradeIdx])
        tradeIdx++
      }
      out.push({ t, value: totalPlAtPrice(cur, h.p) })
    }
    return out
  }, [history, trades])

  // Live overrides for terminal point
  const liveValue = useMemo(() => {
    if (!Number.isFinite(livePrice)) return null
    return currentQty * livePrice
  }, [currentQty, livePrice])

  const liveTotalPL = useMemo(() => {
    if (!Number.isFinite(livePrice)) return null
    const tds = trades ?? []
    if (!tds.length) return 0
    const cur = wacStateAt(tds, Date.now())
    return totalPlAtPrice(cur, livePrice)
  }, [trades, livePrice])

  const chartSeries = useMemo<SeriesPoint[]>(() => {
    const base = showTotalPL ? plSeries : valueSeries
    if (!base || base.length === 0) return []

    const out = base.slice()
    const lastIdx = out.length - 1

    if (!showTotalPL && liveValue != null && Number.isFinite(liveValue)) {
      out[lastIdx] = { ...out[lastIdx], value: liveValue }
    }

    if (showTotalPL && liveTotalPL != null && Number.isFinite(liveTotalPL)) {
      out[lastIdx] = { ...out[lastIdx], value: liveTotalPL }
    }

    return out
  }, [showTotalPL, plSeries, valueSeries, liveValue, liveTotalPL])

  // % and $ deltas:
  // - Value mode: percent change in VALUE over the window (can include buy jumps; that's expected in Value mode).
  // - P/L mode: percent change vs cost basis at window start (capital at risk), not vs P/L baseline.
  const { perfPct, perfDelta } = useMemo(() => {
    if (!chartSeries || chartSeries.length < 2) return { perfPct: undefined as number | undefined, perfDelta: undefined as number | undefined }

    if (!showTotalPL) {
      // anchor at first non-zero value in-window to avoid divide-by-zero before first buy
      const firstIdx = chartSeries.findIndex((d) => Number.isFinite(d.value) && d.value !== 0)
      if (firstIdx < 0) return { perfPct: undefined, perfDelta: undefined }
      const first = chartSeries[firstIdx].value
      const last = chartSeries[chartSeries.length - 1].value
      const d = last - first
      const p = first !== 0 ? (d / Math.abs(first)) * 100 : undefined
      return { perfPct: Number.isFinite(p as any) ? (p as number) : undefined, perfDelta: d }
    }

    // P/L mode: use basis at window start as denominator
    const startT = chartSeries[0].t
    const endT = chartSeries[chartSeries.length - 1].t
    const tds = trades ?? []
    const basisStart = wacStateAt(tds, startT).basis
    const denom = basisStart > 0 ? basisStart : wacStateAt(tds, endT).basis

    const first = chartSeries[0].value
    const last = chartSeries[chartSeries.length - 1].value
    const d = last - first
    const p = denom > 0 ? (d / denom) * 100 : undefined

    return { perfPct: Number.isFinite(p as any) ? (p as number) : undefined, perfDelta: d }
  }, [chartSeries, showTotalPL, trades])

  // Y-axis domain padding (avoid flat line)
  const yDomain = useMemo<(number | 'auto')[]>(() => {
    if (chartSeries.length === 0) return ['auto', 'auto']
    const values = chartSeries.map((d) => Number(d.value)).filter(Number.isFinite)
    if (!values.length) return ['auto', 'auto']
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      const span = Math.max(1, Math.abs(min) * 0.02)
      return [min - span, max + span]
    }
    const pad = 0.08
    const range = max - min
    return [min - range * pad, max + range * pad]
  }, [chartSeries])

  const gradientId = useMemo(() => 'cvfill-' + Math.random().toString(36).slice(2), [])

  const titleText = showTotalPL ? 'Total P&L' : 'Value'

  return (
    <div className="rounded-2xl border border-[rgb(28,29,31)] bg-[rgb(28,29,31)] px-3 py-4 md:px-4 md:py-5">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col items-start gap-0.5">
          <div className="text-xl md:text-2xl font-semibold leading-tight text-slate-200">{titleText}</div>

          {typeof perfPct === 'number' && typeof perfDelta === 'number' && (
            <span
              className={[
                'text-s md:text-sm font-medium flex items-baseline gap-2 tabular-nums',
                perfPct >= 0 ? 'text-[rgb(87,181,66)]' : 'text-[rgb(214,66,78)]',
              ].join(' ')}
            >
              <span className="tabular-nums">
                <PercentTicker value={perfPct} />
              </span>
              <span className="tabular-nums">
                (<AmountTicker value={perfDelta} />)
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showTotalPL}
            onClick={() => setShowTotalPL((v) => !v)}
            className={[
              'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
              'bg-[rgb(28,29,31)] border',
              showTotalPL
                ? 'border-[rgb(137,128,213)] text-[rgb(137,128,213)] shadow-[inset_0_0_0_1px_rgba(167,128,205,0.35)]'
                : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-500',
              'focus:ring-0 focus:outline-none',
            ].join(' ')}
            title="Toggle Total P&L (realized + unrealized vs your cost basis)"
          >
            Total P&amp;L
          </button>

          <WindowTabs value={win} onChange={setWin} />
        </div>
      </div>

      <div className="h-[300px] w-full md:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartSeries}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(168 157 250)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="rgb(168 157 250)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => dateFormatter(Number(v), win)}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmtCurrency(Number(v))}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={64}
              domain={yDomain as any}
            />

            <Tooltip
              cursor={false}
              wrapperStyle={{ outline: 'none' }}
              content={(tpProps) => <CustomTooltip {...tpProps} win={win} />}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="rgb(139 128 219)"
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={true}
              animationDuration={500}
              animationBegin={0}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {!historyLoading && (!history || history.length === 0) && (
        <div className="mt-4 rounded-md border border-slate-700/40 bg-slate-800/30 p-3 text-sm text-slate-400">
          No price history available for this window.
        </div>
      )}

      {history?.length > 0 && (!trades || trades.length === 0) && (
        <div className="mt-2 text-[11px] text-slate-400">
          No trades yet for this coin. The balance line will appear after your first buy.
        </div>
      )}
    </div>
  )
}
