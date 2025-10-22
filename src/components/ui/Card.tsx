'use client'

import { ReactNode } from 'react'
import clsx from 'clsx'

type CardProps = {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  headerRight?: ReactNode
  /** Optional: override the color of the thin header divider line */
  headerBorderClassName?: string
}

export default function Card({
  children,
  className,
  title,
  subtitle,
  headerRight,
  headerBorderClassName,
}: CardProps) {
  return (
    <section
      className={clsx(
        // High-contrast grey card against deep blue
        'rounded-2xl border border-slate-700/70',
        'bg-gradient-to-b from-slate-800/80 to-slate-900/80 backdrop-blur',
        'shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)]',
        'transition-transform duration-200 hover:-translate-y-[1px]',
        className
      )}
    >
      {(title || headerRight || subtitle) && (
        <div className={clsx('px-5 pt-5 pb-3 border-b', headerBorderClassName ?? 'border-slate-700/50')}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {title && <h2 className="text-lg font-bold text-slate-100">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
