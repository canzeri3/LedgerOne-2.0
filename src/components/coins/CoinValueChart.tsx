'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'

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
    case 'ytd': return '365' // we’ll slice from Jan 1 client-side
    case 'max': return 'max'
  }
}

function normalizeHistory(raw: any): HistoryPoint[] {
  if (!raw) return []

  // Case A: Coingecko-like object { prices: [[ms, price], ...] }
  if (Array.isArray(raw?.prices)) {
    const out: HistoryPoint[] = []
    for (const row of raw.prices) {
      if (Array.isArray(row) && row.length >= 2) {
        const t = Number(row[0]); const p = Number(row[1])
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
      }
    }
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
        const p = Number(
          (row as any).p ??
          (row as any).price ??
          (row as any).value ??
          (row as any).v // supports { t, v }
        )
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
      }
    }
    out.sort((a, b) => a.t - b.t)
    return dedupByTime(out)
  }

  return []
}

function dedupByTime(arr: HistoryPoint[]): HistoryPoint[] {
  const out: HistoryPoint[] = []
  let lastT = -1
  for (const pt of arr) {
    if (pt.t !== lastT) out.push(pt)
    lastT = pt.t
  }
  return out
}

function compactCurrency(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3)  return (n / 1e3).toFixed(2) + 'k'
  return fmtCurrency(n)
}

function dateFormatter(ts: number, win: WindowKey): string {
  const d = new Date(ts)
  if (win === '24h' || win === '7d') {
    return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  if (win === '30d' || win === '90d' || win === '1y' || win === 'ytd') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  // max
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
}

function startOfYTD(): number {
  const now = new Date()
  return new Date(now.getFullYear(), 0, 1).getTime()
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
  return normalizeHistory(json)
}

/* ---------------------------- percent scroll ticker ----------------------- */

/** Scrolls digits (like an odometer) to the next value. */
function PercentTicker({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const prev = useRef<number>(value)
  const [display, setDisplay] = useState<number>(value)

  // Update displayed value when prop changes
  useEffect(() => {
    // Trigger re-render; the digit columns animate via CSS transitions
    setDisplay(value)
    prev.current = value
  }, [value])

  const abs = Math.abs(display)
  const str = abs.toFixed(decimals) // e.g., "12.34"
  const chars = str.split('')

  return (
    <span className="inline-flex items-baseline tabular-nums">
      {/* sign */}
      <span className="mr-0.5">{display >= 0 ? '+' : '-'}</span>

      {/* digits */}
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn key={i} digit={ch} />
        ) : (
          <span key={i} className="mx-0.5">
            {ch}
          </span>
        )
      )}

      {/* percent symbol */}
      <span className="ml-0.5">%</span>
    </span>
  )
}

function DigitColumn({ digit }: { digit: string }) {
  const idx = Math.min(9, Math.max(0, parseInt(digit, 10) || 0))
  // Each row is 1em tall; translate to the target digit
  const wrapStyle: React.CSSProperties = {
    height: '1em',
    lineHeight: '1em',
    overflow: 'hidden',
    display: 'inline-block',
    verticalAlign: 'baseline',
  }
  const colStyle: React.CSSProperties = {
    transform: `translateY(-${idx}em)`,
    transition: 'transform 420ms cubic-bezier(0.2, 0, 0, 1)',
    willChange: 'transform',
  }
  return (
    <span style={wrapStyle}>
      <span style={colStyle} className="block">
        {/* 0..9 stack, each row 1em tall */}
        <span style={{ display: 'block', height: '1em' }}>0</span>
        <span style={{ display: 'block', height: '1em' }}>1</span>
        <span style={{ display: 'block', height: '1em' }}>2</span>
        <span style={{ display: 'block', height: '1em' }}>3</span>
        <span style={{ display: 'block', height: '1em' }}>4</span>
        <span style={{ display: 'block', height: '1em' }}>5</span>
        <span style={{ display: 'block', height: '1em' }}>6</span>
        <span style={{ display: 'block', height: '1em' }}>7</span>
        <span style={{ display: 'block', height: '1em' }}>8</span>
        <span style={{ display: 'block', height: '1em' }}>9</span>
      </span>
    </span>
  )
}

/* ---------------------------------- UI ----------------------------------- */

