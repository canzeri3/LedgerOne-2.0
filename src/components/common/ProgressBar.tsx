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

  return (
    <div className={`w-full ${className}`} aria-label="progress">
      <div
        className="relative w-full overflow-hidden rounded border border-[#0b1830] bg-[#0a162c]"
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: `${heightPx}px` }}
      >
        <div
          className="h-full"
          style={{
            width,
            transition: 'width 300ms ease',
            // Solid darker blue, no gradient:
            background: 'rgb(50, 90, 140)',
            boxShadow: '0 2px 6px rgba(11,24,48,0.35)',
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
