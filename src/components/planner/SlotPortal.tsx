'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Presentational helper: renders children into a DOM slot elsewhere on the
 * page (e.g. panel-head stat pills fed by the ladder components).
 * No data or behavior — display placement only.
 */
export default function SlotPortal({ slotId, children }: { slotId: string; children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setEl(document.getElementById(slotId))
  }, [slotId])

  if (!el) return null
  return createPortal(children, el)
}
