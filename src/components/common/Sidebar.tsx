'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { ChevronRight, Search, Star } from 'lucide-react'
import { useFavorites } from '@/lib/useFavorites'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  market_cap_rank?: number | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href
  return (
    <Link
      href={href}
      className={[
        'block rounded-lg px-3 py-2 hover:bg-[#0a162c]',
        active ? 'bg-[#0a162c] text-white' : 'text-slate-200'
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [coinsOpen, setCoinsOpen] = useState<boolean>(pathname?.startsWith('/coins') ?? false)
  const [query, setQuery] = useState('')

  const { data: coins } = useSWR<Coin[]>('/api/coins', fetcher)
  const { set: favSet } = useFavorites()

  const topCoins: Coin[] = useMemo(() => {
    const list = Array.isArray(coins) ? coins.slice() : []
    list.sort((a, b) => {
      const ra = a.market_cap_rank ?? Number.MAX_SAFE_INTEGER
      const rb = b.market_cap_rank ?? Number.MAX_SAFE_INTEGER
      return ra - rb
    })
    return list.slice(0, 50)
  }, [coins])

  const favorites: Coin[] = useMemo(() => {
    if (!coins) return []
    return coins.filter(c => favSet.has(c.coingecko_id))
      .sort((a, b) => (a.symbol ?? '').localeCompare(b.symbol ?? ''))
  }, [coins, favSet])

  const filteredCoins = useMemo(() => {
    const q = query.trim().toLowerCase()
    const src = topCoins
    if (!q) return src
    return src.filter(c =>
      c.symbol?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.coingecko_id?.toLowerCase().includes(q)
    )
  }, [query, topCoins])

  return (
    <div className="flex h-full flex-col">
      {/* Brand — pinned to the top-left of the sidebar */}
      <div className="sticky top-0 z-10 bg-[#0f1b34] px-3 py-3 border-b border-[#0b1830]">
        <div className="text-lg font-semibold tracking-wide text-slate-100">LedgerOne 2.0</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">portfolio & planner</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          <li><NavLink href="/" label="Dashboard" /></li>
          <li><NavLink href="/planner" label="Buy/Sell Planner" /></li>
          <li><NavLink href="/portfolio" label="Portfolio" /></li>
          <li><NavLink href="/audit" label="Audit Log" /></li>
          <li><NavLink href="/csv" label="CSV Export / Import" /></li>
        </ul>

        {/* Favorites quick links */}
        <div className="mt-5">
          <div className="flex items-center gap-2 text-slate-300 px-3 mb-2">
            <Star className="h-4 w-4 text-amber-300" />
            <span className="text-sm font-medium">Favorites</span>
          </div>
          {favorites.length === 0 ? (
            <div className="px-3 text-xs text-slate-500">Star a coin on its page to pin it here.</div>
          ) : (
            <ul className="space-y-1 px-1">
              {favorites.map(c => (
                <li key={c.coingecko_id}>
                  <Link
                    href={`/coins/${c.coingecko_id}`}
                    className={[
                      'block rounded-md px-2 py-1.5 text-sm hover:bg-[#0a162c]',
                      pathname === `/coins/${c.coingecko_id}` ? 'bg-[#0a162c] text-white' : 'text-slate-200'
                    ].join(' ')}
                  >
                    <span className="font-medium">{c.symbol?.toUpperCase() ?? c.coingecko_id}</span>
                    <span className="ml-2 text-slate-400">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Coins dropdown */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setCoinsOpen(v => !v)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-[#0a162c]"
            aria-expanded={coinsOpen}
            aria-controls="coins-panel"
          >
            <span className="font-medium">Coins</span>
            <ChevronRight className={`h-4 w-4 transition-transform ${coinsOpen ? 'rotate-90' : ''}`} />
          </button>

          {coinsOpen && (
            <div id="coins-panel" className="mt-2 px-2">
              {/* Search input */}
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search coin…"
                  className="w-full rounded-md bg-[#0a162c] pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-400 border border-[#0b1830] focus:outline-none focus:ring-1 focus:ring-[#18305f]"
                />
              </div>

              {/* Coin list */}
              <ul className="space-y-1 max-h-72 overflow-auto pr-1">
                {filteredCoins.map(c => (
                  <li key={c.coingecko_id}>
                    <Link
                      href={`/coins/${c.coingecko_id}`}
                      className={[
                        'block rounded-md px-2 py-1.5 text-sm hover:bg-[#0a162c]',
                        pathname === `/coins/${c.coingecko_id}` ? 'bg-[#0a162c] text-white' : 'text-slate-200'
                      ].join(' ')}
                    >
                      <span className="font-medium">{c.symbol?.toUpperCase() ?? c.coingecko_id}</span>
                      <span className="ml-2 text-slate-400">{c.name}</span>
                      {typeof c.market_cap_rank === 'number' && (
                        <span className="ml-2 rounded-full border border-[#0b1830] px-1.5 py-0.5 text-[10px] text-slate-400 align-middle">
                          #{c.market_cap_rank}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
                {filteredCoins.length === 0 && (
                  <li className="text-xs text-slate-400 px-2 py-1.5">No matches.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </nav>

      <div className="px-3 py-3 text-[10px] text-slate-500 border-t border-[#0b1830]">
        v1.0 • deep blue theme
      </div>
    </div>
  )
}

