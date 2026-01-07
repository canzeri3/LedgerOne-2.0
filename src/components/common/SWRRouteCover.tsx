'use client'

import { useEffect, useMemo, useState } from 'react'
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

// Full-screen cover that remains visible until SWR activity for the current
// route generation finishes. This complements Next's `loading.tsx` (which
// only covers server/segment loading) by also waiting for client-side data.
export default function SWRRouteCover() {
  const pathname = usePathname() || ''
  const inFlight = useSWRInFlight()
  const [active, setActive] = useState(false)
  const [sawInFlight, setSawInFlight] = useState(false)

  const shouldCover = useMemo(() => {
    if (!pathname) return false
    if (isExcludedRoute(pathname)) return false
    return isCoveredRoute(pathname)
  }, [pathname])

  // Start a new "generation" whenever we land on a covered route.
  useEffect(() => {
    if (!shouldCover) {
      setActive(false)
      setSawInFlight(false)
      return
    }

    beginRouteLoad()
    setActive(true)
    setSawInFlight(false)
  }, [shouldCover, pathname])

  // Track whether this route actually triggered SWR work.
  useEffect(() => {
    if (!active) return
    if (inFlight > 0) setSawInFlight(true)
  }, [inFlight, active])

  // Hide once we've seen at least one request and all requests are done.
  useEffect(() => {
    if (!active) return
    if (sawInFlight && inFlight === 0) setActive(false)
  }, [inFlight, sawInFlight, active])

  // Safety: if this route had nothing to fetch, hide after the first paint.
  useEffect(() => {
    if (!active) return
    if (sawInFlight) return
    const raf = requestAnimationFrame(() => {
      if (!sawInFlight && inFlight === 0) setActive(false)
    })
    return () => cancelAnimationFrame(raf)
  }, [active, sawInFlight, inFlight])

  if (!active) return null
  return <FullScreenPageLoader />
}

