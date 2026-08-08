'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Search, X } from 'lucide-react'
import CoinLogo from '@/components/common/CoinLogo'
import { useMenuTransition } from '@/lib/useMenuTransition'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  market_cap_rank?: number | null
}

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Phone coin picker that pops out of the bottom tab bar's Coins tab.
 *
 * Shares the tab bar's glass treatment. Uses the same SWR key as the sidebar's
 * coin list, so opening it costs no extra request.
 */
export default function CoinPickerSheet({ open, onClose }: Props) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { mounted, shown } = useMenuTransition(open)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const { data: coins } = useSWR<Coin[]>(
    open ? '/api/coins?limit=500&order=marketcap' : null,
    async (url: string) => {
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      return (await r.json()) ?? []
    },
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 60_000 }
  )

  const list = useMemo(() => coins ?? [], [coins])

  const searchable = useMemo(
    () =>
      list.map((coin) => ({
        coin,
        searchText: [coin.symbol, coin.name, coin.coingecko_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [list]
  )

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return list
    return searchable.filter(({ searchText }) => searchText.includes(q)).map(({ coin }) => coin)
  }, [deferredQuery, searchable, list])

  // Reset the query each time it opens so it never reopens pre-filtered.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  // Escape to dismiss, and lock the page behind the sheet while it's up.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className="l1-coinsheet-root md:hidden" role="presentation">
      <div
        className={['l1-coinsheet-backdrop', shown ? 'is-open' : ''].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={['l1-coinsheet', shown ? 'is-open' : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label="Select a coin"
      >
        <div className="l1-coinsheet-head">
          <Search className="l1-coinsheet-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search coins…"
            aria-label="Search coins"
          />
          <button type="button" onClick={onClose} aria-label="Close coin picker">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="l1-coinsheet-list">
          {filtered.length === 0 ? (
            <p className="l1-coinsheet-empty">
              {coins ? 'No coins match that search.' : 'Loading coins…'}
            </p>
          ) : (
            filtered.map((c, i) => {
              const href = `/coins/${c.coingecko_id}`
              const active = pathname === href
              return (
                <Link
                  key={c.coingecko_id}
                  href={href}
                  onClick={(event) => {
                    // Closing the animated sheet during Next's own Link click
                    // can interrupt the client-side navigation on mobile. Own
                    // the plain-tap navigation so the selected coin id is the
                    // route that commits; preserve modified clicks as links.
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return
                    }

                    event.preventDefault()
                    router.push(href)
                    onClose()
                  }}
                  className={active ? 'is-active' : undefined}
                  aria-current={active ? 'page' : undefined}
                  // Drives the staggered entrance. Capped so rows far down the
                  // list aren't still waiting to appear when you scroll to them.
                  style={{ ['--i' as string]: Math.min(i, 10) }}
                >
                  <CoinLogo
                    symbol={c.symbol || c.coingecko_id}
                    name={c.name}
                    className="h-7 w-7 flex-none"
                  />
                  <span className="tk">{(c.symbol || c.coingecko_id).toUpperCase()}</span>
                  <span className="nm">{c.name}</span>
                  {c.market_cap_rank ? <span className="rk">#{c.market_cap_rank}</span> : null}
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
