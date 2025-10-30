'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

type Point = { t: number; v: number }

// Simple thinning to keep charts smooth and performant on huge ranges
function thin(series: Point[], maxPoints = 2000): Point[] {
  if (!Array.isArray(series) || series.length <= maxPoints) return series || []
  const stride = Math.ceil(series.length / maxPoints)
  const out: Point[] = []
  for (let i = 0; i < series.length; i += stride) out.push(series[i])
  const last = series[series.length - 1]
  if (!out.length || out[out.length - 1].t !== last.t) out.push(last)
  return out
}

export default function CoinHistoryChart({ data }: { data: Point[] }) {
  const series = thin((Array.isArray(data) ? data : []).slice().sort((a, b) => a.t - b.t))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series}>
        <defs>
          {/* Soft glow under the line */}
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodOpacity="0.25" />
          </filter>
          {/* Fading fill */}
          <linearGradient id="coinFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v) => new Date(v).toLocaleDateString()}
          tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
        />
        <YAxis
          tickFormatter={(n) =>
            n >= 1_000_000
              ? `$${(n / 1_000_000).toFixed(1)}M`
              : n >= 1_000
              ? `$${(n / 1_000).toFixed(1)}k`
              : `$${n.toFixed(4)}`
          }
          tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          width={64}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(10,22,44,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
          }}
          labelFormatter={(v) =>
            new Date(v as number).toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          }
          formatter={(val) => [`$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 8 })}`, 'Price']}
        />
        <Area
          type="monotone"
          dataKey="v"
          name="Price"
          stroke="#93c5fd"
          strokeWidth={2}
          fill="url(#coinFill)"
          dot={false}
          animationDuration={300}
          style={{ filter: 'url(#shadow)' }}
          isAnimationActive={true}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

