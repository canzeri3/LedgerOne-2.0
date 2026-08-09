'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { useMenuTransition } from '@/lib/useMenuTransition'

export type MobileRiskLevel = 'Low' | 'Moderate' | 'High' | 'Very High'

export type MobileRiskMetricDetail = {
  id: string
  name: string
  note: string
  level: MobileRiskLevel
  valueLabel: string
  value: string
  summary: string
  details: Array<{ label: string; value: string }>
  methodology: string
}

type Props = {
  metric: MobileRiskMetricDetail | null
  onClose: () => void
}

const LEVEL_FILL: Record<MobileRiskLevel, number> = {
  Low: 2,
  Moderate: 3,
  High: 5,
  'Very High': 6,
}

const LEVEL_TONE: Record<MobileRiskLevel, string> = {
  Low: 'text-[rgb(116,170,98)]',
  Moderate: 'text-[rgb(207,180,45)]',
  High: 'text-[rgb(189,120,45)]',
  'Very High': 'text-[rgb(214,66,78)]',
}

export default function MobileRiskMetricSheet({ metric, onClose }: Props) {
  const open = metric != null
  const { mounted, shown } = useMenuTransition(open, 420)
  const [displayMetric, setDisplayMetric] = useState<MobileRiskMetricDetail | null>(metric)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (metric) setDisplayMetric(metric)
  }, [metric])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusId = window.requestAnimationFrame(() => closeRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusId)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!mounted || !displayMetric) return null

  const tone = LEVEL_TONE[displayMetric.level]
  const fill = LEVEL_FILL[displayMetric.level]

  return (
    <div className="l1-coinsheet-root md:hidden" role="presentation">
      <div
        className={['l1-coinsheet-backdrop', shown ? 'is-open' : ''].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        data-mobile-risk-sheet
        className={['l1-coinsheet mobile-holding-sheet', shown ? 'is-open' : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-risk-sheet-title"
      >
        <div className="mobile-holding-sheet-scroll">
          <div className="flex items-center gap-3 px-3 pb-4 pt-2">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/10 bg-white/[0.055] ${tone}`}>
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="mobile-risk-sheet-title" className="truncate font-display text-[19px] font-semibold text-slate-100">
                {displayMetric.name}
              </h2>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                Portfolio risk metric
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-slate-200 active:bg-white/15"
              aria-label={`Close ${displayMetric.name} details`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-white/10 bg-black/15">
            <div className="px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {displayMetric.valueLabel}
                  </div>
                  <div className="mt-1.5 truncate font-display text-[27px] font-bold leading-none text-slate-100 tabular-nums" title={displayMetric.value}>
                    {displayMetric.value}
                  </div>
                </div>
                <span className={`shrink-0 text-[12px] font-semibold ${tone}`}>{displayMetric.level}</span>
              </div>

              <div className="mt-4 grid grid-cols-6 gap-1.5" aria-label={`${displayMetric.level} risk`}>
                {[0, 1, 2, 3, 4, 5].map(index => (
                  <span
                    key={index}
                    className={[
                      'h-1.5 rounded-full',
                      index < fill ? (displayMetric.level === 'Low'
                        ? 'bg-[rgb(116,170,98)]'
                        : displayMetric.level === 'Moderate'
                          ? 'bg-[rgb(207,180,45)]'
                          : displayMetric.level === 'High'
                            ? 'bg-[rgb(189,120,45)]'
                            : 'bg-[rgb(214,66,78)]') : 'bg-white/10',
                    ].join(' ')}
                  />
                ))}
              </div>
            </div>

            <p className="border-t border-white/10 px-4 py-4 text-[12.5px] leading-5 text-slate-300">
              {displayMetric.summary}
            </p>

            <div className="grid grid-cols-2">
              {displayMetric.details.map((detail, index) => (
                <div
                  key={detail.label}
                  className={[
                    'min-w-0 border-t border-white/10 px-4 py-3.5',
                    index % 2 === 1 ? 'border-l' : '',
                    index === displayMetric.details.length - 1 && displayMetric.details.length % 2 === 1 ? 'col-span-2' : '',
                  ].join(' ')}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-[0.075em] text-slate-500">
                    {detail.label}
                  </div>
                  <div className="mt-1.5 truncate text-[13px] font-semibold text-slate-100 tabular-nums" title={detail.value}>
                    {detail.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-[16px] border border-[rgba(137,128,213,0.2)] bg-[rgba(137,128,213,0.08)] px-4 py-3.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[rgb(164,155,226)]">How it is measured</div>
            <p className="mt-1.5 text-[11.5px] leading-[18px] text-slate-300">{displayMetric.methodology}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
