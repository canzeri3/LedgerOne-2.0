'use client'

import { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export default function Button({ variant = 'primary', size = 'md', className, ...props }: BtnProps) {
  const base =
    'rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed'
  const sizes = {
    sm: 'text-xs px-3 py-2',
    md: 'text-sm px-3.5 py-2.5',
  }
  const variants = {
    primary:
      // deep-blue gradient with a subtle glow on hover
      'border border-blue-700/60 bg-gradient-to-b from-blue-600/85 to-blue-700/85 text-slate-50 hover:shadow-[0_10px_25px_-10px_rgba(37,99,235,0.65)]',
    secondary:
      // neutral slate for secondary actions
      'border border-slate-700 bg-slate-800/70 text-slate-100 hover:bg-slate-700/70',
    ghost:
      // very subtle, used when you want a quiet action
      'border border-slate-700/60 bg-slate-900/50 text-slate-200 hover:bg-slate-800/60',
    danger:
      'border border-rose-700/60 bg-gradient-to-b from-rose-600/85 to-rose-700/85 text-slate-50 hover:shadow-[0_10px_25px_-10px_rgba(244,63,94,0.6)]',
  }

  return (
    <button
      className={clsx(base, sizes[size], variants[variant], className)}
      {...props}
    />
  )
}

