'use client'

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

type Datum = { name: string; value: number }

const COLORS = [
  '#8ab4f8', '#c58af9', '#80e2a7', '#f28b82', '#fdd663',
  '#7fd1f9', '#a7c7e7', '#b39ddb', '#ffb3ba', '#a0e7e5',
]

export default function AllocationDonut({ data }: { data: Datum[] }) {
  const pruned = (data || []).filter(d => d && d.value > 0)
  const total = pruned.reduce((a, d) => a + d.value, 0)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={pruned}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="90%"
          paddingAngle={1}
          stroke="rgba(255,255,255,0.08)"
        >
          {pruned.map((entry, idx) => (
            <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'rgba(10,22,44,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
          }}
          formatter={(value: any, name: any) => {
            const v = Number(value || 0)
            const pct = total > 0 ? (v / total) * 100 : 0
            return [`$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`, name]
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

