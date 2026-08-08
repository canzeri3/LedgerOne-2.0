'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Coins, LayoutDashboard, Target, Wallet } from 'lucide-react'

/** Scroll distance that takes the bar from full size to fully compact. */
const SHRINK_RANGE = 140
/** Always full size within this distance of the top. */
const TOP_ZONE = 24

type Props = {
  /** Opens the coin picker sheet. */
  onOpenCoins: () => void
}

/**
 * Floating bottom tab bar for phones. Rendered by AppShell on app routes only
 * (never on marketing or auth pages) and hidden from `md` up.
 *
 * There is no /coins index route — coins exist only as /coins/[id] — so the
 * Coins tab pops open a searchable picker rather than pointing at a page that
 * doesn't exist.
 */
export default function MobileTabBar({ onOpenCoins }: Props) {
  const pathname = usePathname() ?? ''
  const navRef = useRef<HTMLElement | null>(null)
  const progressRef = useRef(0)

  // The pill tracks the scroll gesture directly: every px scrolled down moves it
  // a proportional step toward compact, and scrolling back up unwinds it, so it
  // follows the finger rather than playing a fixed-length animation.
  //
  // Progress is written straight to the DOM as a CSS variable instead of React
  // state — this updates on every scroll frame, and re-rendering that often
  // would be wasteful and jittery.
  //
  // <body> is the scroll container here (it carries the overflow), so
  // window.scrollY stays 0 and the scroll event doesn't bubble. Read whichever
  // element actually scrolls and listen in the capture phase, as AppShell does.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const getScrollY = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0

    let lastY = getScrollY()
    let raf = 0

    const apply = (p: number) => {
      progressRef.current = p
      navRef.current?.style.setProperty('--tb-p', p.toFixed(4))
    }

    const update = () => {
      raf = 0
      const y = getScrollY()
      const delta = y - lastY
      lastY = y

      if (y <= TOP_ZONE) {
        apply(0)
        return
      }

      const next = progressRef.current + delta / SHRINK_RANGE
      apply(Math.min(1, Math.max(0, next)))
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }

    const opts = { passive: true, capture: true } as AddEventListenerOptions
    window.addEventListener('scroll', onScroll, opts)
    update()

    return () => {
      window.removeEventListener('scroll', onScroll, opts)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  // A route change resets scroll position, so start at full size again.
  useEffect(() => {
    progressRef.current = 0
    navRef.current?.style.setProperty('--tb-p', '0')
  }, [pathname])

  const isDashboard = pathname === '/dashboard'
  const isPortfolio = pathname.startsWith('/portfolio')
  const isPlanner = pathname.startsWith('/planner')
  const isCoins = pathname.startsWith('/coins')

  return (
    <nav ref={navRef} className="l1-bottomnav md:hidden" aria-label="Primary">
      <Link
        href="/dashboard"
        className={isDashboard ? 'active' : undefined}
        aria-current={isDashboard ? 'page' : undefined}
      >
        <LayoutDashboard aria-hidden="true" />
        <span>Dashboard</span>
      </Link>

      <Link
        href="/portfolio"
        className={isPortfolio ? 'active' : undefined}
        aria-current={isPortfolio ? 'page' : undefined}
      >
        <Wallet aria-hidden="true" />
        <span>Portfolio</span>
      </Link>

      <Link
        href="/planner"
        className={isPlanner ? 'active' : undefined}
        aria-current={isPlanner ? 'page' : undefined}
      >
        <Target aria-hidden="true" />
        <span>Planner</span>
      </Link>

      <button
        type="button"
        onClick={onOpenCoins}
        className={isCoins ? 'active' : undefined}
        aria-current={isCoins ? 'page' : undefined}
      >
        <Coins aria-hidden="true" />
        <span>Coins</span>
      </button>
    </nav>
  )
}
