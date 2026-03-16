'use client'

import { useDeferredValue, useMemo, useState, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import Image from 'next/image'
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
  Settings as SettingsIcon,
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
const hrefPath = href.split('?')[0]
const active = pathname === hrefPath || pathname?.startsWith(hrefPath + '/')

  return (
    <Link
      href={href}
      className={[
'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors max-md:min-h-11',
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

// Logo sizing knob (adjust ONLY this to make the logo bigger; no borders/containers change)
const LOGO_SCALE = 1.25
const LOGO_SHIFT_PX = -30 // negative = move visible logo LEFT, positive = move RIGHT (size unchanged)
const LOGO_SHIFT_Y_PX = 10 // positive = move image DOWN, negative = move UP (borders/slot unchanged)




export default function Sidebar() {
  const pathname = usePathname()

  const plannerHref = useMemo(() => {
    const parts = (pathname ?? '').split('/').filter(Boolean)
    if (parts[0] !== 'coins' || !parts[1]) return '/planner'

    const coinId = (() => {
      try {
        return decodeURIComponent(parts[1])
      } catch {
        return parts[1]
      }
    })().trim()

    return coinId ? `/planner?id=${encodeURIComponent(coinId)}` : '/planner'
  }, [pathname])

  // Open Coins section by default on all pages
  const [coinsOpen, setCoinsOpen] = useState<boolean>(true)
  const [query, setQuery] = useState('')

  const { data: coins } = useSWR<Coin[]>(
    '/api/coins?limit=500&order=marketcap',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const { set: favSet } = useFavorites()

  const topCoins: Coin[] = useMemo(() => {
    const list = Array.isArray(coins) ? coins.slice() : []
    list.sort((a, b) => {
      const ra = a.market_cap_rank ?? Number.MAX_SAFE_INTEGER
      const rb = b.market_cap_rank ?? Number.MAX_SAFE_INTEGER
      return ra - rb
    })
    return list.slice(0, 500)
  }, [coins])

  const deferredQuery = useDeferredValue(query)

  const searchableCoins = useMemo(
    () =>
      topCoins.map((coin) => ({
        coin,
        searchText: [coin.symbol, coin.name, coin.coingecko_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [topCoins]
  )

  const filteredCoins = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return topCoins

    return searchableCoins
      .filter(({ searchText }) => searchText.includes(q))
      .map(({ coin }) => coin)
  }, [deferredQuery, searchableCoins, topCoins])
  
  return (
    // Sidebar scrolls independently if content exceeds viewport
<div className="flex h-full max-h-[100dvh] flex-col overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-auto-hide md:overscroll-auto">
          {/* Brand logo */}
<div className="pt-3 pb-2 px-0 -ml-4 w-[calc(100%+16px)] md:pt-4 md:pb-3">

        {/* Brand logo */}
     <div className="pl-0 pr-1 pt-0 pb-0">

   <div className="relative h-12 w-full overflow-hidden md:h-14">
          <Image
            src="/lg1-logo.png"
            alt="LedgerOne · portfolio planner"
            fill
            priority
            sizes="(min-width: 1024px) 16vw, (min-width: 768px) 25vw, 100vw"
            style={{
              objectFit: 'cover', // ensures it fills the full slot width
              objectPosition: 'left center', // keeps the mark anchored to the left
transform: `scale(${LOGO_SCALE}) translate(${LOGO_SHIFT_PX / LOGO_SCALE}px, ${LOGO_SHIFT_Y_PX / LOGO_SCALE}px)`,
              transformOrigin: 'left center',
            }}
          />
        </div>
      </div>





      </div>




            <nav className="px-2 py-2 md:py-3">
  {/* Primary nav with icons on the left */}
  <ul className="space-y-1">
    <li>
      <NavLink
        href="/dashboard"
        label="Dashboard"
        icon={<LayoutDashboard className="h-4 w-4 opacity-80" />}
      />
    </li>

    <li>
<NavLink
  href={plannerHref}
  label="Planner"
  icon={<Target className="h-4 w-4 opacity-80" />}
/>
    </li>

    <li>
      <NavLink
        href="/portfolio"
        label="Portfolio "
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
        label="CSV"
        icon={<FileSpreadsheet className="h-4 w-4 opacity-80" />}
      />
    </li>

    <li>
      <NavLink
        href="/settings"
        label="Settings"
        icon={<SettingsIcon className="h-4 w-4 opacity-80" />}
      />
    </li>

    <li>
      <NavLink
        href="/how-to"
        label="How to Use"
        icon={<HelpCircle className="h-4 w-4 opacity-80" />}
      />
    </li>
  </ul>

        {/* Coins dropdown */}
      <div className="mt-5 md:mt-6">
          <button
            type="button"
            onClick={() => setCoinsOpen((v) => !v)}
className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-slate-200 transition-colors hover:bg-white/10 max-md:min-h-11"
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
<div id="coins-panel" className="mt-2 px-1 md:px-2">
                {/* Search input */}
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-300" />
                <input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  className={[
'w-full rounded-md pl-8 pr-2 py-2 text-base text-slate-100 placeholder:text-slate-400 md:text-sm',
    'bg-[rgb(42,43,44)]',                 // inner area color
    'border border-[rgb(64,65,66)]',      // default border color
    'focus:outline-none focus:ring-2 focus:ring-[rgb(64,65,66)] focus:border-[rgb(64,65,66)]',
    'transition-colors',
  ].join(' ')}
  placeholder="Search coins..."
/>

              </div>

              {/* Unified coins list (UI-only reordering: favourites float to the top) */}
<ul className="flex flex-col gap-1 max-h-[min(52dvh,28rem)] overflow-auto overflow-x-hidden overscroll-contain pr-1 scrollbar-auto-hide md:max-h-72">
                  {filteredCoins.map((c) => {
                  const isFav = favSet?.has?.(c.coingecko_id)
                  return (
                    <li key={c.coingecko_id} style={{ order: isFav ? -1 : 0 }}>
                      <Link
                        href={`/coins/${c.coingecko_id}`}
                        className={[
'flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors max-md:min-h-10',
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
                              className="h-4 w-4 text-amber-300/70"
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

