'use client'

import { ReactNode } from 'react'
import AuthButton from '@/components/auth/AuthButton'
import Sidebar from '@/components/common/Sidebar'

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-12 bg-[#050e1f] text-slate-100">
      {/* Sidebar (left) */}
      <aside className="col-span-12 md:col-span-2 border-r border-[#0b1830] bg-[#07132a]">
        <div className="h-full flex flex-col">
          {/* Brand fixed at top-left inside sidebar */}
          <div className="px-4 py-4 border-b border-[#0b1830]">
            <div className="text-lg font-semibold tracking-wide">LedgerOne 2.0</div>
            <div className="text-xs text-slate-400 -mt-0.5">Crypto planner & tracker</div>
          </div>
          <Sidebar />
        </div>
      </aside>

      {/* Main column */}
      <div className="col-span-12 md:col-span-10 flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-30 border-b border-[#0b1830] bg-[#081427]/90 backdrop-blur">
          <div className="mx-auto px-4 md:px-6 py-3 flex items-center">
            <div className="text-sm text-slate-300" />
            <div className="ml-auto">
              <AuthButton />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 mx-auto w-full px-4 md:px-6 py-4">
          {children}
        </main>
      </div>
    </div>
  )
}

