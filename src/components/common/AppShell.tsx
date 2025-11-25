'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Settings as SettingsIcon, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import AuthButton from '@/components/auth/AuthButton'
// TS NOTE: Sidebar is default-exported at runtime but TS complains about the default export.
// We explicitly tell TS to ignore this type check and keep the runtime import as-is.
// @ts-ignore
import Sidebar from '@/components/common/Sidebar'
import AuthListener from '@/components/auth/AuthListener'
import { AlertsTooltip } from '@/components/common/AlertsTooltip'

// Deep page background (rich-black, very deep blue)
const PAGE_BG = 'rgb(19,20,21)'
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
  const pathname = usePathname()
  const isLanding = pathname === '/'

  // Existing scroll shadow effect
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Global page loader overlay with route-based rules
  useEffect(() => {
    if (!pathname) return

    // Routes where we NEVER show the overlay:
    // - Landing
    // - Login / signup
    // - Password-related pages (reset + auth flows)
    const disableLoader =
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/reset' ||
      pathname === '/auth' ||
      pathname.startsWith('/auth/')

    if (disableLoader) {
      setShowPageLoader(false)
      return
    }

    // "Heavy" core workspace pages: keep full 1.5s interaction
    const isHeavyRoute =
      pathname === '/dashboard' ||
      pathname === '/planner' ||
      pathname.startsWith('/coins') ||
      pathname === '/portfolio'

    const duration = isHeavyRoute ? 1500 : 1000

    setShowPageLoader(true)
    const timer = setTimeout(() => {
      setShowPageLoader(false)
    }, duration)

    return () => clearTimeout(timer)
  }, [pathname])

  // Watch the header AlertsTooltip text and detect if there is any numeric count > 0
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.querySelector('[data-header-alerts]')
    if (!root) return

    const update = () => {
      const text = root.textContent || ''
      const match = text.match(/(\d+)/)
      const count = match ? parseInt(match[1], 10) : 0
      setHasHeaderAlerts(count > 0)
    }

    update()

    const observer = new MutationObserver(update)
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: PAGE_BG }}>
      {/* Mount once to keep server cookies in sync with client auth */}
      <AuthListener />

      {/* Full-screen blurred loader overlay (except on excluded routes) */}
      {showPageLoader && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/45 backdrop-blur-md">
          <div className="lg1-page-loader">
            <div className="lg1-loader-orbit">
              <div className="lg1-triangle1" />
              <div className="lg1-triangle2" />
            </div>
            <div className="lg1-loader-text">
              Preparing your LedgerOne workspace…
            </div>
          </div>
        </div>
      )}

      {/* Sticky sidebar + independent scrolling main column */}
      <div className="grid grid-cols-12">
        {/* Sticky, full-height sidebar (independent of page scroll) */}
        <aside
          className={
            isLanding
              ? 'hidden'
              : 'col-span-12 md:col-span-3 lg:col-span-2 sticky top-0 h-[100dvh] backdrop-blur-md ring-0 shadow-none z-50'
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
            className="sticky top-0 z-40 backdrop-blur-md border-b transition-[border-color,box-shadow] duration-300 ease-out will-change-auto"
            style={{
              backgroundColor: HEADER_BG,
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
                <div className="flex flex-1 items-center">
                  <Link href="/" className="flex items-center gap-2" aria-label="LedgerOne home">
                    <Image
                      src="/lg1-logo.png"
                      alt="LedgerOne"
                      width={260}
                      height={100}
                      priority
                      className="h-12 w-auto sm:h-14"
                    />
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
                        href: '/#pricing',
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

                {/* Right: Login (pinned to far right) */}
                <div className="flex flex-1 items-center justify-end">
                  <Link
                    href="/login"
                    className="rounded-full border border-slate-700/80 bg-[#1f2021] px-4 py-1.5 text-xs md:text-sm font-medium text-slate-200 hover:border-slate-500/80 hover:bg-slate-900"
                  >
                    Log in
                  </Link>
                </div>
              </div>
            ) : (
              // Default in-app header (logo left, alerts + settings + auth right)
              <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
                {/* Left: Logo for in-app views */}
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2"
                  aria-label="LedgerOne dashboard"
                >
                  {/* In-app logo intentionally omitted (existing behavior preserved) */}
                </Link>

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

                  {/* Settings gear – icon only (no circle) */}
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
          <main className="flex-1 mx-auto w-full px-4 md:px-6 py-4">
            {children}
          </main>
        </div>
      </div>
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
