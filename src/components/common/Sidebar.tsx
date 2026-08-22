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
  HelpCircle,
  Settings as SettingsIcon,
} from 'lucide-react'


import { useFavorites } from '@/lib/useFavorites'
import { useMenuTransition } from '@/lib/useMenuTransition'

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
'flex items-center gap-3 rounded-lg px-3.5 py-2.5 min-h-11 text-[17px] transition-colors',
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
const LOGO_SHIFT_Y_PX = 4 // positive = move image DOWN, negative = move UP (borders/slot unchanged)




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
  const { mounted: coinsMounted, shown: coinsShown } = useMenuTransition(coinsOpen)
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
      {/* Brand logo. The desktop crop is intentionally preserved; mobile uses
          the full drawer width without the desktop zoom/negative offset. */}
      <div className="w-full border-b border-[rgb(41,42,45)] px-3 pb-3 pt-3 md:-ml-4 md:w-[calc(100%+16px)] md:px-0 md:pb-4 md:pt-4 md:pr-1">
        <div className="relative h-14 w-full overflow-hidden md:hidden">
          <Image
            src="/lg1-logo.png"
            alt="LedgerOne · portfolio planner"
            fill
            priority
            sizes="86vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'center center',
            }}
          />
        </div>

        <div className="relative hidden h-14 w-full overflow-hidden md:block">
          <Image
            src="/lg1-logo.png"
            alt="LedgerOne · portfolio planner"
            fill
            priority
            sizes="(min-width: 1024px) 16vw, 25vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'left center',
              transform: `scale(${LOGO_SCALE}) translate(${LOGO_SHIFT_PX / LOGO_SCALE}px, ${LOGO_SHIFT_Y_PX / LOGO_SCALE}px)`,
              transformOrigin: 'left center',
            }}
          />
        </div>
      </div>




            <nav className="px-2 py-2 md:py-3">
  {/* Primary nav with icons on the left */}
  <ul className="space-y-1.5">
    <li>
      <NavLink
        href="/dashboard"
        label="Dashboard"
        icon={<LayoutDashboard className="h-4 w-4 opacity-80" />}
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
  href={plannerHref}
  label="Planner"
  icon={<Target className="h-4 w-4 opacity-80" />}
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
      <div className="mt-4 border-t border-[rgb(41,42,45)] pt-4 md:pt-5">
          {/* Header row: Coins toggle + inline search */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCoinsOpen((v) => !v)}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] max-md:min-h-11"
              aria-expanded={coinsOpen}
              aria-controls="coins-panel"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                Coins
              </span>
              <ChevronRight
                className={`h-3.5 w-3.5 text-slate-500 transition-transform ${coinsOpen ? 'rotate-90' : ''}`}
              />
            </button>

            {/* Inline search input (shrunk to fit next to the Coins card) */}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setCoinsOpen(true)}
                aria-label="Search coins"
                autoComplete="off"
                className={[
                  'w-full rounded-md pl-7 pr-2 py-1 text-base text-slate-200 placeholder:text-slate-500 md:text-[13px]',
                  'bg-[rgb(32,33,35)]',                 // subtle fill that blends with the sidebar
                  'border border-[rgb(41,42,45)]',      // faint border
                  'focus:outline-none focus:border-[rgb(58,59,63)]', // subtle focus, no bright ring
                  'transition-colors',
                ].join(' ')}
                placeholder="Search coins…"
              />
            </div>
          </div>

          {coinsMounted && (
<div
  id="coins-panel"
  style={{ transformOrigin: 'top' }}
  className={`hdr-pop mt-2 px-1 md:px-2${coinsShown ? ' is-open' : ''}`}
>
              {/* Unified coins list (UI-only reordering: favourites float to the top) */}
<ul className="flex flex-col gap-1 max-h-[min(52dvh,28rem)] overflow-auto overflow-x-hidden overscroll-contain pr-1 scrollbar-auto-hide md:max-h-72">
                  {filteredCoins.map((c) => {
                  const isFav = favSet?.has?.(c.coingecko_id)
                  return (
                    <li key={c.coingecko_id} className="hdr-pop-item" style={{ order: isFav ? -1 : 0 }}>
                      <Link
                        href={`/coins/${c.coingecko_id}`}
                        className={[
'grid grid-cols-[3.25rem_minmax(0,1fr)_auto_1rem] items-center gap-2 rounded-md px-2 py-2 text-[16px] transition-colors max-md:min-h-10',
                          'hover:bg-white/10', // stronger hover
                          pathname === `/coins/${c.coingecko_id}`
                          ? 'bg-white/15 !text-[rgb(252,252,252)]'
                          : 'text-slate-200',

                        ].join(' ')}
                      >
                        {/* Ticker column (fixed width so names align) */}
                        <span className="font-semibold">
                          {c.symbol?.toUpperCase() ?? c.coingecko_id}
                        </span>

                        {/* Name column */}
                        <span className="text-slate-400 truncate">{c.name}</span>

                        {/* Rank column */}
                        <span className="text-right text-[11px] tabular-nums text-slate-500">
                          {typeof c.market_cap_rank === 'number' ? `#${c.market_cap_rank}` : ''}
                        </span>

                        {/* Star column (only on favourited coins; slot reserved for alignment) */}
                        <span className="flex justify-end">
                          {isFav && (
                            <Star
                              className="h-4 w-4 text-amber-300/70"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                })}
                {filteredCoins.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-slate-400">No coins match that search.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </nav>

    
    </div>
  )
}
