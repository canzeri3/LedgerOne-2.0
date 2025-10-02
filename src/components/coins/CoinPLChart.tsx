'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

type Trade = {
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  side: 'buy' | 'sell'
}

type Snapshot = {
  price: number
  captured_at: string
}

type Point = {
  t: number        // timestamp (ms)
  total: number    // realized + unrealized
  realized: number
  unrealized: number
  qty: number
  price: number
}

const RANGE_OPTS = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: null as number | null },
] as const

function downsample<T>(rows: T[], maxPoints = 400): T[] {
  if (rows.length <= maxPoints) return rows
  const step = Math.ceil(rows.length / maxPoints)
  const out: T[] = []
  for (let i = 0; i < rows.length; i += step) out.push(rows[i])
  // Include last point for clean end cap
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1])
  return out
}

export default function CoinPLChart({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const [rangeKey, setRangeKey] = useState<typeof RANGE_OPTS[number]['key']>('30d')
  const rangeDef = RANGE_OPTS.find(r => r.key === rangeKey)!

  // ---- Fetch trades (all for this coin; we’ll compute baseline + window)
  const { data: trades } = useSWR<Trade[]>(
    user ? ['/coin/pl-chart/trades', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,fee,trade_time,side')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map(t => ({
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: t.fee ?? 0,
        trade_time: t.trade_time,
        side: t.side as 'buy' | 'sell',
      }))
    }
  )

  // ---- Determine time window
  const now = Date.now()
  const startMs = useMemo(() => {
    if (rangeDef.days == null) return 0
    return now - rangeDef.days * 24 * 60 * 60 * 1000
  }, [now, rangeDef.days])

  // ---- Fetch snapshots only for the window (and 1 seed snapshot before start)
  const { data: snaps } = useSWR<Snapshot[]>(
    ['/coin/pl-chart/snaps', coingeckoId, startMs, rangeKey],
    async () => {
      const startISO = new Date(startMs || 0).toISOString()
      // window snapshots
      const q1 = supabaseBrowser
        .from('price_snapshots')
        .select('price,captured_at')
        .eq('coingecko_id', coingeckoId)
        .gte('captured_at', startISO)
        .order('captured_at', { ascending: true })

      // seed snapshot before start (nearest prior), to get price at window start
      const q2 = supabaseBrowser
        .from('price_snapshots')
        .select('price,captured_at')
        .eq('coingecko_id', coingeckoId)
        .lt('captured_at', startISO)
        .order('captured_at', { ascending: false })
        .limit(1)

      const [w, s] = await Promise.all([q1, q2])
      if (w.error) throw w.error
      if (s.error) throw s.error

      const windowRows = (w.data ?? []).map(r => ({ price: Number(r.price), captured_at: r.captured_at as string }))
      const seedRows = (s.data ?? []).map(r => ({ price: Number(r.price), captured_at: r.captured_at as string }))
      return [...seedRows.reverse(), ...windowRows] as Snapshot[]
    }
  )

  // ---- Compute P&L time series
  const series = useMemo<Point[] | null>(() => {
    if (!snaps || !trades) return null

    // Build event stream: all snapshots in-range + all trades (we’ll clamp to range)
    type Event = { t: number; type: 'snap' | 'trade'; price?: number; trade?: Trade }
    const evts: Event[] = []

    // Snapshots (seed + window)
    for (const s of snaps) {
      const t = new Date(s.captured_at).getTime()
      if (rangeDef.days == null || t >= startMs) {
        evts.push({ t, type: 'snap', price: s.price })
      }
    }

    // Trades: we need baseline before start + updates inside window
    // We also add a "trade event" inside window so the line steps exactly at trade time.
    for (const tr of trades) {
      const tt = new Date(tr.trade_time).getTime()
      evts.push({ t: tt, type: 'trade', trade: tr })
    }

    // Sort by time
    evts.sort((a, b) => a.t - b.t)

    // Apply trades up to start to set baseline position/realized
    let qty = 0
    let avg = 0
    let realized = 0
    let lastPrice = evts.find(e => e.type === 'snap' && e.t <= startMs)?.price ?? undefined

    for (const e of evts) {
      if (e.t >= startMs) break
      if (e.type === 'trade' && e.trade) {
        const tr = e.trade
        if (tr.side === 'buy') {
          const cost = tr.price * tr.quantity + (tr.fee ?? 0)
          const newQty = qty + tr.quantity
          const newCostBasis = qty * avg + cost
          avg = newQty > 0 ? newCostBasis / newQty : 0
          qty = newQty
        } else {
          // realized profit accounts for fee as cost (reduces proceeds)
          realized += (tr.price - avg) * tr.quantity - (tr.fee ?? 0)
          qty = Math.max(0, qty - tr.quantity)
          // avg stays the same on sells
        }
      } else if (e.type === 'snap' && e.price != null) {
        lastPrice = e.price
      }
    }

    // Now sweep forward across window, producing points at snapshots and trades
    const out: Point[] = []
    const pushPoint = (t: number, price: number) => {
      const unreal = qty * (price - avg)
      out.push({
        t,
        total: realized + unreal,
        realized,
        unrealized: unreal,
        qty,
        price,
      })
    }

    for (const e of evts) {
      if (e.t < startMs && rangeDef.days !== null) continue

      if (e.type === 'snap' && e.price != null) {
        lastPrice = e.price
        pushPoint(e.t, lastPrice)
      } else if (e.type === 'trade' && e.trade) {
        const tr = e.trade
        // If we don't have a price yet in-window, use the trade price as a temporary
        if (lastPrice == null) lastPrice = tr.price

        // Apply trade
        if (tr.side === 'buy') {
          const cost = tr.price * tr.quantity + (tr.fee ?? 0)
          const newQty = qty + tr.quantity
          const newCostBasis = qty * avg + cost
          avg = newQty > 0 ? newCostBasis / newQty : 0
          qty = newQty
        } else {
          realized += (tr.price - avg) * tr.quantity - (tr.fee ?? 0)
          qty = Math.max(0, qty - tr.quantity)
        }

        // Record a point at trade time using the best available price
        pushPoint(e.t, lastPrice)
      }
    }

    // Ensure we have at least two points so the chart renders nicely
    if (out.length === 1) {
      out.unshift({ ...out[0], t: out[0].t - 1 })
    }
    // Downsample for performance
    const ds = downsample(out, 400)
    return ds
  }, [snaps, trades, startMs, rangeDef.days])

  // ---- Chart theme helpers
  const tickFmtY = (v: number) => fmtCurrency(v)
  const tickFmtX = (ts: number) => {
    const d = new Date(ts)
    // compact: MM/DD or HH:MM for short ranges
    return rangeDef.days && rangeDef.days <= 7
      ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-300">
          Coin P&L Over Time
        </div>
        <div className="flex gap-1">
          {RANGE_OPTS.map(r => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`px-2 py-1 text-xs rounded border ${
                rangeKey === r.key
                  ? 'bg-[#1b2c54] border-[#1b2c54] text-slate-100'
                  : 'bg-[#0a162c] border-[#0b1830] text-slate-300 hover:bg-[#102448]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series ?? []}
            margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
          >
            <defs>
              <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3763d6" stopOpacity={0.35}/>
                <stop offset="100%" stopColor="#3763d6" stopOpacity={0}/>
              </linearGradient>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" floodColor="#0b1830"/>
              </filter>
            </defs>

            <CartesianGrid stroke="#0b1830" strokeOpacity={0.8} />

            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tickFmtX}
              axisLine={{ stroke: '#0b1830' }}
              tickLine={{ stroke: '#0b1830' }}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />

            <YAxis
              tickFormatter={tickFmtY}
              axisLine={{ stroke: '#0b1830' }}
              tickLine={{ stroke: '#0b1830' }}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              width={80}
            />

            <Tooltip
              contentStyle={{ background: '#0a162c', border: '1px solid #0b1830', borderRadius: 8 }}
              labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
              formatter={(v: any, name: any, _ctx: any) => {
                if (name === 'total') return [fmtCurrency(v), 'Total P&L']
                if (name === 'realized') return [fmtCurrency(v), 'Realized']
                if (name === 'unrealized') return [fmtCurrency(v), 'Unrealized']
                if (name === 'price') return [fmtCurrency(v), 'Price']
                if (name === 'qty') return [String(v), 'Qty']
                return [String(v), name]
              }}
            />

            <Area
              dataKey="total"
              type="monotone"
              stroke="#3763d6"
              strokeWidth={2}
              fill="url(#plFill)"
              dot={false}
              animationDuration={300}
              style={{ filter: 'url(#shadow)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend-ish footer */}
      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-400">
        <div><span className="text-slate-300">Total P&L</span> = Realized + Unrealized</div>
        <div>Unrealized uses current position qty × (price − avg) at each point</div>
      </div>
    </div>
  )
}

