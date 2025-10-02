'use client'

import { SelectHTMLAttributes } from 'react'
import clsx from 'clsx'

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: 'sm' | 'md'
  fullWidth?: boolean
}

export default function Select({ className, size = 'md', fullWidth = false, ...props }: Props) {
  const sizes = {
    sm: 'text-xs py-2 pl-3 pr-9',
    md: 'text-sm py-2.5 pl-3.5 pr-10',
  }
  return (
    <div
      className={clsx(
        'relative inline-block',
        fullWidth && 'w-full'
      )}
    >
      <select
        {...props}
        className={clsx(
          // Modern “glass” grey against your dark blue bg
          'w-full appearance-none rounded-lg border border-slate-700/80',
          'bg-slate-900/70 text-slate-200 shadow-sm',
          'outline-none ring-0 focus:border-blue-500/60 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]',
          'transition-colors',
          sizes[size],
          className
        )}
      />
      {/* Chevron */}
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      >
        <path
          fill="currentColor"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 0 1 .92 1.18l-4.24 3.36a.75.75 0 0 1-.92 0L5.21 8.41a.75.75 0 0 1 .02-1.2z"
        />
      </svg>
    </div>
  )
}

