'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import { useHistory } from '@/lib/dataCore'

type Props = {
  coingeckoId?: string
  id?: string
}

type HistoryPoint = { t: number; p: number } // unix ms, price
type WindowKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'ytd' | 'max'

const fetcher = (url: string) => fetch(url).then(r => r.json())

/* --------------------------------- helpers -------------------------------- */

function daysFor(win: WindowKey): string {
  switch (win) {
    case '24h': return '1'
    case '7d': return '7'
    case '30d': return '30'
    case '90d': return '90'
    case '1y': return '365'
    case 'ytd': return 'max' // we will filter to this year client-side
    case 'max': return 'max'
    default: return '30'
  }
}

function startOfYTD(): number {
  const n = new Date()
  return new Date(n.getFullYear(), 0, 1).getTime()
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

/* ---------------------------- data fetch routines ------------------------- */

async function fetchHistoryForWindow(id: string, win: WindowKey): Promise<HistoryPoint[]> {
  // Your existing route expects ?id=<slug>&days=<N|max>
  const days = daysFor(win)
  const url = `/api/coin-history?id=${encodeURIComponent(id)}&days=${encodeURIComponent(days)}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) return []
  const json = await r.json()
  // server returns { data: [{t,v}], meta }, but we also normalize common shapes
  const raw = (json?.data ?? json) as any

  // Case A: array of objects { t, v }
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object' && 'v' in raw[0]) {
    const out = raw.map((d: any) => ({ t: Number(d.t), p: Number(d.v) }))
      .filter(d => Number.isFinite(d.t) && Number.isFinite(d.p))
    out.sort((a, b) => a.t - b.t)
    return dedupByTime(out)
  }

  // Case B: Array payload — could be [[t,p], ...] OR [{ t, v }] OR [{ t, price/value/p }]
  if (Array.isArray(raw)) {
    const out: HistoryPoint[] = []
    for (const row of raw) {
      if (Array.isArray(row) && row.length >= 2) {
        const t = Number(row[0]); const p = Number(row[1])
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
        continue
      }
      if (row && typeof row === 'object') {
        const t = Number((row as any).t ?? (row as any).time ?? (row as any).timestamp)
        const p = Number((row as any).p ?? (row as any).price ?? (row as any).value ?? (row as any).v)
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
      }
    }
    out.sort((a, b) => a.t - b.t)
    return dedupByTime(out)
  }

  return []
}

/* ---------------------------------- UI ------------------------------------ */

// Individually floating timeframe buttons (like the screenshot)
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
              : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-500'
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
/**
 * Per-digit scroll-wheel animation for a fixed "##.##%" format.
 * - No external libs or CSS files.
 * - All digits use tabular figures to prevent layout shift.
 * - Only the ticker’s rendering is changed; all surrounding UI/logic untouched.
 */
function PercentTicker({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="tabular-nums">--.--%</span>
  }

  // We render a fixed 2-decimal string without sign (color outside indicates +/-)
  const target = useMemo(() => {
    // Clamp to a reasonable range to avoid absurd strings
    const v = Math.max(-9999.99, Math.min(9999.99, value))
    const abs = Math.abs(v)
    // Always at least one leading digit before decimal
    const s = abs.toFixed(2) + '%'
    return s
  }, [value])

  // split into chars; digits become wheels, others are static chars
  const chars = target.split('')

  return (
      <span className="inline-flex items-center gap-0.5 align-middle tabular-nums">    
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitWheel key={i} digit={Number(ch)} direction={value >= 0 ? 'up' : 'down'} />
        ) : (
          <span key={i} className="tabular-nums leading-none">{ch}</span>
        )
      )}
    </span>
  )
}

/* -------------------- NEW: Odometer-style amount ticker ------------------ */
/**
 * AmountTicker animates the digits of a currency string, mirroring PercentTicker.
 * - Uses fmtCurrency for locale/currency symbol, then strips the sign (color indicates +/-).
 * - Animates only digits; currency symbol, separators, and decimals remain static.
 */
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
          <span key={i} className="leading-none">{ch}</span>
        )
      )}
    </span>
  )
}

function DigitWheel({
  digit,
  direction,
  duration = 420, // ms
}: {
  digit: number
  direction: 'up' | 'down'
  duration?: number
}) {
  const [curr, setCurr] = useState<number>(digit)
  const [pos, setPos] = useState<number>(0) // translateY in em units per row
  const prevRef = useRef<number>(digit)

  // Prepare a double sequence to allow smooth wrap (… 0-9 0-9 …)
  const sequence = useMemo(() => {
    const base = Array.from({ length: 10 }, (_, d) => d)
    return base.concat(base) // length 20
  }, [])

  // Find an index window that lets us scroll minimal steps in chosen direction
  const computeIndices = (from: number, to: number) => {
    const baseIndex = from // treat 0..9 as their indices
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

    // compute minimal scroll in requested direction
    const { start, end } = computeIndices(prev, digit)

    // Set starting position (translateY in em; each row = 1em height)
    // Our visible window shows index range [start, start+…], so top is -start
    setPos(-start)

    // next paint -> animate to end
    const raf = requestAnimationFrame(() => {
      setPos(-end)
    })

    const t = setTimeout(() => {
      // after animation, normalize back into 0..9 space
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

  // Initial mount align
  useEffect(() => {
    setCurr(digit)
    prevRef.current = digit
    setPos(-digit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build rows like 0..9 0..9 to allow wrapping transitions
  return (
    <span
      className="relative inline-block h-[1em] overflow-hidden align-middle"
      style={{ lineHeight: '1em', width: '0.62em' }} // narrow width for monospace-like feel
    >
      <span
        className="flex flex-col tabular-nums leading-none"
        style={{
          transform: `translateY(${pos}em)`,
          transition: `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
          willChange: 'transform',
        }}
      >
        {sequence.map((d, idx) => (
          <span key={idx} className="leading-none">{d}</span>
        ))}
      </span>
    </span>
  )
}