function WindowTabs({
  value,
  onChange,
}: {
  value: WindowKey
  onChange: (v: WindowKey) => void
}) {
  const items: WindowKey[] = ['24h', '7d', '30d', '90d', '1y', 'ytd', 'max']
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((k) => {
        const active = value === k
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition
              ${active
                ? 'bg-slate-700 text-slate-100 ring-1 ring-slate-500/40'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 ring-1 ring-slate-700/40'
              }`}
            aria-pressed={active}
          >
            {k.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ main component --------------------------- */

export default function CoinValueChart({ coingeckoId, id }: Props) {
  const coinId = coingeckoId ?? id!
  const { user, loading } = useUser()
  const [win, setWin] = useState<WindowKey>('30d')

  // Holdings qty (sum buys - sells for the current user)
  const { data: holdingsQty } = useSWR<number>(
    !loading && user ? ['holdings-qty', user.id, coinId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('side, quantity')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coinId)
      if (error) throw error
      let qty = 0
      for (const t of data ?? []) {
        const side = String(t.side ?? '').toLowerCase()
        const q = n(t.quantity)
        if (side.startsWith('b')) qty += q
        else if (side.startsWith('s')) qty -= q
      }
      return qty
    },
    { refreshInterval: 60_000 }
  )

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

  // Compose the value series: value = holdingsQty * price
  const series = useMemo(() => {
    const qty = n(holdingsQty)
    if (!history?.length) return []
    return history.map(pt => ({
      t: pt.t,
      price: pt.p,
      value: qty * pt.p,
    }))
  }, [holdingsQty, history])

  // Percent change measured from start of window
  const perf = useMemo(() => {
    if (!series.length) return null
    const first = series[0].value
    const last = series[series.length - 1].value
    if (!first || !Number.isFinite(first)) return null
    return (last - first) / first
  }, [series])

  // --- Auto-zoom Y-axis for short windows with padding ---
  const isShortWin = win === '24h' || win === '7d' || win === '30d' || win === '90d'
  const yDomain = useMemo<(number | 'auto')[]>(() => {
    if (!isShortWin || series.length === 0) return ['auto', 'auto']
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
  }, [isShortWin, series])
  // -------------------------------------------------------

  const gradientId = `valueGrad_${coinId.replace(/[^a-z0-9]/gi, '')}`

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-900/40 p-3 md:p-4 ring-1 ring-slate-700/30">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm md:text-base font-semibold text-slate-200">Balance</h3>
          {typeof perf === 'number' && (
            <span className={`text-xs md:text-sm font-medium ${perf >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <PercentTicker value={perf * 100} />
            </span>
          )}
        </div>
        <WindowTabs value={win} onChange={setWin} />
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer>
          <AreaChart
            data={series}
            margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopOpacity={0.5} stopColor="currentColor" />
                <stop offset="100%" stopOpacity={0} stopColor="currentColor" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(ts) => dateFormatter(ts as number, win)}
              stroke="rgba(148,163,184,0.5)"
              tick={{ fill: 'rgba(148,163,184,0.9)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
            />
            <YAxis
              dataKey="value"
              domain={yDomain as any}
              tickFormatter={(v) => compactCurrency(Number(v))}
              stroke="rgba(148,163,184,0.5)"
              tick={{ fill: 'rgba(148,163,184,0.9)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const d = payload[0].payload as any
                return (
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/90 px-3 py-2 text-xs shadow-xl ring-1 ring-slate-700/40">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                      {dateFormatter(d.t, win)}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400">Price</span>
                        <span className="tabular-nums">{fmtCurrency(d.price)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400">Holdings value</span>
                        <span className="tabular-nums font-medium">{fmtCurrency(d.value)}</span>
                      </div>
                    </div>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="rgba(94,234,212,0.85)"
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-[10px] text-slate-500">
        % change is measured from the start of the selected window. Mark-to-market only; deposits/withdrawals/fees not included.
      </div>

      {/* Empty/zero states */}
      {!history?.length && (
        <div className="mt-4 rounded-md border border-slate-700/40 bg-slate-800/30 p-3 text-sm text-slate-400">
          No price history available for this window.
        </div>
      )}
      {history?.length > 0 && n(holdingsQty) === 0 && (
        <div className="mt-2 text-[11px] text-slate-400">
          You currently hold 0 tokens of this coin. Value line reflects 0 holdings.
        </div>
      )}
    </div>
  )
}

