'use client'

import { useMemo, useState, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import {
  ChevronRight,
  Search,
  Star,
  LayoutDashboard,
  Target,
  Wallet,
  ScrollText,
  FileSpreadsheet,
  Coins as CoinsIcon,
  HelpCircle,
} from 'lucide-react'

import { useFavorites } from '@/lib/useFavorites'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  market_cap_rank?: number | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function NavLink({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: ReactNode
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname?.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
        'hover:bg-[rgb(42,43,44)]',
        active ? 'bg-[rgb(42,43,44)] !text-[rgb(252,252,252)]' : 'text-slate-200',

      ].join(' ')}
    >
     <span className={['shrink-0', active ? 'text-[rgb(138,128,216)]' : ''].join(' ')}>
  {icon}
</span>

      <span className="truncate">{label}</span>
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [coinsOpen, setCoinsOpen] = useState<boolean>(
    pathname?.startsWith('/coins') ?? false
  )
  const [query, setQuery] = useState('')

  const { data: coins } = useSWR<Coin[]>('/api/coins', fetcher)
  const { set: favSet } = useFavorites()

  // Keep existing market-cap sort logic (top 50)
  const topCoins: Coin[] = useMemo(() => {
    const list = Array.isArray(coins) ? coins.slice() : []
    list.sort((a, b) => {
      const ra = a.market_cap_rank ?? Number.MAX_SAFE_INTEGER
      const rb = b.market_cap_rank ?? Number.MAX_SAFE_INTEGER
      return ra - rb
    })
    return list.slice(0, 50)
  }, [coins])

  // Search filter
  const filteredCoins = useMemo(() => {
    const q = query.trim().toLowerCase()
    const src = topCoins
    if (!q) return src
    return src.filter(
      (c) =>
        c.symbol?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.coingecko_id?.toLowerCase().includes(q)
    )
  }, [query, topCoins])

  return (
    // Sidebar scrolls independently if content exceeds viewport
    <div className="flex h-full max-h-[100dvh] flex-col overflow-y-auto">
      {/* Title (less bold + smaller subtitle, updated dot) */}
      <div className="px-3 pt-4 pb-3">


        <div className="leading-tight text-left">
          <div className="text-[30px] md:text-[30px] font-semibold tracking-tight text-slate-100">
            LedgerOne
          </div>
          <div className="text-[12px] md:text-[12px] text-slate-300 -mt-1/4">
  portfolio · planner
</div>


        </div>
      </div>

      <nav className="px-2 py-3">
        {/* Primary nav with icons on the left */}
        <ul className="space-y-1">
          <li>
            <NavLink
              href="/"
              label="Dashboard"
              icon={<LayoutDashboard className="h-4 w-4 opacity-80" />}
            />
          </li>
          <li>
            <NavLink
              href="/planner"
              label="Buy/Sell Planner"
              icon={<Target className="h-4 w-4 opacity-80" />}
            />
          </li>
          <li>
            <NavLink
              href="/portfolio"
              label="Portfolio"
              icon={<Wallet className="h-4 w-4 opacity-80" />}
            />
          </li>
          <li>
            <NavLink
              href="/audit"
              label="Audit Log"
              icon={<ScrollText className="h-4 w-4 opacity-80" />}
            />
          </li>
          <li>
            <NavLink
              href="/csv"
              label="CSV Export / Import"
              icon={<FileSpreadsheet className="h-4 w-4 opacity-80" />}
            />
          </li>
        </ul>
          <li>
            <NavLink
              href="/how-to"
              label="How to Use"
              icon={<HelpCircle className="h-4 w-4 opacity-80" />}
            />
          </li>

        {/* Coins dropdown */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setCoinsOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-slate-200 transition-colors hover:bg-white/10"
            aria-expanded={coinsOpen}
            aria-controls="coins-panel"
          >
            <span className="flex items-center gap-2">
              <CoinsIcon className="h-4 w-4 opacity-80" />
              <span className="font-medium">Coins</span>
            </span>
            <ChevronRight
              className={`h-4 w-4 transition-transform ${coinsOpen ? 'rotate-90' : ''}`}
            />
          </button>

          {coinsOpen && (
            <div id="coins-panel" className="mt-2 px-2">
              {/* Search input */}
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-300" />
                <input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  className={[
    'w-full rounded-md pl-8 pr-2 py-2 text-sm text-slate-100 placeholder:text-slate-400',
    'bg-[rgb(42,43,44)]',                 // inner area color
    'border border-[rgb(64,65,66)]',      // default border color
    'focus:outline-none focus:ring-2 focus:ring-[rgb(64,65,66)] focus:border-[rgb(64,65,66)]',
    'transition-colors',
  ].join(' ')}
  placeholder="Search coins..."
/>

              </div>

              {/* Unified coins list (UI-only reordering: favourites float to the top) */}
              <ul className="flex flex-col gap-1 max-h-72 overflow-auto pr-1">
                {filteredCoins.map((c) => {
                  const isFav = favSet?.has?.(c.coingecko_id)
                  return (
                    <li key={c.coingecko_id} style={{ order: isFav ? -1 : 0 }}>
                      <Link
                        href={`/coins/${c.coingecko_id}`}
                        className={[
                          'flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
                          'hover:bg-white/10', // stronger hover
                          pathname === `/coins/${c.coingecko_id}`
                          ? 'bg-white/15 !text-[rgb(252,252,252)]'
                          : 'text-slate-200',
                        
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <span className="font-medium">
                            {c.symbol?.toUpperCase() ?? c.coingecko_id}
                          </span>
                          <span className="ml-2 text-slate-400 truncate">{c.name}</span>
                          {typeof c.market_cap_rank === 'number' && (
                            <span className="ml-2 rounded-full border border-[#0b1830] px-1.5 py-0.5 text-[10px] text-slate-400 align-middle">
                              #{c.market_cap_rank}
                            </span>
                          )}
                        </div>

                        {/* Star only on favourited coins (no empty star for others) */}
                        {isFav && (
                          <span className="shrink-0 pl-2">
                            <Star
                              className="h-4 w-4 text-yellow-400"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
                {filteredCoins.length === 0 && (
                  <li className="text-xs text-slate-400 px-2 py-1.5">No matches.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </nav>

    
    </div>
  )
}

