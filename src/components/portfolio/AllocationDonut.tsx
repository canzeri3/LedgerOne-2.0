'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'
import { displayCurrencySymbol, usdToDisplay } from '@/lib/format'

type Datum = { name: string; value: number; color?: string }

const FALLBACK_COLORS = [
  '#60a5fa', '#38bdf8', '#a78bfa', '#34d399', '#f59e0b',
  '#f472b6', '#22d3ee', '#93c5fd', '#f97316', '#ef4444',
  '#14b8a6', '#c084fc', '#f43f5e', '#10b981', '#7dd3fc',
]

export default function AllocationDonut({ data }: { data: Datum[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const total = (data ?? []).reduce((a, d) => a + (Number(d.value) || 0), 0)

  const series = (data ?? []).map((d) => ({
    ...d,
    value: Number(d.value) || 0,
  })).filter(d => d.value > 0)

  const activeDatum = activeIndex == null ? null : series[activeIndex] ?? null
  const centerValue = activeDatum && total > 0
    ? `${((activeDatum.value / total) * 100).toFixed(1)}%`
    : '100%'
  const centerLabel = activeDatum?.name ?? 'Allocated'

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
          innerRadius="66%"
          outerRadius="91%"
          paddingAngle={2}
          cornerRadius={5}
          stroke="var(--pf-surface)"
          strokeWidth={2}
          style={{ filter: 'url(#donutShadow)' }}
          isAnimationActive
          animationDuration={650}
          animationEasing="ease-out"
          onMouseEnter={(_, index) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {series.map((datum, i) => (
            <Cell key={datum.name} fill={datum.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
          ))}
        </Pie>

        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          fill="var(--pf-text)"
          fontFamily="var(--font-sora)"
          fontSize="24"
          fontWeight="650"
          className="pf-donut-center-value"
        >
          {centerValue}
        </text>
        <text
          x="50%"
          y="55%"
          textAnchor="middle"
          fill="var(--pf-text-3)"
          fontSize="10"
          fontWeight="600"
          letterSpacing="1.1"
          className="pf-donut-center-label"
        >
          {centerLabel.toUpperCase()}
        </text>

        {/* Smaller, neutral-grey tooltip (not white) for better contrast */}
        <Tooltip
          wrapperStyle={{ outline: 'none', zIndex: 60 }}
          contentStyle={{
            background: 'var(--pf-surface)',
            color: 'var(--pf-text)',
            border: '1px solid var(--pf-border-strong)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '8px 10px',
          }}
          labelStyle={{
            color: 'var(--pf-text)',
            fontWeight: 600,
            fontSize: 11,
            marginBottom: 2,
          }}
          itemStyle={{
            color: 'var(--pf-text)',
            fontWeight: 500,
            fontSize: 11,
            lineHeight: '14px',
            margin: 0,
          }}
          formatter={(rawVal, rawName) => {
            const v = Number(rawVal) || 0
            const pct = total > 0 ? (v / total) * 100 : 0
            const valStr = `${displayCurrencySymbol()}${usdToDisplay(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            const pctStr = `${pct.toFixed(1)}%`
            return [`${valStr} · ${pctStr}`, String(rawName)]
          }}
          labelFormatter={() => 'Allocation'}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
