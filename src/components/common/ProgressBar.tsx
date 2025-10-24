'use client'

type Props = {
  /** 0..1 (we’ll clamp) */
  pct: number
  /** Optional caption shown under the bar (e.g., "42% filled") */
  text?: string
  /** Optional extra classes for the outer wrapper */
  className?: string
  /** Height of the bar in px (default 8) */
  heightPx?: number
}

export default function ProgressBar({ pct, text, className = '', heightPx = 8 }: Props) {
  const clamped = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0
  const width = `${(clamped * 100).toFixed(2)}%`
  const isFull = clamped >= 0.999 // treat ~100% as full to avoid tiny slivers

  return (
    <div className={`w-full ${className}`} aria-label="progress">
      <div
        className="relative w-full overflow-hidden rounded bg-[rgb(54,55,56)]" // neutral grey track, no border
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: `${heightPx}px` }}
      >
        <div
          className={`absolute left-0 top-0 bottom-0 ${isFull ? 'rounded' : 'rounded-l'}`}
          style={{
            width,
            transition: 'width 300ms ease',
            // Filled color: neutral purple you requested
            background: 'rgba(66, 138, 63, 1)',
            boxShadow: '0 2px 6px rgba(36, 11, 48, 0.35)',
            willChange: 'width',
          }}
        />
      </div>
      {text ? (
        <div className="mt-1 text-[10px] leading-4 text-right text-slate-400 select-none">
          {text}
        </div>
      ) : null}
    </div>
  )
}
