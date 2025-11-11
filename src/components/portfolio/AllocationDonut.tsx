'use client'

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'

type Datum = { name: string; value: number }

export default function AllocationDonut({ data }: { data: Datum[] }) {
  const total = (data ?? []).reduce((a, d) => a + (Number(d.value) || 0), 0)

  // Theme-friendly palette (blue/cyan/violet accents)
  const COLORS = [
    '#60a5fa', '#38bdf8', '#a78bfa', '#34d399', '#f59e0b',
    '#f472b6', '#22d3ee', '#93c5fd', '#f97316', '#ef4444',
    '#14b8a6', '#c084fc', '#f43f5e', '#10b981', '#7dd3fc',
  ]

  const series = (data ?? []).map((d) => ({
    ...d,
    value: Number(d.value) || 0,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <defs>
          {/* soft ring highlight */}
          <filter id="donutShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="6" floodOpacity="0.18" />
          </filter>
        </defs>

        <Pie
          data={series}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="85%"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          style={{ filter: 'url(#donutShadow)' }}
          isAnimationActive={false}
        >
          {series.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>

        {/* Smaller, neutral-grey tooltip (not white) for better contrast */}
        <Tooltip
          wrapperStyle={{ outline: 'none', zIndex: 60 }}
          contentStyle={{
            background: 'rgb(24,25,27)',
            color: '#e5e7eb',
            border: '1px solid rgb(42,43,45)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '8px 10px',
          }}
          labelStyle={{
            color: '#e5e7eb',
            fontWeight: 600,
            fontSize: 11,
            marginBottom: 2,
          }}
          itemStyle={{
            color: '#e5e7eb',
            fontWeight: 500,
            fontSize: 11,
            lineHeight: '14px',
            margin: 0,
          }}
          formatter={(rawVal, rawName) => {
            const v = Number(rawVal) || 0
            const pct = total > 0 ? (v / total) * 100 : 0
            const valStr = `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            const pctStr = `${pct.toFixed(1)}%`
            return [`${valStr} · ${pctStr}`, String(rawName)]
          }}
          labelFormatter={() => 'Allocation'}
        />


      </PieChart>
    </ResponsiveContainer>
  )
}

