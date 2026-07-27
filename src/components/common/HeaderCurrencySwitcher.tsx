'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useDisplayCurrency } from '@/lib/displayCurrency'
import { useMenuTransition } from '@/lib/useMenuTransition'
import type { DisplayCurrency } from '@/lib/format'

// Resolve through the shell theme vars (light theme overrides them in
// theme-light.css); the fallbacks are the original dark values.
const PANEL = 'var(--sh-panel, #151618)'
const SURFACE = 'var(--sh-panel-key, #1f2021)'
const BORDER = 'var(--sh-panel-border, rgb(43,44,45))'

const OPTIONS: Array<{ code: DisplayCurrency; label: string }> = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'EUR', label: 'Euro' },
]

export default function HeaderCurrencySwitcher() {
  const { code, setCode } = useDisplayCurrency()
  const [open, setOpen] = useState(false)
  const { mounted, shown } = useMenuTransition(open)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (open && e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Display currency"
        title="Display currency"
        className="inline-flex h-9 items-center gap-1 px-1.5 text-xs font-semibold tracking-wide text-slate-200 hover:text-slate-50 transition-colors"
      >
        {code}
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {mounted && (
        <div
          role="listbox"
          aria-label="Display currency"
          className={[
            "hdr-pop absolute right-0 mt-2 w-[200px] rounded-2xl p-1 shadow-xl shadow-black/60 z-50",
            shown ? "is-open" : "",
          ].join(" ")}
          style={{ backgroundColor: PANEL, border: `1px solid ${BORDER}` }}
        >
          {OPTIONS.map((opt) => {
            const active = opt.code === code
            return (
              <button
                key={opt.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setCode(opt.code)
                  setOpen(false)
                }}
                className="hdr-pop-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/40"
                style={active ? { backgroundColor: SURFACE } : undefined}
              >
                <span>
                  <span className="font-semibold">{opt.code}</span>
                  <span className="ml-2 text-xs text-slate-400">{opt.label}</span>
                </span>
                {active && <Check className="h-4 w-4 text-slate-300" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
