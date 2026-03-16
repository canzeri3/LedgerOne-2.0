'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Settings as SettingsIcon, ChevronDown, Eye, EyeOff, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import AuthButton from '@/components/auth/AuthButton'
// TS NOTE: Sidebar is default-exported at runtime but TS complains about the default export.
// We explicitly tell TS to ignore this type check and keep the runtime import as-is.
// @ts-ignore
import Sidebar from '@/components/common/Sidebar'
import AuthListener from '@/components/auth/AuthListener'
import { AlertsTooltip } from '@/components/common/AlertsTooltip'
import HeaderCalculator from '@/components/common/HeaderCalculator'
import SWRRouteCover from '@/components/common/SWRRouteCover'


// Deep page background (rich-black, very deep blue)
const PAGE_BG = 'rgb(19,20,21)'
// Semi-opaque surfaces
const SIDEBAR_BG = 'rgb(31,32,33)'
const HEADER_BG = 'rgb(19,20,21)'
// Border tone when scrolled
const BORDER_SCROLL = 'rgb(43,44,45)'
// Glow tone (downward only) when scrolled — very dark
const GLOW_SCROLL = 'rgb(20,21,22)'

  // Logo sizing knobs (adjust these only)
  const LOGO_W = 320;         // px width of the logo slot (base)
  const LOGO_W_SM = 380;      // px width on sm+
  const LOGO_H = 56;          // px height (base)
  const LOGO_H_SM = 64;       // px height on sm+
  // Logo sizing knob: increase to make logo bigger WITHOUT changing the container/border size
   const LOGO_SCALE = 5.2
  // Logo horizontal nudge (px). Negative moves LEFT; does not change slot/border sizes.
  const LOGO_SHIFT_X_PX = -60
  // Logo vertical nudge (px). Positive moves DOWN; does not change slot/border sizes.
  const LOGO_SHIFT_Y_PX = 7


