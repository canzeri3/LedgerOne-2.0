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
  // Render sticky enabled by default (SSR + first client render)
  const [enabled, setEnabled] = useState<boolean>(true)
  const [mounted, setMounted] = useState(false)

  // After mount, read saved preference and then persist on changes
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

  // ----- Title slot plumbing (only runs on client) -----
  const containerRef = useRef<HTMLDivElement>(null)
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!mounted) return
    const root = containerRef.current
    if (!root) return

    const ensureSlot = () => {
      const cardRoot =
        (root.querySelector('.add-trade-card') as HTMLElement | null) ||
        (root.querySelector(
          '.rounded-2xl, .rounded-xl, .rounded-lg, [class*="rounded-"]'
        ) as HTMLElement | null) ||
        (root.firstElementChild as HTMLElement | null)

      if (!cardRoot) return
      cardRoot.classList.add('add-trade-card')

      const titleEl =
        (cardRoot.querySelector('h2') as HTMLElement | null) ||
        (cardRoot.querySelector('[data-add-trade-title]') as HTMLElement | null)

      if (!titleEl) return

      let slot = titleEl.querySelector('[data-sticky-switch-slot]') as HTMLElement | null
      if (!slot) {
        slot = document.createElement('span')
        slot.setAttribute('data-sticky-switch-slot', 'true')
        slot.style.marginLeft = '0.5rem'
        slot.style.display = 'inline-flex'
        slot.style.verticalAlign = 'middle'
        titleEl.appendChild(slot)
      }
      setSlotEl(slot)
    }

    // initial + observe changes
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
            className="inline-flex items-center gap-1 text-[11px] select-none cursor-pointer opacity-80 hover:opacity-100"
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span className="switch-track relative inline-block w-8 h-4 rounded-full bg-slate-600 peer-checked:bg-emerald-500/70 transition-colors" aria-hidden="true">
              <span className="switch-knob absolute top-0.5 left-0.5 inline-block w-3 h-3 rounded-full bg-white transition-transform will-change-transform" />
            </span>
            <span>Pin</span>
          </label>,
          slotEl
        )
      : null

  // Panel contents
  const Panel = (
    <div ref={containerRef} className="px-6 md:px-8 lg:px-6">

      <TradesPanel id={id} />
    </div>
  )

  // IMPORTANT: keep first client render identical to SSR (sticky enabled).
  // After mount, we honor the saved value.
  const effectiveDisabled = mounted ? !enabled : false

  return (
    <>
      <StickyUnderHeader disabled={effectiveDisabled}>
        {Panel}
      </StickyUnderHeader>
      {switcher}
    </>
  )
}

