'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import FullScreenPageLoader from '@/components/common/FullScreenPageLoader'
import { beginRouteLoad, useSWRInFlight } from '@/lib/swrLoadingStore'

function isExcludedRoute(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/reset')
  )
}

function isCoveredRoute(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname === '/planner' ||
    pathname === '/portfolio' ||
    pathname === '/audit' ||
    pathname === '/csv' ||
    pathname.startsWith('/coins/')
  )
}

// If a covered route triggers no SWR work shortly after committing, it has
// nothing to load → hide. Kept short so cached/instant navigations don't linger.
const NO_SWR_HIDE_MS = 220
// After SWR drains, wait this long before hiding so sequential fetches (fetch B
// that starts once fetch A resolves) don't cause a premature hide.
const SETTLE_DEBOUNCE_MS = 90
// Cover fade-out duration; must match .lg1-cover-fade transition in globals.css.
const FADE_MS = 300
// Page entrance duration; must match lg1-page-enter animation in globals.css.
const ENTER_MS = 520
// Absolute ceiling so the cover can never get stuck if something goes wrong.
const SAFETY_MS = 9000

const ENTER_CLASS = 'lg1-route-enter'

/**
 * Full-screen cover that appears the instant an in-app navigation link is
 * clicked and stays until the destination route is fully loaded and painted.
 * It then fades out smoothly while the page content plays a coordinated
 * entrance animation, so the reveal feels intentional and "ready to go".
 *
 * The click interceptor (capture phase, before Next's Link handler) is what
 * makes it feel instant: `usePathname()` only updates once navigation commits,
 * which is too late. This is the app's single loading indicator — it renders
 * the L1 spinner (FullScreenPageLoader).
 */
export default function SWRRouteCover() {
  const pathname = usePathname() || ''
  const inFlight = useSWRInFlight()
  const [active, setActive] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const armedDestRef = useRef<string | null>(null)
  const sawInFlightRef = useRef(false)
  const noSwrTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gatingRef = useRef(false)

  const clearWaitTimers = () => {
    for (const t of [noSwrTimer, drainTimer, safetyTimer]) {
      if (t.current) { clearTimeout(t.current); t.current = null }
    }
  }
  const clearLeaveTimers = () => {
    for (const t of [leaveTimer, enterTimer]) {
      if (t.current) { clearTimeout(t.current); t.current = null }
    }
  }

  const removeEnterClass = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove(ENTER_CLASS)
    }
  }

  // Instant, non-animated teardown (used on unmount / safety / leaving covered area).
  const hideNow = () => {
    clearWaitTimers()
    clearLeaveTimers()
    removeEnterClass()
    gatingRef.current = false
    armedDestRef.current = null
    sawInFlightRef.current = false
    setLeaving(false)
    setActive(false)
  }

  // Cancel an in-progress reveal (e.g. the user clicked again mid-fade).
  const cancelLeave = () => {
    clearLeaveTimers()
    removeEnterClass()
    gatingRef.current = false
    setLeaving(false)
  }

  // Smooth exit: wait for the committed content to paint, then fade the cover
  // out while the page content plays its entrance animation.
  const beginHide = () => {
    if (gatingRef.current || leaving) return
    gatingRef.current = true

    let ran = false
    const run = () => {
      if (ran) return
      ran = true
      gatingRef.current = false
      startLeave()
    }
    // Two frames guarantees the freshly-committed DOM has painted; the timeout
    // is a fallback for backgrounded tabs where rAF is paused.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(run))
    }
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(run, 160)
  }

  const startLeave = () => {
    clearWaitTimers()
    clearLeaveTimers()
    if (typeof document !== 'undefined') {
      // Kick the page content's entrance animation exactly as the cover lifts.
      document.documentElement.classList.add(ENTER_CLASS)
    }
    setLeaving(true)
    leaveTimer.current = setTimeout(() => {
      setActive(false)
      setLeaving(false)
    }, FADE_MS)
    enterTimer.current = setTimeout(removeEnterClass, ENTER_MS)
  }

  // Show the cover for a fresh navigation generation.
  const show = () => {
    cancelLeave()
    clearWaitTimers()
    sawInFlightRef.current = false
    beginRouteLoad()
    setActive(true)
    safetyTimer.current = setTimeout(hideNow, SAFETY_MS)
  }

  // ── Instant: show the loader the moment an in-app nav link is clicked ──
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (e.defaultPrevented) return
      // Ignore anything that opens a new tab / isn't a plain left click.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const el = e.target as Element | null
      const a = el && typeof el.closest === 'function'
        ? (el.closest('a[href]') as HTMLAnchorElement | null)
        : null
      if (!a) return

      const targetAttr = a.getAttribute('target')
      if (targetAttr && targetAttr !== '_self') return
      if (a.hasAttribute('download')) return

      const raw = a.getAttribute('href') || ''
      if (!raw || raw.startsWith('#')) return

      let dest = ''
      try {
        const u = new URL(a.href, window.location.origin)
        if (u.origin !== window.location.origin) return // external
        dest = u.pathname
      } catch {
        return
      }

      if (dest === window.location.pathname) return // same page
      if (isExcludedRoute(dest) || !isCoveredRoute(dest)) return

      armedDestRef.current = dest
      show()
    }

    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── On route commit: keep covering (armed click) or start fresh (direct /
  //    programmatic / back-forward), then wait for SWR to settle. ──
  useEffect(() => {
    if (isExcludedRoute(pathname) || !isCoveredRoute(pathname)) {
      hideNow()
      return
    }

    if (armedDestRef.current === pathname) {
      // Came from an armed click — keep the same generation already in progress.
      armedDestRef.current = null
    } else {
      armedDestRef.current = null
      show()
    }

    clearWaitTimers()
    noSwrTimer.current = setTimeout(() => {
      if (!sawInFlightRef.current) beginHide()
    }, NO_SWR_HIDE_MS)
    safetyTimer.current = setTimeout(hideNow, SAFETY_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // ── Track SWR activity; hide once it has fired and fully drained. ──
  useEffect(() => {
    if (!active || leaving) return
    if (inFlight > 0) {
      sawInFlightRef.current = true
      if (noSwrTimer.current) { clearTimeout(noSwrTimer.current); noSwrTimer.current = null }
      if (drainTimer.current) { clearTimeout(drainTimer.current); drainTimer.current = null }
    } else if (sawInFlightRef.current) {
      // Debounce so a follow-up (sequential) fetch can start before we hide.
      if (drainTimer.current) clearTimeout(drainTimer.current)
      drainTimer.current = setTimeout(beginHide, SETTLE_DEBOUNCE_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight, active, leaving])

  // Cleanup on unmount.
  useEffect(() => () => hideNow(), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  if (!active && !leaving) return null
  return (
    <div className={`lg1-cover-fade${leaving ? ' leaving' : ''}`}>
      <FullScreenPageLoader />
    </div>
  )
}
