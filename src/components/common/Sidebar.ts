'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  rank?: number | null
}

export function Sidebar() {
  const { data, error, isLoading } = useSWR<Coin[]>('/api/coins')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const list = data ?? []
    if (!q.trim()) return list
    const s = q.trim().toLowerCase()
    return list.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s) ||
        c.coingecko_id.toLowerCase().includes(s)
    )
  }, [data, q])

  return (
    <div className="flex h-full flex-col">
      {/* Brand (sticky at top-left) */}
      <div className="sticky top-0 left-0 z-10 bg-[#020b17] border-b border-[#081427] px-4 py-3">
        <Link href="/" className="block font-bold tracking-tight text-lg">
          LedgerOne 2.0
        </Link>
        <div className="text-xs text-slate-400">
          Planner + Ledger for Crypto
        </div>
      </div>

      {/* Navigation + Coins (scrollable) */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="text-slate-300 uppercase tracking-wider text-xs mb-2">Navigation</div>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/" className="block rounded-lg px-3 py-2 hover:bg-[#0a162c]">
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/auth" className="block rounded-lg px-3 py-2 hover:bg-[#0a162c]">
                Auth
              </Link>
            </li>
          </ul>
        </div>

        {/* Coins dropdown */}
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#0a162c]"
          >
            <span className="text-slate-300 uppercase tracking-wider text-xs">Coins</span>
            <ChevronRight
              className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>

          {open && (
            <div className="mt-2 space-y-2">
              {/* Search box */}
              <label className="relative block">
                <span className="sr-only">Search coins</span>
                <span className="pointer-events-none absolute left-3 top-2.5">
                  <Search className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search symbol or name…"
                  className="w-full rounded-lg bg-[#0a162c] border border-[#081427] pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0a1b34]"
                />
              </label>

              {/* List */}
              {isLoading && (
                <div className="text-xs text-slate-400 px-3 py-1">Loading…</div>
              )}
              {error && (
                <div className="text-xs text-rose-400 px-3 py-1">Failed to load coins</div>
              )}
              <ul className="space-y-1 text-sm max-h-[60vh] overflow-y-auto pr-1">
                {filtered?.map((c) => (
                  <li key={c.coingecko_id}>
                    <Link
                      href={`/coins/${c.coingecko_id}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#0a162c]"
                      title={c.name}
                    >
                      <span className="truncate">
                        {c.symbol.toUpperCase()} <span className="text-slate-400">({c.name})</span>
                      </span>
                      {typeof c.rank === 'number' && (
                        <span className="text-[10px] text-slate-500">#{c.rank}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </nav>
    </div>
  )
}

