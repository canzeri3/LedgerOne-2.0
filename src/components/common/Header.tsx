// src/components/header/AppHeader.tsx
'use client'

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/60 backdrop-blur border-b border-slate-800/60">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <h1 className="leading-5">
          <span className="block text-lg font-semibold text-slate-100">LedgerOne 2.0</span>
          <span className="block text-sm text-slate-400">portfolio &amp; planner</span>
        </h1>
      </div>
    </header>
  )
}