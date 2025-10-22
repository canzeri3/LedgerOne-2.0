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
          wrapperStyle={{ outline: 'none' }}
          contentStyle={{
            background: 'rgba(229,231,235,0.96)',           // gray-200 w/ slight opacity
            color: '#0f172a',                                // slate-900 text for crisp legibility
            border: '1px solid rgba(148,163,184,0.5)',       // slate-400 border
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(2,6,23,0.18)',
            padding: '6px 8px',                              // smaller padding
          }}
          labelStyle={{
            color: '#0f172a',
            fontWeight: 600,
            fontSize: 11,                                    // smaller text
            marginBottom: 2,
          }}
          itemStyle={{
            color: '#0f172a',
            fontWeight: 500,
            fontSize: 11,                                    // smaller text
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

