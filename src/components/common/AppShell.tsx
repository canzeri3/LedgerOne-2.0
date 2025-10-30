'use client'

import { ReactNode, useEffect, useState } from 'react'
import AuthButton from '@/components/auth/AuthButton'
import Sidebar from '@/components/common/Sidebar'
import AuthListener from '@/components/auth/AuthListener'

// Deep page background (rich-black, very deep blue)
const PAGE_BG = 'rgb(19,20,21)';
// Semi-opaque surfaces
const SIDEBAR_BG = 'rgb(31,32,33)'
const HEADER_BG  = 'rgb(19,20,21)'
// Border tone when scrolled
const BORDER_SCROLL = 'rgb(43,44,45)'
// Glow tone (downward only) when scrolled — very dark
const GLOW_SCROLL = 'rgb(20,21,22)'

export default function AppShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: PAGE_BG }}>
      {/* Mount once to keep server cookies in sync with client auth */}
      <AuthListener />

      {/* Sticky sidebar + independent scrolling main column */}
      <div className="grid grid-cols-12">
        {/* Sticky, full-height sidebar (independent of page scroll) */}
        <aside
          className="col-span-12 md:col-span-3 lg:col-span-2 sticky top-0 h-[100dvh] backdrop-blur-md ring-0 shadow-none z-50"
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
        <div className="col-span-12 md:col-span-9 lg:col-span-10 min-h-screen flex flex-col -ml-px">
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
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-end">
              {/* Force the user email button bg + border to rgb(19,20,21) */}
              <AuthButton className="bg-[rgb(19,20,21)] border border-[rgb(19,20,21)]" />
            </div>
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
