'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a popover/menu mounted through its close transition so it can animate
 * out (the CSS "easeReverse" retract). Pair with the `.hdr-pop` / `.hdr-pop-item`
 * styles in globals.css.
 *
 * The initial mount is NOT animated — state starts reflecting `open` — so a
 * section that is open by default (e.g. the sidebar Coins list) shows instantly
 * instead of flashing in. Animation kicks in on subsequent open/close changes.
 *
 * @param open    the caller's open intent
 * @param closeMs how long to stay mounted after `open` flips to false — must be
 *                >= the CSS close transition duration
 * @returns `mounted` (render in the DOM) and `shown` (apply the `.is-open` class)
 */
export function useMenuTransition(open: boolean, closeMs = 320) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const firstRun = useRef(true)

  useEffect(() => {
    if (firstRun.current) {
      // Initial state already matches `open`; don't animate on first mount.
      firstRun.current = false
      return
    }
    if (open) {
      setMounted(true)
      const id = window.requestAnimationFrame(() => setShown(true))
      return () => window.cancelAnimationFrame(id)
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), closeMs)
    return () => window.clearTimeout(t)
  }, [open, closeMs])

  return { mounted, shown }
}
