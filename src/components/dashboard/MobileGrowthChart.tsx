'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, YAxis, Tooltip } from 'recharts'
import { displayCurrencySymbol, usdToDisplay } from '@/lib/format'

export type Point = { t: number; v: number }

const ACCENT = 'rgb(136, 128, 213)'

/** Compact currency string for the floating high/low markers (no cents on large values). */
function fmtMarker(n: number): string {
  const c = usdToDisplay(n)
  const s = displayCurrencySymbol()
  const abs = Math.abs(c)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4
  return `${c < 0 ? '-' : ''}${s}${Math.abs(c).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function fmtPercentMarker(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function toMDY(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

const fmtHourIntl = new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true })

/** Touch-scrub tooltip: compact card pinned above the touch point. */
function ScrubTooltip({
  active,
  payload,
  coordinate,
  spanMs,
  valueMode,
}: {
  active?: boolean
  payload?: any[]
  coordinate?: { x: number; y: number }
  spanMs: number
  valueMode: 'currency' | 'percent'
}) {
  if (!active || !payload?.length || !coordinate) return null
  const value = Number(payload[0]?.value)

  // There's no <XAxis>, so Recharts' `label` is the category index, not the
  // timestamp — read `t` off the original datum instead.
  const ts = Number(payload[0]?.payload?.t)
  if (!Number.isFinite(ts)) return null

  const d = new Date(ts)
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  const timeText =
    spanMs <= oneWeek
      ? fmtHourIntl.format(d).replace(/ /g, ' ').replace(' AM', 'am').replace(' PM', 'pm')
      : toMDY(d)

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${coordinate.x}px, ${coordinate.y}px) translate(-50%, calc(-100% - 12px))`,
        background: 'rgb(28, 29, 31)',
        border: '1px solid rgb(58, 59, 63)',
        borderRadius: 8,
        padding: '6px 10px',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'rgb(226,232,240)' }}>
        {Number.isFinite(value)
          ? valueMode === 'percent' ? fmtPercentMarker(value) : fmtMarker(value)
          : '--'}
      </div>
      <div style={{ fontSize: 10.5, marginTop: 1, color: 'rgb(122,124,132)' }}>{timeText}</div>
    </div>
  )
}

/**
 * Edge-to-edge sparkline-style portfolio chart for phones: no axes, no grid,
 * with the window high/low called out in the corners.
 */
export default function MobileGrowthChart({
  data,
  valueMode = 'currency',
  showGrid = false,
  markersRight = false,
}: {
  data: Point[]
  valueMode?: 'currency' | 'percent'
  showGrid?: boolean
  markersRight?: boolean
}) {
  const series = useMemo(
    () =>
      (data ?? [])
        .filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.v))
        .slice()
        .sort((a, b) => a.t - b.t),
    [data]
  )

  const { high, low, yMin, yMax } = useMemo(() => {
    if (!series.length) return { high: null, low: null, yMin: 0, yMax: 1 }
    let hi = -Infinity
    let lo = Infinity
    for (const p of series) {
      if (p.v > hi) hi = p.v
      if (p.v < lo) lo = p.v
    }
    if (hi === lo) {
      const pad = Math.max(1, Math.abs(hi) * 0.01)
      return { high: hi, low: lo, yMin: lo - pad, yMax: hi + pad }
    }
    const range = hi - lo
    // Extra headroom at the top so the high marker never overlaps the line.
    return { high: hi, low: lo, yMin: lo - range * 0.12, yMax: hi + range * 0.18 }
  }, [series])

  const spanMs = series.length > 1 ? series[series.length - 1].t - series[0].t : 0
  const gradId = useMemo(() => 'mgfill-' + Math.random().toString(36).slice(2), [])
  const chartHostRef = useRef<HTMLDivElement>(null)
  const [initialSize, setInitialSize] = useState<{ width: number; height: number } | null>(null)

  // iOS installed PWAs can report a transient zero/negative chart size while
  // the standalone viewport is settling. Mount Recharts only after this host
  // has real dimensions so its reveal clip-path is calculated at full width.
  useLayoutEffect(() => {
    const host = chartHostRef.current
    if (!host) return

    const measure = () => {
      const { width, height } = host.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setInitialSize(current => current ?? { width, height })
      }
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      const frame = window.requestAnimationFrame(measure)
      return () => window.cancelAnimationFrame(frame)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [series.length])

  // Recharts keeps its active point after a touch ends (there's no mouseleave on
  // touch), so the readout would stay pinned to the chart. Show it only while a
  // finger is actually down.
  const [scrubbing, setScrubbing] = useState(false)
  const endScrub = () => setScrubbing(false)

  if (!series.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[12.5px] text-slate-500">
        No history for this range yet
      </div>
    )
  }

  return (
    <div
      ref={chartHostRef}
      className="relative h-full w-full"
      // pan-y lets a vertical swipe still scroll the page, while horizontal drags
      // stay with us so holding and sliding scrubs along the series.
      style={{ touchAction: 'pan-y' }}
      onPointerDown={() => setScrubbing(true)}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={endScrub}
    >
      {initialSize && (
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={initialSize}
        >
          <AreaChart data={series} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.34} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {showGrid && (
              <CartesianGrid
                vertical={false}
                stroke="rgba(148,163,184,0.16)"
                strokeDasharray="0"
              />
            )}
            <YAxis hide domain={[yMin, yMax]} />

            {/* Unmounted between touches so neither the card nor the cursor line lingers. */}
            {scrubbing && (
              <Tooltip
                wrapperStyle={{ pointerEvents: 'none', visibility: 'visible' }}
                position={{ x: 0, y: 0 }}
                allowEscapeViewBox={{ x: true, y: true }}
                offset={0}
                cursor={{ stroke: 'rgba(136,128,213,0.45)', strokeWidth: 1 }}
                content={<ScrubTooltip spanMs={spanMs} valueMode={valueMode} />}
              />
            )}

            <Area
              type="monotone"
              dataKey="v"
              stroke={ACCENT}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={scrubbing ? { r: 3, fill: ACCENT, stroke: 'rgb(19,20,21)', strokeWidth: 2 } : false}
              isAnimationActive={true}
              animationDuration={300}
              animationBegin={0}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Window high / low markers, mirroring the reference layout's corner labels */}
      {high != null && (
        <span
          className="pointer-events-none absolute right-5 top-1 text-[12.5px] text-slate-500"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {valueMode === 'percent' ? fmtPercentMarker(high) : fmtMarker(high)}
        </span>
      )}
      {low != null && (
        <span
          className={[
            'pointer-events-none absolute bottom-1 text-[12.5px] text-slate-500',
            markersRight ? 'right-5' : 'left-5',
          ].join(' ')}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {valueMode === 'percent' ? fmtPercentMarker(low) : fmtMarker(low)}
        </span>
      )}
    </div>
  )
}
