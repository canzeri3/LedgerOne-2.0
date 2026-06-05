'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Settings as SettingsIcon, Eye, EyeOff, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import AuthButton from '@/components/auth/AuthButton'
// TS NOTE: Sidebar is default-exported at runtime but TS complains about the default export.
// We explicitly tell TS to ignore this type check and keep the runtime import as-is.
// @ts-ignore
import Sidebar from '@/components/common/Sidebar'
import AuthListener from '@/components/auth/AuthListener'
import { AlertsTooltip } from '@/components/common/AlertsTooltip'
import HeaderCalculator from '@/components/common/HeaderCalculator'
import HeaderCurrencyConverter from '@/components/common/HeaderCurrencyConverter'
import SWRRouteCover from '@/components/common/SWRRouteCover'


// Deep page background (rich-black, very deep blue) — in-app routes
const PAGE_BG = 'rgb(19,20,21)'
// Marketing page background — matches design token --color-bg-base: #0D0E14
const MARKETING_BG = '#0D0E14'
// Semi-opaque surfaces
const SIDEBAR_BG = 'rgb(31,32,33)'
const HEADER_BG = 'rgb(19,20,21)'
// Border tone when scrolled
const BORDER_SCROLL = 'rgb(43,44,45)'
// Glow tone (downward only) when scrolled — very dark
const GLOW_SCROLL = 'rgb(20,21,22)'


export default function AppShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const [hasHeaderAlerts, setHasHeaderAlerts] = useState(false)
  const [showPageLoader, setShowPageLoader] = useState(false)
  const [amountsHidden, setAmountsHidden] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isMobileMarketingMenuOpen, setIsMobileMarketingMenuOpen] = useState(false)

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
  const MARKETING_ROUTES = new Set(['/', '/platform', '/use-cases', '/pricing', '/contact'])
  const isLanding = MARKETING_ROUTES.has(pathname)
  const isMergedLanding = isLanding
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

    const threshold = isLanding ? 24 : 0
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
    setIsMobileMarketingMenuOpen(false)
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
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: isLanding ? MARKETING_BG : PAGE_BG }}>
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
              isLanding ? `l1-nav${scrolled ? ' scrolled' : ''}` : 'backdrop-blur-md',
            ].join(' ')}
            style={{
              backgroundColor: isLanding
                ? (scrolled ? 'rgba(255,255,255,0.03)' : 'transparent')
                : HEADER_BG,
              borderColor: isLanding
                ? (scrolled ? 'rgba(255,255,255,0.08)' : 'transparent')
                : (scrolled ? BORDER_SCROLL : 'rgba(43,44,45,0)'),
              backdropFilter: isLanding
                ? (scrolled ? 'blur(28px) saturate(170%)' : 'none')
                : undefined,
              WebkitBackdropFilter: isLanding
                ? (scrolled ? 'blur(28px) saturate(170%)' : 'none')
                : undefined,
              boxShadow: isLanding
                ? (scrolled ? '0 12px 32px -20px rgba(0,0,0,0.5)' : 'none')
                : (scrolled
                    ? `0 9px 14px -10px ${GLOW_SCROLL},
                       0 9px 14px -10px ${GLOW_SCROLL},
                       0 9px 14px -10px ${GLOW_SCROLL},
                       0 9px 14px -10px ${GLOW_SCROLL}`
                    : 'none'),
            }}
          >
            {isLanding ? (
              // Landing-page header (no sidebar, marketing style)
              <>
                <div className="l1-nav-inner px-4">
                  {/* Left: Logo */}
                  <div className="flex flex-1 items-center" style={{ paddingLeft: 24 }}>
                    <Link href="/" className="l1-nav-brand" aria-label="LedgerOne home">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/ledgerone-logo.png"
                        alt="LedgerOne"
                        style={{ height: 92, width: 'auto', display: 'block' }}
                      />
                    </Link>
                  </div>

                  {/* Center: flat marketing nav (desktop only) */}
                  <nav className="hidden md:flex flex-none items-center justify-center gap-8">
                    {([
                      { href: '/', label: 'Home' },
                      { href: '/platform', label: 'Platform' },
                      { href: '/use-cases', label: 'Use cases' },
                      { href: '/contact', label: 'Contact' },
                    ] as const).map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        className="relative py-1.5 text-[16px] font-medium transition-colors"
                        style={{
                          color: pathname === href ? '#fff' : '#9899B0',
                          textDecoration: 'none',
                        }}
                      >
                        {label}
                        {pathname === href && (
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              bottom: -2,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: 4,
                              height: 4,
                              borderRadius: 999,
                              background: '#5E54C0',
                              boxShadow: '0 0 8px #5E54C0',
                              display: 'block',
                            }}
                          />
                        )}
                      </Link>
                    ))}
                  </nav>

                  {/* Right: Auth + mobile hamburger */}
                  <div className="flex flex-1 items-center justify-end gap-3" style={{ paddingRight: 24 }}>
                    {/* @ts-ignore */}
                    <AuthButton loggedOutVariant="pill" />
                    {/* Hamburger — mobile only */}
                    <button
                      type="button"
                      className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10"
                      aria-label="Toggle menu"
                      onClick={() => setIsMobileMarketingMenuOpen(o => !o)}
                    >
                      {isMobileMarketingMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Mobile dropdown menu */}
                {isMobileMarketingMenuOpen && (
                  <div
                    className="md:hidden"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'rgba(13,14,20,0.97)',
                      backdropFilter: 'blur(24px)',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      zIndex: 50,
                      padding: '12px 0 20px',
                    }}
                  >
                    {([
                      { href: '/', label: 'Home' },
                      { href: '/platform', label: 'Platform' },
                      { href: '/use-cases', label: 'Use cases' },
                      { href: '/contact', label: 'Contact' },
                    ] as const).map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        style={{
                          display: 'block',
                          padding: '12px 28px',
                          fontSize: 17,
                          fontWeight: 500,
                          color: pathname === href ? '#fff' : '#9899B0',
                          textDecoration: 'none',
                        }}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </>
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
                  <HeaderCurrencyConverter />

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
              isLanding
                ? 'flex-1 w-full p-0'
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

