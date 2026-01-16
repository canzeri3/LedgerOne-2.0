'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export default function PlanLimitModal({
  open,
  message,
  onClose,
  upgradeHref = '/pricing',
}: {
  open: boolean
  message: string
  onClose: () => void
  upgradeHref?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const body = useMemo(() => (mounted ? document.body : null), [mounted])

  if (!open || !body) return null

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-[#151618] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6">
          <div className="text-sm font-semibold text-slate-50">Plan limit reached</div>
          <div className="mt-2 text-[13px] leading-5 text-slate-300">{message}</div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-800/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700/80 bg-transparent px-3.5 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/5"
          >
            Cancel
          </button>

          <Link
            href={upgradeHref}
            className="rounded-xl bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500"
          >
            Upgrade plan
          </Link>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, body)
}
