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

export default function PortfolioGrowthChart({ data }: { data: Point[] }) {
  const series = (data ?? []).sort((a, b) => a.t - b.t)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series}>
        <defs>
          <linearGradient id="pgfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.05} />
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
              : `$${n.toFixed(0)}`
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
              year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          }
          formatter={(val) => [`$${Number(val).toLocaleString()}`, 'Value']}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke="#93c5fd"
          strokeWidth={2}
          fill="url(#pgfill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

