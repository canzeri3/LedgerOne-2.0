'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query. Uses useSyncExternalStore so the value is read
 * during render (no post-mount flash) while staying hydration-safe: the server
 * snapshot is always `false`, matching the desktop-first markup.
 */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return serverDefault
    return window.matchMedia(query).matches
  }, [query, serverDefault])

  const getServerSnapshot = useCallback(() => serverDefault, [serverDefault])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Phone-sized viewport — matches Tailwind's `md` breakpoint (below 768px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767.98px)')
}

/**
 * True when the primary input can genuinely hover (mouse/trackpad). Touch screens
 * report false, so hover-driven menus can fall back to tap-to-toggle.
 * Defaults to true on the server to keep desktop hover behaviour through hydration.
 */
export function useHoverCapable(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)', true)
}
