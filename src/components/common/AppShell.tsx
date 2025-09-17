'use client'

import { ReactNode } from 'react'
import AuthButton from '@/components/auth/AuthButton'
import Sidebar from '@/components/common/Sidebar'
import AuthListener from '@/components/auth/AuthListener'

// Deep page background (rich-black, very deep blue)
const PAGE_BG   = 'oklch(0.08 0.02 260 / 1)'
// Semi-opaque surfaces
const SIDEBAR_BG = 'oklch(0.21 0.03 264.66 / 0.85)'
const HEADER_BG  = 'oklch(0.18 0.04 264.66 / 0.78)'
// Subtle border tone for dark UIs
const BORDER     = '#0b1830'

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: PAGE_BG }}>
      {/* Mount once to keep server cookies in sync with client auth */}
      <AuthListener />

      {/* Sticky sidebar + independent scrolling main column */}
      <div className="grid grid-cols-12">
        {/* Sticky, full-height sidebar (independent of page scroll) */}
        <aside
          className="col-span-12 md:col-span-3 lg:col-span-2 sticky top-0 h-[100dvh] border-r backdrop-blur-md"
          style={{ backgroundColor: SIDEBAR_BG, borderColor: BORDER }}
        >
          <Sidebar />
        </aside>

        {/* Main column: header starts to the right of the sidebar (no overlap) */}
        <div className="col-span-12 md:col-span-9 lg:col-span-10 min-h-screen flex flex-col">
          {/* Semi-opaque header (no title here; title lives in sidebar) */}
          <header
            className="sticky top-0 z-40 border-b backdrop-blur-md"
            style={{ backgroundColor: HEADER_BG, borderColor: BORDER }}
          >
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-end">
              <AuthButton />
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