export default function AppShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const [hasHeaderAlerts, setHasHeaderAlerts] = useState(false)
  const [showPageLoader, setShowPageLoader] = useState(false)
  const [amountsHidden, setAmountsHidden] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  // Init from localStorage AFTER mount (avoids hydration issues)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const v = window.localStorage.getItem('lg1_hide_amounts') === '1'
      setAmountsHidden(v)
    } catch {
      // ignore
    }
  }, [])

   const pathname = usePathname()
  const isLanding = pathname === '/' || pathname === '/pricing'
  const isMergedLanding = pathname === '/'
  const toggleAmountsHidden = () => {
    const next = !amountsHidden
    setAmountsHidden(next)
    try {
      window.localStorage.setItem('lg1_hide_amounts', next ? '1' : '0')
    } catch {
      // ignore
    }
  }


  // Existing scroll shadow effect
  useEffect(() => {
    if (typeof window === 'undefined') return

    const threshold = isMergedLanding ? 24 : 0
    let raf = 0
    let last = -1

    const update = () => {
      raf = 0
      const next = window.scrollY > threshold ? 1 : 0
      if (next !== last) {
        last = next
        setScrolled(next === 1)
      }
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [isMergedLanding])
  
  // Watch the header AlertsTooltip text and detect if there is any numeric count > 0
  // Important: re-attach on route changes because the header tooltip subtree can be replaced.
  useEffect(() => {
    if (typeof document === 'undefined') return

    let observer: MutationObserver | null = null
    let cancelled = false

    const attach = (attempt = 0) => {
      if (cancelled) return

      const root = document.querySelector('[data-header-alerts]')

      // During route transitions, the node may not exist yet; retry briefly.
      if (!root) {
        setHasHeaderAlerts(false)
        if (attempt < 30) {
          setTimeout(() => attach(attempt + 1), 50)
        }
        return
      }

      const update = () => {
        const text = root.textContent || ''
        const match = text.match(/(\d+)/)
        const count = match ? parseInt(match[1], 10) : 0
        setHasHeaderAlerts(count > 0)
      }

      update()

      observer = new MutationObserver(update)
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    }

    attach()

    return () => {
      cancelled = true
      if (observer) observer.disconnect()
    }
  }, [pathname])
  // Privacy masking: when amountsHidden is ON, replace any rendered "$..." text with "***"
  // This is DOM-level on purpose so it also masks server-rendered text and any SWR/live updates.
  const privacyObserverRef = useRef<MutationObserver | null>(null)
  const originalTextRef = useRef<Map<Text, string>>(new Map())

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.body
    const originals = originalTextRef.current

    const shouldSkipParent = (el: Element | null) => {
      if (!el) return true
      const tag = el.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true
      if ((el as HTMLElement).isContentEditable) return true
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      return false
    }

    const maskMoney = (s: string) => {
      // matches "$1,234.56", "-$185.71", "$0", "$12.3" etc.
      return s.replace(/-?\$[\d,]+(?:\.\d+)?/g, '***')
    }

    const maskTextNode = (tn: Text) => {
      const parent = tn.parentElement
      if (shouldSkipParent(parent)) return

      const raw = tn.textContent ?? ''
      if (!raw.includes('$')) return

      // store original once so unhide restores correctly
      if (!originals.has(tn)) originals.set(tn, raw)

      const masked = maskMoney(raw)
      if (masked !== raw) tn.textContent = masked
    }

    const walkTextNodes = (container: Node, fn: (tn: Text) => void) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        fn(node as Text)
        node = walker.nextNode()
      }
    }

    const restoreAll = () => {
      for (const [tn, raw] of originals.entries()) {
        // only restore if node still exists in DOM
        if (tn.isConnected) tn.textContent = raw
      }
      originals.clear()
    }

    // Always stop the old observer first
    if (privacyObserverRef.current) {
      privacyObserverRef.current.disconnect()
      privacyObserverRef.current = null
    }

    if (!amountsHidden) {
      // turning OFF: restore originals and exit
      restoreAll()
      return
    }

    // turning ON: mask current DOM immediately
    walkTextNodes(root, maskTextNode)

    // keep masking new/updated nodes (route changes, SWR updates, etc.)
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData') {
          maskTextNode(m.target as Text)
          continue
        }

        for (const added of m.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) {
            maskTextNode(added as Text)
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            const el = added as Element
            if (shouldSkipParent(el)) continue
            walkTextNodes(el, maskTextNode)
          }
        }
      }
    })

    obs.observe(root, { subtree: true, childList: true, characterData: true })
    privacyObserverRef.current = obs

    return () => {
      obs.disconnect()
      if (privacyObserverRef.current === obs) privacyObserverRef.current = null
    }
  }, [amountsHidden, pathname])

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isMobileNavOpen) return

    const previousOverflow = document.body.style.overflow

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false)
    }

    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileNavOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [isMobileNavOpen])

  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: PAGE_BG }}>
      {/* Mount once to keep server cookies in sync with client auth */}
      <AuthListener />

      {!isLanding && (
        <>
          <div
            aria-hidden="true"
            className={[
              'fixed inset-0 z-[60] bg-black/55 transition-opacity duration-200 ease-out md:hidden',
              isMobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
            ].join(' ')}
            onClick={() => setIsMobileNavOpen(false)}
          />

          <div
            aria-hidden={!isMobileNavOpen}
            id="mobile-navigation-drawer"
            className={[
              'fixed inset-y-0 left-0 z-[70] w-[86vw] max-w-[360px] md:hidden transform transition-transform duration-200 ease-out',
              isMobileNavOpen ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
          >
            <div
              className="flex h-full flex-col overflow-hidden border-r border-[rgb(43,44,45)] backdrop-blur-md shadow-2xl shadow-black/50"
              style={{
                backgroundColor: SIDEBAR_BG,
                color: 'rgb(188,189,189)',
              }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-slate-200">Navigation</span>
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(false)}
                  aria-label="Close navigation menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className="min-h-0 flex-1 overflow-hidden"
                onClickCapture={(event) => {
                  const target = event.target as HTMLElement | null
                  if (target?.closest('a')) setIsMobileNavOpen(false)
                }}
              >
                <Sidebar />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sticky sidebar + independent scrolling main column */}
      <div className="grid grid-cols-12">

        {/* Sticky, full-height sidebar (independent of page scroll) */}
           <aside
          className={
            isLanding
              ? 'hidden'
              : 'hidden md:col-span-3 md:block lg:col-span-2 sticky top-0 h-[100dvh] backdrop-blur-md ring-0 shadow-none z-50'
          }
          style={{
            backgroundColor: SIDEBAR_BG,
            color: 'rgb(188,189,189)',
            borderRight: 'none',
            boxShadow: 'none',
          }}
        >
          <Sidebar />
        </aside>

        {/* Main column: header starts to the right of the sidebar (no overlap) */}
        <div
          className={
            isLanding
              ? 'col-span-12 min-h-screen flex flex-col'
              : 'col-span-12 md:col-span-9 lg:col-span-10 min-h-screen flex flex-col -ml-px'
          }
        >
          {/* Semi-opaque header */}
             <header
            className={[
              'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-out will-change-auto',
              isMergedLanding ? '-mb-20 sm:-mb-[88px]' : 'backdrop-blur-md',
              isMergedLanding && scrolled ? 'backdrop-blur-md' : '',
            ].join(' ')}
            style={{
              backgroundColor: isMergedLanding ? (scrolled ? 'rgba(19,20,21,0.78)' : 'transparent') : HEADER_BG,
              borderColor: scrolled ? BORDER_SCROLL : 'rgba(43,44,45,0)',
              // One touch longer (offset 9px, blur 14px), same darkness, stacked x4
              boxShadow: scrolled
                ? `0 9px 14px -10px ${GLOW_SCROLL},
                   0 9px 14px -10px ${GLOW_SCROLL},
                   0 9px 14px -10px ${GLOW_SCROLL},
                   0 9px 14px -10px ${GLOW_SCROLL}`
                : 'none',
            }}
          >
            {isLanding ? (
              // Landing-page header (no sidebar, marketing style)
              <div className="flex w-full items-center gap-8 px-4 py-4">
                {/* Left: Logo (pinned to far left) */}
<div className="flex flex-1 items-center -ml-4">
                  <Link href="/" className="flex items-center gap-2" aria-label="LedgerOne home">
               {/* Base */}
<div className="relative h-12 w-full max-w-[420px] overflow-hidden sm:h-14 sm:hidden">
  <Image
    src="/lg1-logo.png"
    alt="LedgerOne"
    fill
    priority
    sizes="420px"
    style={{
      objectFit: 'cover',
      objectPosition: 'left center',
transform: `scale(${LOGO_SCALE}) translate(${LOGO_SHIFT_X_PX / LOGO_SCALE}px, ${LOGO_SHIFT_Y_PX / LOGO_SCALE}px)`,
      transformOrigin: 'left center',
    }}
  />
</div>


{/* sm+ */}
<div
  className="relative hidden overflow-hidden sm:block"
  style={{ width: LOGO_W_SM, height: LOGO_H_SM }}
>
  <Image
    src="/lg1-logo.png"
    alt="LedgerOne"
    fill
    sizes={`${LOGO_W_SM}px`}
    priority
    style={{
      objectFit: 'contain',
      objectPosition: 'left center',
transform: `scale(${LOGO_SCALE}) translate(${LOGO_SHIFT_X_PX / LOGO_SCALE}px, ${LOGO_SHIFT_Y_PX / LOGO_SCALE}px)`,
      transformOrigin: 'left center',
    }}
  />
</div>





                  </Link>
                </div>

                {/* Center: Product / Resources / Price (dropdowns with clickable rows) */}
                <nav className="hidden md:flex flex-none items-center justify-center gap-8 text-sm md:text-base font-medium text-slate-200">
                  <LandingNavGroup
                    label="Product"
                    items={[
                      {
                        label: 'Overview',
                        href: '/#overview',
                        description: 'How the workspace is structured end-to-end.',
                      },
                      {
                        label: 'Planner engine',
                        href: '/#planner',
                        description: 'Encode buy & sell bands into a programmable plan.',
                      },
                      {
                        label: 'Risk metrics',
                        href: '/#risk',
                        description: 'Track structural, vol, and tail risk on one card.',
                      },
                    ]}
                  />
                  <LandingNavGroup
                    label="Resources"
                    items={[
                      {
                        label: 'How it works',
                        href: '/how-to',
                        description: 'Step-by-step walkthrough of a full trade cycle.',
                      },
                      {
                        label: 'Methodology',
                        href: '/#methodology',
                        description: 'Principles behind the planning and risk framework.',
                      },
                      {
                        label: 'Support',
                        href: '/#support',
                        description: 'Get help configuring your workspace and flows.',
                      },
                    ]}
                  />
                  <LandingNavGroup
                    label="Price"
                    items={[
                      {
  label: 'Plans & access',
  href: '/pricing',
  description: 'How access and quota are structured.',
},

                      {
                        label: 'Desks & teams',
                        href: '/#teams',
                        description: 'Run LedgerOne across multiple traders and books.',
                      },
                      {
                        label: 'Custom',
                        href: '/#contact',
                        description: 'Discuss institutional setups and integrations.',
                      },
                    ]}
                  />
                </nav>

                {/* Right: Auth (pinned to far right) */}
                <div className="flex flex-1 items-center justify-end">
                  {/* @ts-ignore */}
                  <AuthButton loggedOutVariant="pill" />
                </div>
              </div>
            ) : (
              // Default in-app header (logo left, alerts + settings + auth right)
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
                {/* Left: mobile nav trigger + logo slot for in-app views */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(true)}
                    aria-label="Open navigation menu"
                    aria-expanded={isMobileNavOpen}
                    aria-controls="mobile-navigation-drawer"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-slate-50 md:hidden"
                  >
                    <Menu className="h-4 w-4" />
                  </button>

                  <Link
                    href="/dashboard"
                    className="hidden items-center gap-2 md:flex"
                    aria-label="LedgerOne dashboard"
                  >
                    {/* In-app logo intentionally omitted (existing behavior preserved) */}
                  </Link>
                </div>

                {/* Right: alerts, settings, auth */}
                <div className="flex items-center justify-end gap-3">
                  
                  {/* Alerts in header – same logic as dashboard, styled via data-header-alerts + header-has-alerts */}
                  <div
                    className={[
                      'hidden sm:inline-flex',
                      hasHeaderAlerts ? 'header-has-alerts' : '',
                    ].join(' ')}
                    data-header-alerts
                  >
                    <AlertsTooltip
                      coinIds={[]}
                      tradesByCoin={new Map() as any}
                      coins={undefined}
                    />
                  </div>

<HeaderCalculator />

                  {/* Settings gear – icon only (no circle) */}
                                    {/* Privacy toggle – mask on-screen currency amounts */}
                  <button
                    type="button"
                    onClick={toggleAmountsHidden}
                    aria-label={amountsHidden ? 'Show amounts' : 'Hide amounts'}
                    title={amountsHidden ? 'Show amounts' : 'Hide amounts'}
                    className="inline-flex h-9 w-9 items-center justify-center hover:text-slate-50 transition-colors"
                  >
                    {amountsHidden ? (
                      <EyeOff className="h-4 w-4 text-slate-200" />
                    ) : (
                      <Eye className="h-4 w-4 text-slate-200" />
                    )}
                  </button>

                  <Link
                    href="/settings"
                    aria-label="Settings & preferences"
                    className="inline-flex h-9 w-9 items-center justify-center hover:text-slate-50 transition-colors"
                  >
                    <SettingsIcon className="h-4 w-4 text-slate-200" />
                  </Link>

                  {/* Force the user email button bg + border to rgb(19,20,21) */}
                  {/* @ts-ignore */}
                  <AuthButton className="bg-[rgb(19,20,21)] border border-[rgb(19,20,21)]" />
                </div>
              </div>
            )}
          </header>

                 {/* Scrollable page content */}
          <main
            className={
              isMergedLanding
                ? 'flex-1 mx-auto w-full px-4 md:px-6 pb-4 pt-0'
                : 'flex-1 mx-auto w-full px-4 md:px-6 py-4'
            }
          >
            {children}
          </main>
    </div>
  </div>

  {/* Keeps the cover visible until SWR-backed components finish loading for the new route */}
  <SWRRouteCover />
</div>

  )
}

type LandingNavItem = {
  label: string
  href: string
  description?: string
}

function LandingNavGroup({ label, items }: { label: string; items: LandingNavItem[] }) {
  return (
    <div className="relative group">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm md:text-base font-medium text-slate-200 hover:text-slate-50"
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {/* Popout container: covers the vertical gap with padding so hover never "drops" */}
      <div
        className="
          pointer-events-none
          invisible
          opacity-0
          absolute
          left-1/2
          top-full
          z-40
          w-72
          -translate-x-1/2
          pt-2
          transition
          duration-150
          group-hover:visible
          group-hover:opacity-100
          group-hover:pointer-events-auto
          group-focus-within:visible
          group-focus-within:opacity-100
          group-focus-within:pointer-events-auto
        "
      >
        <div className="rounded-2xl border border-slate-800/80 bg-[#151618] p-2 shadow-xl shadow-black/60">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="block rounded-xl px-3 py-2 text-left hover:bg-slate-900/80"
            >
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-slate-50">
                  {item.label}
                </span>
                {item.description && (
                  <span className="mt-0.5 text-[11px] text-slate-400">
                    {item.description}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
