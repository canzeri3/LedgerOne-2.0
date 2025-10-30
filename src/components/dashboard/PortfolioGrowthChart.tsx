'use client'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useMemo } from 'react'

type Point = { t: number; v: number }

/* ── Evenly spaced, nice-looking Y ticks ─────────────────────────────────── */
function niceTicks(min: number, max: number, targetCount = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1, 2]
  if (min === max) {
    const base = Math.abs(min)
    const pad = Math.max(1, base * 0.01)
    return [min - pad, min, min + pad]
  }
  if (min > max) [min, max] = [max, min]

  const span = max - min
  const rawStep = span / Math.max(1, targetCount - 1)

  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / magnitude
  let step: number
  if (residual <= 1) step = 1 * magnitude
  else if (residual <= 2) step = 2 * magnitude
  else if (residual <= 2.5) step = 2.5 * magnitude
  else if (residual <= 5) step = 5 * magnitude
  else step = 10 * magnitude

  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step

  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) {
    ticks.push(Math.abs(v) < 1e-12 ? 0 : v) // avoid negative zero
  }
  return ticks
}

/* ── Tooltip helpers ─────────────────────────────────────────────────────── */
function toMDY(d: Date): string {
  // MM/DD/YYYY (e.g., 10/15/2024)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}
const fmtHourIntl = new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true })
function formatHourLower(d: Date): string {
  return fmtHourIntl
    .format(d)
    .replace(/\u00A0/g, ' ')
    .replace(' AM', 'am')
    .replace(' PM', 'pm')
}

/** Custom tooltip content: stat-card style, centered above hover point */
function CustomTooltip({
  active,
  payload,
  label,
  coordinate,
  spanMs,
}: {
  active?: boolean
  payload?: any[]
  label?: number
  coordinate?: { x: number; y: number }
  spanMs: number
}) {
  if (!active || !payload || !payload.length || typeof label !== 'number' || !coordinate) return null
  const price = Number(payload[0]?.value)
  const d = new Date(label)

  // Time rules: for ≤ 1w show actual hour; for > 1w always show 11:59pm
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  const timeText = spanMs <= oneWeek ? formatHourLower(d) : '11:59pm'

  // Position the card centered horizontally at the hover X, and above it.
  const x = coordinate.x
  const y = coordinate.y

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 10px))`,
        background: 'rgb(28, 29, 31)',
        border: '2px solid rgba(255,255,255,0.08)',
        borderRadius: 6, // rounded-md
        minWidth: 164,
        minHeight: 100,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        color: 'rgb(226,232,240)',
        pointerEvents: 'none', // avoid interfering with hover
      }}
    >
      {/* Top half: centered price */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: 0.2,
        }}
      >
        ${Number.isFinite(price) ? price.toLocaleString() : '--'}
      </div>

      {/* Bottom: date then time, smaller text */}
      <div style={{ textAlign: 'center', paddingTop: 4 }}>
        <div style={{ fontSize: 12, color: 'rgb(163,163,164)' }}>
          {toMDY(d)}
        </div>
        <div style={{ fontSize: 11, marginTop: 2, color: 'rgb(163,163,164)' }}>
          {timeText}
        </div>
      </div>
    </div>
  )
}

export default function PortfolioGrowthChart({ data }: { data: Point[] }) {
  // Clone before sort to avoid mutating a potentially frozen/read-only array
  const series = ((data ?? []).filter(p =>
    p && Number.isFinite(p.t) && Number.isFinite(p.v)
  ) as Point[]).slice().sort((a, b) => a.t - b.t)

  // Compute dynamic Y domain with a bit of padding so the line is visible
  let yMin = 0
  let yMax = 1
  if (series.length > 0) {
    const values = series.map(p => p.v)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)

    if (Number.isFinite(rawMin) && Number.isFinite(rawMax)) {
      if (rawMin === rawMax) {
        const base = Math.abs(rawMin)
        const pad = Math.max(1, base * 0.01) // 1% or at least 1
        yMin = rawMin - pad
        yMax = rawMax + pad
      } else {
        const range = rawMax - rawMin
        const pad = Math.max(range * 0.05, Math.abs(rawMax) * 0.005)
        yMin = rawMin - pad
        yMax = rawMax + pad
      }
    }
  }

  // Compute evenly spaced ticks from computed domain
  const yTicks = useMemo(() => niceTicks(yMin, yMax, 6), [yMin, yMax])

  // ── X-axis tick formatter (hours for ~24h/1d, dates for multi-day) ────────────
  const tickFormatter = useMemo(() => {
    const oneDay = 24 * 60 * 60 * 1000
    const span = series.length > 1 ? (series[series.length - 1].t - series[0].t) : 0
    const useHours = span <= oneDay * 1.5

    // Intl formatters respect user locale; we normalize AM/PM and whitespace
    const fmtMonthDay = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    })
    const fmtHour = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      hour12: true,
    })

    return (ts: number) => {
      const d = new Date(ts)
      if (useHours) {
        // e.g., "6 AM" -> "6am"; also collapse NBSP to normal space
        return fmtHour
          .format(d)
          .replace(/\u00A0/g, ' ')
          .replace(' AM', 'am')
          .replace(' PM', 'pm')
      }
      // e.g., "Oct 4", "Feb 10", "Jan 22"; collapse NBSP to normal space
      return fmtMonthDay.format(d).replace(/\u00A0/g, ' ')
    }
  }, [series])

  // Span for tooltip time rule
  const spanMs = useMemo(() => (
    series.length > 1 ? (series[series.length - 1].t - series[0].t) : 0
  ), [series])

  // Unique gradient id so other charts can't override our fill on client navigations
const gradId = useMemo(() => 'pgfill-' + Math.random().toString(36).slice(2), [])

  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* Add inner margin so first X tick never sits under the Y axis */}
      <AreaChart data={series} margin={{ left: 8, right: 8 }}>
        <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(136 128 213)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="rgb(136 128 213)" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Dashed horizontal grid; axis baselines removed via axisLine={false} */}
        <CartesianGrid
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="4 4"
          strokeWidth={1.25}
          vertical={false}
        />

        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={tickFormatter}
          tick={{
            fill: 'rgb(163,163,164)',  // axis font color
            fontSize: 11.5,
            fontWeight: 500,
          }}
          axisLine={false}
          tickLine={false}
          padding={{ left: 8, right: 8 }}   /* keep first/last ticks away from edges */
        />

        {/* Use fixed ticks to force evenly spaced dashed grid lines */}
        <YAxis
          domain={[yTicks[0], yTicks[yTicks.length - 1]]}
          ticks={yTicks}
          tickFormatter={(n: number) =>
            n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
            : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}k`
            : `$${n.toFixed(0)}`
          }
          tick={{
            fill: 'rgb(163,163,164)',  // axis font color
            fontSize: 11.5,
            fontWeight: 500,
          }}
          axisLine={false}
          tickLine={false}
          width={64}
          allowDecimals
        />

        {/* Controlled tooltip: centered above hover point; no vertical cursor line */}
        <Tooltip
          wrapperStyle={{ pointerEvents: 'none', visibility: 'visible' }}
          position={{ x: 0, y: 0 }}
          allowEscapeViewBox={{ x: true, y: true }}
          offset={0}
          cursor={false}                      /* ← Hides the vertical hover line */
          content={<CustomTooltip spanMs={spanMs} />}
        />

        <Area
          type="monotone"
          dataKey="v"
          stroke="rgb(136 128 213)"
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          // ▼ Built-in mount animation
          isAnimationActive={true}
          animationDuration={300}
          animationBegin={0}
          animationEasing="ease-in-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export type { Point }
