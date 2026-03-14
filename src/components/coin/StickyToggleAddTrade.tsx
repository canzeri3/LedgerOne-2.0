'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import StickyUnderHeader from '@/components/coin/StickyUnderHeader'
import TradesPanel from '@/components/coins/TradesPanel'

type Props = { id: string }

/**
 * Keeps hydration stable by rendering sticky-enabled on the server and on the client's first render.
 * After mount, we read localStorage and apply the saved preference.
 */
export default function StickyToggleAddTrade({ id }: Props) {
  const [enabled, setEnabled] = useState<boolean>(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('lo:add-trade-sticky')
      if (saved === '0') setEnabled(false)
      if (saved === '1') setEnabled(true)
    } catch {}
  }, [])

  useEffect(() => {
    if (!mounted) return
    try {
      localStorage.setItem('lo:add-trade-sticky', enabled ? '1' : '0')
    } catch {}
  }, [enabled, mounted])

  const containerRef = useRef<HTMLDivElement>(null)
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!mounted) return
    const root = containerRef.current
    if (!root) return

    const ensureSlot = () => {
      const slot = root.querySelector('[data-pin-toggle-slot]') as HTMLElement | null
      if (!slot) return
      setSlotEl(slot)
    }

    ensureSlot()

    const mo = new MutationObserver(() => ensureSlot())
    mo.observe(root, { childList: true, subtree: true })

    return () => mo.disconnect()
  }, [mounted])

  const switcher =
    typeof document !== 'undefined' && slotEl
      ? createPortal(
          <label
            title={enabled ? 'Pinned under header' : 'Not pinned'}
            className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-200 select-none cursor-pointer"
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span
              className="switch-track relative inline-block h-4 w-8 rounded-full bg-slate-600 peer-checked:bg-emerald-500/70 transition-colors"
              aria-hidden="true"
            >
              <span className="switch-knob absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-white transition-transform will-change-transform" />
            </span>
            <span>Pin</span>
          </label>,
          slotEl
        )
      : null

  const panel = (
    <div ref={containerRef} className="px-6 md:px-8 lg:px-6">
      <TradesPanel id={id} />
    </div>
  )

  const effectiveDisabled = mounted ? !enabled : false

  return (
    <>
      <StickyUnderHeader disabled={effectiveDisabled}>
        {panel}
      </StickyUnderHeader>
      {switcher}
    </>
  )
}