/* ------------------------------ main component --------------------------- */

// --- Custom grey tooltip (sharp corners, price top, date bottom) ---
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

  // Prefer explicit 'price' from payload; otherwise fallback to the first entry
  const priceEntry = payload.find(p => p && p.name === 'price') || payload[0]
  const priceNum = Number(priceEntry?.value)
  const priceText = Number.isFinite(priceNum) ? fmtCurrency(priceNum) : '--'

  const dateText = dateFormatter(Number(label), win)

  return (
    <div
      style={{
        background: 'rgb(28,29,31)',           // grey background
        border: '1px solid rgb(55,56,57)',     // subtle grey border
        borderRadius: 6,                       // sharper corners
        padding: '12px 16px',
        minWidth: '180px',
        textAlign: 'center',        
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: 'rgb(225,225,225)' }}>
        {priceText}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'rgb(160,161,162)' }}>
        {dateText}
      </div>
    </div>
  )
}


export default function CoinValueChart({ coingeckoId, id }: Props) {
  const coinId = coingeckoId ?? id!
  const { user, loading } = useUser()
  const [win, setWin] = useState<WindowKey>('30d')

  // ---- Fetch trades (for qty over time)
  type TradeRow = { side: string; quantity: number; trade_time: string }
  const { data: trades } = useSWR<TradeRow[]>(
    !loading && user ? ['value-chart/trades', user.id, coinId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('side,quantity,trade_time')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coinId)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []) as TradeRow[]
    },
    { refreshInterval: 60_000 }
  )

  // Precompute qty steps over time (step function)
  const qtySteps = useMemo(() => {
    const steps: { t: number; qty: number }[] = []
    let running = 0
    for (const tr of (trades ?? [])) {
      const t = new Date(tr.trade_time).getTime()
      const q = n(tr.quantity)
      const isBuy = String(tr.side ?? '').toLowerCase().startsWith('b')
      running += isBuy ? q : -q
      // collapse multiple trades at the same timestamp
      if (steps.length && steps[steps.length - 1].t === t) {
        steps[steps.length - 1].qty = running
      } else {
        steps.push({ t, qty: running })
      }
    }
    return steps
  }, [trades])

  // Price history for the selected window
  const { data: histRaw } = useSWR<HistoryPoint[]>(
    coinId ? ['hist', coinId, win] : null,
    () => fetchHistoryForWindow(coinId, win),
    { refreshInterval: 60_000 }
  )

  // Filter YTD on client if needed
  const history = useMemo(() => {
    const arr = Array.isArray(histRaw) ? histRaw : []
    if (win === 'ytd') {
      const s = startOfYTD()
      return arr.filter(pt => pt.t >= s)
    }
    return arr
  }, [histRaw, win])

  // Compose the value series: at each price timestamp, multiply by qty at that time
  type SeriesPoint = { t: number; price: number; value: number }
  const series = useMemo<SeriesPoint[]>(() => {
    const hist = history ?? []
    if (!hist.length) return []
    if (!qtySteps.length) {
      // No trades yet -> value is always 0
      return hist.map(h => ({ t: h.t, price: h.p, value: 0 }))
    }
    // helper: find qty at time t (last step <= t)
    const times = qtySteps.map(s => s.t)
    function qtyAt(t: number) {
      // binary search
      let lo = 0, hi = times.length - 1, ansIdx = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (times[mid] <= t) { ansIdx = mid; lo = mid + 1 } else { hi = mid - 1 }
      }
      return ansIdx >= 0 ? qtySteps[ansIdx].qty : 0
    }
    const out: SeriesPoint[] = []
    for (const h of hist) {
      const qty = qtyAt(h.t)
      out.push({ t: h.t, price: h.p, value: qty * h.p })
    }
    return out
  }, [history, qtySteps])

  // Compute performance vs first non-zero value in-window
  const perf = useMemo(() => {
    const first = series.find(d => d.value !== 0)?.value
    const last = series.length ? series[series.length - 1].value : undefined
    if (!Number.isFinite(first) || !Number.isFinite(last)) return undefined
    if (first === 0) return undefined
    return (last! - first!) / Math.abs(first!)
  }, [series])

  // absolute $ change for the same window
  const perfDelta = useMemo(() => {
    const first = series.find(d => d.value !== 0)?.value
    const last = series.length ? series[series.length - 1].value : undefined
    if (!Number.isFinite(first) || !Number.isFinite(last)) return undefined
    return (last as number) - (first as number)
  }, [series])

  const isShortWin = win === '24h' || win === '7d'

  // Y-axis domain padding (avoid flat line)
  const yDomain = useMemo<(number | 'auto')[]>(() => {
    if (series.length === 0) return ['auto', 'auto']
    const values = series.map(d => Number(d.value)).filter(Number.isFinite)
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
  }, [series])

  const gradientId = `valueGrad_${(coinId || '').replace(/[^a-z0-9]/gi, '')}`

  // Re-animate the line when coin/window changes (or when the visible series range changes)
  const areaKey = useMemo(() => {
    const firstT = series.length ? series[0].t : 0
    const lastT = series.length ? series[series.length - 1].t : 0
    return `${coinId || ''}-${win}-${firstT}-${lastT}`
  }, [coinId, win, series])

  return (
<div className="rounded-2xl border border-[rgb(28,29,31)] bg-[rgb(28,29,31)] px-3 py-4 md:px-4 md:py-5">

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col items-start gap-0.5">
        <div className="text-lg md:text-xl font-semibold leading-tight text-slate-200">P&L</div>
        {typeof perf === 'number' && (
  <span className="text-xs md:text-sm font-medium text-[rgb(87,181,66)] flex items-baseline gap-2 tabular-nums">
    <span className="tabular-nums">
      <PercentTicker value={perf * 100} />
    </span>
    {typeof perfDelta === 'number' && (
      <span className="tabular-nums">
        (<AmountTicker value={perfDelta} />)
      </span>
    )}
  </span>
)}
        </div>
        <WindowTabs value={win} onChange={setWin} />
      </div>

      <div className="h-[300px] w-full md:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
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
              key={areaKey}
              type="monotone"
              dataKey="value"
              stroke="rgb(139 128 219)"
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={true}
              animationBegin={100}
              animationDuration={800}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Empty/zero states */}
      {!history?.length && (
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
