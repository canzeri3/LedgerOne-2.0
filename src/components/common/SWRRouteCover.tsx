'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

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
// Progress indicator fade-out; must match .lg1-route-progress in globals.css.
const FADE_MS = 180
// Absolute ceiling so the indicator can never get stuck if something goes wrong.
const SAFETY_MS = 9000

/**
 * Non-blocking route progress that appears when an in-app navigation begins
 * and completes once the destination's SWR work has settled. The existing page
 * and app chrome remain visible and interactive throughout the transition.
 *
 * The click interceptor (capture phase, before Next's Link handler) is what
 * makes it feel instant: `usePathname()` only updates once navigation commits,
 * which is too late for immediate navigation feedback.
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
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gatingRef = useRef(false)

  const clearWaitTimers = () => {
    for (const t of [noSwrTimer, drainTimer, safetyTimer]) {
      if (t.current) { clearTimeout(t.current); t.current = null }
    }
  }
  const clearLeaveTimers = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }

  // Instant, non-animated teardown (used on unmount / safety / leaving covered area).
  const hideNow = () => {
    clearWaitTimers()
    clearLeaveTimers()
    gatingRef.current = false
    armedDestRef.current = null
    sawInFlightRef.current = false
    setLeaving(false)
    setActive(false)
  }

  // Cancel an in-progress reveal (e.g. the user clicked again mid-fade).
  const cancelLeave = () => {
    clearLeaveTimers()
    gatingRef.current = false
    setLeaving(false)
  }

  // Smooth exit: wait for the committed content to paint, complete the bar,
  // then fade it away without delaying or animating the page itself.
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
    setLeaving(true)
    leaveTimer.current = setTimeout(() => {
      setActive(false)
      setLeaving(false)
    }, FADE_MS)
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

  // ── Instant: show progress the moment an in-app nav link is clicked ──
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
    <div
      className={`lg1-route-loading${leaving ? ' leaving' : ''}`}
      role="status"
      aria-label="Loading page"
      aria-live="polite"
    >
      <span className="lg1-route-progress" aria-hidden="true">
        <span className="lg1-route-progress-bar" />
      </span>

      <span className="lg1-route-loader-mark" aria-hidden="true">
        <svg viewBox="8 7.5 24 24" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lg1-route-mark-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9b93ff" />
              <stop offset="1" stopColor="#6559c7" />
            </linearGradient>
          </defs>
          <g fill="url(#lg1-route-mark-grad)">
            <rect x="8" y="8" width="7" height="23" rx="1" />
            <rect x="8" y="25" width="13" height="6" rx="1" />
            <rect x="26" y="8" width="6" height="23" rx="1" />
            <rect x="19" y="8" width="13" height="6" rx="1" />
          </g>
        </svg>
      </span>
    </div>
  )
}
