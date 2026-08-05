'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { usePrice } from '@/lib/dataCore'
import { useEntitlements } from '@/lib/useEntitlements'
import { useMenuTransition } from '@/lib/useMenuTransition'
import PlannerPaywallCard from '@/components/billing/PlannerPaywallCard'
import PlannerLimitBanner from '@/components/billing/PlannerLimitBanner'

import BuyPlannerInputs from '@/components/planner/BuyPlannerInputs'
import SellPlannerInputs from '@/components/planner/SellPlannerInputs'
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'
/* CHANGED: use the planner-only copy instead of the shared one */
import SellPlannerCombinedCardPlanner from '@/components/planner/SellPlannerCombinedCard.Planner'

import PlannerHighlightAgent from '@/components/planner/PlannerHighlightAgent'
import SlotPortal from '@/components/planner/SlotPortal'
import CoinLogo from '@/components/common/CoinLogo'
import { fmtCurrency } from '@/lib/format'
import './planner-skin.css'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  marketcap?: number | null
}

type BuyPlannerRow = {
  id: string
  top_price: number | null
}

type TopPriceMeta = {
  topPrice: number | null
  source?: string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

/* ─────────────────────────────────────────────────────────────
   Headless dropdown for coin selection
   Bugfixes:
   - No purple top bar
   - No horizontal scroll
   - Selected ring no longer gets covered by neighbor on hover
   - Ring not clipped left/right (uses ring-offset inside row)
────────────────────────────────────────────────────────────── */
function CoinDropdown({
  items,
  selectedId,
  onChange,
  disabled,
}: {
  items: Coin[]
  selectedId: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { mounted, shown } = useMenuTransition(open)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<number>(-1)
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(
    () => items.find(i => i.coingecko_id === selectedId),
    [items, selectedId]
  )

  const selectedLabel = selected
    ? `${selected.name} (${(selected.symbol ?? '').toUpperCase()})`
    : ''

  const deferredQuery = useDeferredValue(query)

  const searchableItems = useMemo(
    () =>
      items.map((coin) => ({
        coin,
        searchText: [coin.name, coin.symbol, coin.coingecko_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [items]
  )

  const filteredItems = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return items

    return searchableItems
      .filter(({ searchText }) => searchText.includes(q))
      .map(({ coin }) => coin)
  }, [deferredQuery, items, searchableItems])

  useEffect(() => {
    const nextIndex = filteredItems.findIndex(i => i.coingecko_id === selectedId)
    setHighlight(filteredItems.length ? Math.max(0, nextIndex) : -1)
  }, [filteredItems, selectedId, open])

  useEffect(() => {
    if (!open) return

    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (inputRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
      setIsEditing(false)
      setQuery('')
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      setIsEditing(false)
      setQuery('')
      inputRef.current?.blur()
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const displayValue = isEditing ? query : selectedLabel

  return (
    <div className="relative w-full min-w-[240px] md:min-w-[300px]">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(163,163,164)]">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M13.75 13.75L17 17"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle
              cx="8.75"
              cy="8.75"
              r="5.75"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="planner-coin-combobox-listbox"
          aria-label="Search or select a coin"
          disabled={disabled}
          value={displayValue}
          placeholder="Search or select a coin"
          onFocus={() => {
            if (disabled) return
            setOpen(true)
            setIsEditing(true)
            setQuery('')
          }}
          onClick={() => {
            if (disabled) return
            setOpen(true)
            setIsEditing(true)
            setQuery(current => current)
          }}
          onChange={e => {
            if (!open) setOpen(true)
            if (!isEditing) setIsEditing(true)
            setQuery(e.target.value)
          }}
          onKeyDown={e => {
            if (!filteredItems.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault()
              return
            }

            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (!open) setOpen(true)
              setHighlight(h => (h < filteredItems.length - 1 ? h + 1 : 0))
              return
            }

            if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (!open) setOpen(true)
              setHighlight(h => (h > 0 ? h - 1 : filteredItems.length - 1))
              return
            }

            if (e.key === 'Enter') {
              if (!open) return
              e.preventDefault()
              const idx = highlight >= 0 ? highlight : 0
              const choice = filteredItems[idx]
              if (!choice) return
              onChange(choice.coingecko_id)
              setOpen(false)
              setIsEditing(false)
              setQuery('')
              inputRef.current?.blur()
            }
          }}
          className="w-full rounded-xl bg-transparent ring-1 ring-inset ring-[rgb(41,42,45)]/70 pl-10 pr-10 py-3.5 text-[14px] md:text-[15px] text-slate-200 placeholder:text-[rgb(163,163,164)] hover:bg-[rgb(28,29,31)]/50 focus:outline-none focus:ring-[rgb(136,128,213)]/70"
        />

        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            if (disabled) return
            if (open) {
              setOpen(false)
              setIsEditing(false)
              setQuery('')
              inputRef.current?.blur()
              return
            }
            setOpen(true)
            setIsEditing(true)
            setQuery('')
            inputRef.current?.focus()
          }}
          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-300/70 hover:bg-[rgb(36,37,39)] hover:text-slate-200"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
          </svg>
        </button>
      </div>

      {mounted && (
        <div
          ref={popRef}
          id="planner-coin-combobox-listbox"
          role="listbox"
          aria-label="Coins"
          style={{ transformOrigin: 'top' }}
          className={[
            "hdr-pop absolute z-50 mt-2 w-full rounded-xl ring-1 ring-[rgb(41,42,45)] bg-[rgb(28,29,31)] shadow-xl overflow-x-hidden",
            shown ? "is-open" : "",
          ].join(" ")}
        >
          <div className="max-h-[340px] overflow-y-auto p-1.5">
            {filteredItems.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[rgb(163,163,164)]">
                No coins match your search.
              </div>
            ) : (
              filteredItems.map((c, idx) => {
                const isActive = idx === highlight
                const isSelected = c.coingecko_id === selectedId
                return (
                  <button
                    key={c.coingecko_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => {
                      onChange(c.coingecko_id)
                      setOpen(false)
                      setIsEditing(false)
                      setQuery('')
                      inputRef.current?.blur()
                    }}
                    className={
                      'hdr-pop-item relative w-full rounded-lg text-left px-3 py-2.5 text-[13px] md:text-[14px] flex items-center justify-between gap-3 overflow-hidden whitespace-nowrap ' +
                      (isActive ? 'bg-[rgb(31,32,33)] ' : 'bg-transparent ') +
                      (isSelected
                        ? 'z-10 ring-1 ring-[rgb(136,128,213)]/70 ring-offset-2 ring-offset-[rgb(28,29,31)] '
                        : 'z-0 ')
                    }
                  >
                    <span className="truncate">
                      {c.name}{' '}
                      <span className="opacity-70">
                        ({(c.symbol ?? '').toUpperCase()})
                      </span>
                    </span>
                    {isSelected && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className="opacity-80 shrink-0"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.01 7.071a1 1 0 0 1-1.424 0L3.29 8.786a1 1 0 0 1 1.419-1.41l3.06 3.082 6.298-6.35a1 1 0 0 1 1.414.006z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PlannerPage() {
  // ── Data: coins list ──────────────────────────────────────────────────────
  const { data: coins } = useSWR<Coin[]>(
    '/api/coins?limit=500&order=marketcap',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // ── Local state: selected coin id ─────────────────────────────────────────
  const [coingeckoId, setCoingeckoId] = useState<string>('')


  // ── UI state: confirm “Save New” (Buy Planner) ──────────────────────────
  const [confirmSaveNewOpen, setConfirmSaveNewOpen] = useState<boolean>(false)
  const confirmSaveCancelRef = useRef<HTMLButtonElement | null>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  const openConfirmSaveNew = () => {
    lastFocusRef.current = (document.activeElement as HTMLElement) ?? null
    setConfirmSaveNewOpen(true)
  }

  const closeConfirmSaveNew = () => {
    setConfirmSaveNewOpen(false)
    // Restore focus after modal unmounts
    setTimeout(() => {
      lastFocusRef.current?.focus?.()
    }, 0)
  }

  const confirmSaveNew = () => {
    // Preserve existing behavior: dispatch the exact same event as before
    window.dispatchEvent(
      new CustomEvent('buyplanner:action', {
        detail: { action: 'save' },
      })
    )
    closeConfirmSaveNew()
  }

  useEffect(() => {
    if (!confirmSaveNewOpen) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeConfirmSaveNew()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    setTimeout(() => confirmSaveCancelRef.current?.focus(), 0)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmSaveNewOpen])
  // ── UI state: confirm “Delete” (Buy Planner) ─────────────────────────────
  const [confirmBuyDeleteOpen, setConfirmBuyDeleteOpen] = useState<boolean>(false)
  const confirmBuyDeleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const lastFocusBuyDeleteRef = useRef<HTMLElement | null>(null)

  const openConfirmBuyDelete = () => {
    lastFocusBuyDeleteRef.current = (document.activeElement as HTMLElement) ?? null
    setConfirmBuyDeleteOpen(true)
  }

  const closeConfirmBuyDelete = () => {
    setConfirmBuyDeleteOpen(false)
    setTimeout(() => lastFocusBuyDeleteRef.current?.focus?.(), 0)
  }

  const confirmBuyDelete = () => {
    // IMPORTANT: confirmed:true prevents the native window.confirm in BuyPlannerInputs.tsx
    window.dispatchEvent(
      new CustomEvent('buyplanner:action', {
        detail: { action: 'remove', confirmed: true },
      })
    )
    closeConfirmBuyDelete()
  }

  useEffect(() => {
    if (!confirmBuyDeleteOpen) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeConfirmBuyDelete()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    setTimeout(() => confirmBuyDeleteCancelRef.current?.focus(), 0)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmBuyDeleteOpen])
  // ── URL selection + persistence ───────────────────────────────────────────
  const router = useRouter()
  const searchParams = useSearchParams()

  // Deep-link support: /planner?id=<coingecko_id> (used by Alerts tooltip)
  const requestedId = useMemo(() => {
    const raw = searchParams.get('id') ?? searchParams.get('coin') ?? ''
    return raw.trim()
  }, [searchParams])

  // Apply requestedId once per navigation, but do NOT lock the user into it afterward.
  const lastAppliedRequestedId = useRef<string>('')

  // Track explicit user selection so we only persist to URL when the user actually chose a coin.
  const userSelectedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!requestedId) return
    if (lastAppliedRequestedId.current === requestedId) return
    lastAppliedRequestedId.current = requestedId
    userSelectedRef.current = false
    setCoingeckoId(requestedId)
  }, [requestedId])

  // Persist selection into the URL so refresh keeps the same coin.
  // (No UI changes; this only updates the query string.)
  useEffect(() => {
    if (!coingeckoId) return
    if (!userSelectedRef.current) return

    const current = (searchParams.get('id') ?? '').trim()
    if (current === coingeckoId) return

    const sp = new URLSearchParams(searchParams.toString())
    sp.set('id', coingeckoId)
    sp.delete('coin')

    router.replace(`/planner?${sp.toString()}`, { scroll: false })
  }, [coingeckoId, router, searchParams])

  // Prime selection once coins load. If the URL already requests a coin,
  // keep that requested coin as the first-open selection instead of letting
  // the default top coin win on initial mount.
  useEffect(() => {
    if (requestedId) {
      if (coingeckoId !== requestedId) {
        setCoingeckoId(requestedId)
      }
      return
    }

    if (coingeckoId) return
    if (!coins || coins.length === 0) return

    setCoingeckoId(coins[0].coingecko_id)
  }, [coins, coingeckoId, requestedId])

  const selected = useMemo(
    () => coins?.find(c => c.coingecko_id === coingeckoId),
    [coins, coingeckoId]
  )


  // ── New price cycle detection (banner only; no logic changes) ─────────────
  const { user } = useUser()
const { entitlements, loading: entLoading } = useEntitlements(user?.id)
const canUsePlanners = !!user && !!entitlements?.canUsePlanners

  const { data: activeBuyPlanner } = useSWR<BuyPlannerRow | null>(
   canUsePlanners && coingeckoId
  ? ['/buy-planner/latest-banner', user!.id, coingeckoId]
  : null,

    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select('id, top_price')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        // IMPORTANT: align with existing schema (started_at, not created_at)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        // Non-fatal: if something is off with the table, just skip the banner
        // eslint-disable-next-line no-console
        console.error('Failed to load latest buy_planner for banner:', error)
        return null
      }

      return (data as BuyPlannerRow) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  )

    const { row: priceRow } = usePrice(coingeckoId || null, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  })

  const { data: topPriceMeta } = useSWR<TopPriceMeta | null>(
  canUsePlanners && coingeckoId
  ? `/api/planner/user-top-price?id=${encodeURIComponent(
      coingeckoId
    )}&currency=USD`
  : null,

    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 15_000,
    }
  )

   const showCycleBanner = useMemo(() => {
    if (!activeBuyPlanner?.top_price) return false
    if (!priceRow || typeof priceRow.price !== 'number') return false
    if (activeBuyPlanner.top_price <= 0 || priceRow.price <= 0) return false

    // If this coin is in a forced manual anchor regime, suppress "new cycle" banners.
    const source = topPriceMeta?.source
    if (source === 'admin_anchor_forced') return false

    // "New price cycle" = current price has moved above the ladder's top price
    return priceRow.price > activeBuyPlanner.top_price
  }, [activeBuyPlanner?.top_price, priceRow?.price, topPriceMeta?.source])

if (user && !entLoading && entitlements && !entitlements.canUsePlanners) {
  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-screen-2xl mx-auto">
      <PlannerPaywallCard />
    </div>
  )
}

  return (
    <div
      className="pl px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-screen-2xl mx-auto space-y-6"
      data-planner-page
      data-coingecko-id={coingeckoId || undefined}
    >
      {entitlements && entitlements.plannedAssetsLimit !== null && entitlements.plannedAssetsLimit > 0 ? (
  <div className="mb-4">
    <PlannerLimitBanner entitlements={entitlements} />
  </div>
) : null}

      {/* ───────── Page head: title + coin selector ───────── */}
      <div className="pl-head">
        <div className="min-w-0">
          <h1>Build your ladders</h1>
          <div className="sub">
            Set your inputs and review the buy &amp; sell ladders
            {selected ? ` for ${selected.name}` : ''} — recalculated in real time.
          </div>
        </div>

        {/* Right side: single searchable coin selector */}
        <div className="flex w-full md:w-auto items-center">
          <CoinDropdown
            items={coins ?? []}
            selectedId={coingeckoId}
            onChange={(id) => {
              userSelectedRef.current = true
              setCoingeckoId(id)
            }}
            disabled={!coins?.length}
          />
        </div>
      </div>

      {/* ───────── Ticker strip: coin context (display-only; uses already-fetched price) ───────── */}
      {selected ? (
        <div className="pl-ticker">
          <div className="pl-tk-id">
            <CoinLogo
              symbol={(selected.symbol ?? '').toUpperCase()}
              name={selected.name}
              className="h-12 w-12 flex-none"
            />
            <div>
              <div className="nm">{selected.name}</div>
              <div className="tk">{(selected.symbol ?? '').toUpperCase()} · USD</div>
            </div>
          </div>
          <div className="pl-tk-div" />
          <div className="pl-tk-stat">
            <span className="l">Market price</span>
            <span className="v big">
              {typeof priceRow?.price === 'number' ? fmtCurrency(priceRow.price) : '—'}
            </span>
          </div>
          <div className="pl-tk-stat">
            <span className="l">24h change</span>
            {typeof priceRow?.pct24h === 'number' ? (
              <span className={`pl-chg ${priceRow.pct24h >= 0 ? 'pos' : 'neg'}`}>
                {priceRow.pct24h >= 0 ? '+' : ''}
                {priceRow.pct24h.toFixed(2)}%
              </span>
            ) : (
              <span className="v">—</span>
            )}
          </div>
          <div className="pl-tk-spacer" />
        </div>
      ) : null}

      {/* Guard against undefined selection while coins load */}
      {!coingeckoId ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* New price cycle banner (short, points people to tooltip) */}
          {showCycleBanner && selected && (
            <div className="pl-banner !m-0 mb-4">
              <span className="dot" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <span className="font-medium text-slate-100">
                  {(selected.symbol ?? '').toUpperCase() || selected.name} new
                  price cycle detected
                </span>
                <p className="text-[13px] text-slate-300">
                  For best use of the strategy, consider updating Total Budget and clicking{' '}
                  <span className="font-medium">Save New</span> to start a
                  fresh ladder for this cycle. For the full explanation, hover
                  the info icon next to{' '}
                  <span className="font-medium">Buy Planner</span>.
                </p>
              </div>
            </div>
          )}

          {/* ───────── BUY: one seamless panel (Inputs + Ladder) ───────── */}
          <section className="pl-panel buy w-full">
            <div className="pl-rail" aria-hidden="true" />
            <div className="pl-phead">
              <div className="pl-title">
                <span className="pl-badge">Buy</span>
                <div className="tt">Buy Planner</div>
              </div>
              <div className="pl-phead-right">
                {/* Bought / Avg entry stat pills (filled by BuyPlannerLadder via portal) */}
                <div id="buy-phead-stats" className="contents" />
                <div className="relative inline-flex items-center group">
                  <button
                    type="button"
                    aria-label="How the Buy Planner & price cycles work"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(74,75,79)] bg-[rgb(40,41,44)] text-[11px] font-medium text-[rgb(177,178,182)] hover:border-[rgb(136,128,213)]/80 hover:text-slate-100 hover:bg-[rgb(50,51,55)] focus:outline-none"
                  >
                    i
                  </button>

                  {/* Right-aligned tooltip so it anchors cleanly from the far-right header */}
                  <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-[rgb(60,61,65)] bg-[rgb(28,29,31)] px-3 py-2 text-[11px] leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity duration-150 ease-out group-hover:opacity-100">
                    <p className="mb-1 font-semibold text-slate-100">How this planner works</p>

                    <p className="text-slate-300">
                      The Buy Planner is a structured accumulation plan. Choose your{' '}
                      <span className="font-medium">Risk Profile</span> (Conservative / Moderate / Aggressive),
                      then click <span className="font-medium">Generate Ladder</span> to create a repeatable set
                      of buy levels with defined allocations.
                    </p>

                    <p className="mt-2 text-slate-300">
                      As price reaches a level, that row turns <span className="font-medium">yellow</span> to
                      signal action. Execute the buy at your exchange/broker, then record it under{' '}
                      <span className="font-medium">Add Trade</span> so the ladder updates; rows turn green once
                      filled.
                    </p>

                    <p className="mt-2 text-slate-300">
                      When a new price cycle begins, generate a new Buy Planner to reset the ladder around the
                      updated market regime. Your previous sell planner remains saved as history so you can audit
                      decisions across cycles.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Controls bar (Total budget + Risk profile + Save New Plan) */}
            <BuyPlannerInputs coingeckoId={coingeckoId} />

            {/* Edit Current Plan — rendered into the controls bar next to Risk profile
                (swapped with Save New Plan, which now lives in the footer actions) */}
            <SlotPortal slotId="buy-controls-save">
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('buyplanner:action', {
                      detail: { action: 'edit' },
                    })
                  )
                }
                className="btn"
              >
                Edit Current Plan
              </button>
            </SlotPortal>

            {/* Ladder — full width */}
            <section aria-label="Buy Planner Ladder" data-buy-planner>
              <BuyPlannerLadder coingeckoId={coingeckoId} />
            </section>

            {/* Footer: meta (left) + actions (right) */}
            <div className="pl-foot">
              <div className="foot-left">
                {/* Plan meta (filled by BuyPlannerLadder via portal) */}
                <div id="buy-foot-meta" className="contents" />
              </div>

              <div className="acts">
                {/* Delete current planner (soft-deactivate) */}
                <button
                  type="button"
                  onClick={openConfirmBuyDelete}
                  className="btn btn-danger"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" />
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Delete
                </button>
                {/* Save New Plan — moved here from the controls bar (swapped with
                    Edit Current Plan); same confirmation gate (openConfirmSaveNew) */}
                <button
                  type="button"
                  onClick={() => {
                    // Only warn about preserving history when a planner actually exists.
                    // activeBuyPlanner === null means it has loaded AND there is none, so
                    // save straight away. undefined (still loading) or a row → keep the
                    // confirmation so we never overwrite an existing planner unwarned.
                    if (activeBuyPlanner === null) {
                      window.dispatchEvent(
                        new CustomEvent('buyplanner:action', { detail: { action: 'save' } })
                      )
                    } else {
                      openConfirmSaveNew()
                    }
                  }}
                  className="btn btn-primary"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Save New Plan
                </button>
              </div>
            </div>
          </section>

          {/* ───────── SELL: inputs + active/history ───────── */}
          <section className="pl-panel sell w-full">
            <div className="pl-rail" aria-hidden="true" />
            <div className="pl-phead">
              <div className="pl-title">
                <span className="pl-badge">Sell</span>
                <div className="tt">Sell Planner</div>
              </div>
              <div className="pl-phead-right">
                {/* Info tooltip – left of Active & History */}
                <div className="relative inline-flex items-center group">
                  <button
                    type="button"
                    aria-label="How the Sell Planner works"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(74,75,79)] bg-[rgb(40,41,44)] text-[11px] font-medium text-[rgb(177,178,182)] hover:border-[rgb(136,128,213)]/80 hover:text-slate-100 hover:bg-[rgb(50,51,55)] focus:outline-none cursor-default select-none"
                  >
                    i
                  </button>

                  {/* Right-anchored tooltip so it behaves correctly */}
                  <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-[rgb(60,61,65)] bg-[rgb(28,29,31)] px-3 py-2 text-[11px] leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity duration-150 ease-out group-hover:opacity-100">
                    <p className="mb-1 font-semibold text-slate-100">How this planner works</p>

                    <p className="text-slate-300">
                      The Sell Planner is a structured distribution plan. Choose{' '}
                      <span className="font-medium">Coin Volatility</span> and{' '}
                      <span className="font-medium">Sell Intensity</span>, then click{' '}
                      <span className="font-medium">Generate Ladder</span> to create a repeatable
                      scale-out ladder.
                    </p>

                    <p className="mt-2 text-slate-300">
                      When a row turns <span className="font-medium">yellow</span>, it’s time to
                      sell. Execute at your exchange/broker, then record the sell under{' '}
                      <span className="font-medium">Add Trade</span> (attach it to the correct ladder
                      row).
                    </p>
                  </div>
                </div>

                {/* Sold / If-all-hit stat pills (filled by SellPlannerLadder via portal) */}
                <div id="sell-phead-stats" className="contents" />
              </div>
            </div>

            {/* Controls bar (Active plan slot + Volatility + Intensity + Generate).
                The #sell-planner-header-right mount now lives inside this bar. */}
            <SellPlannerInputs coingeckoId={coingeckoId} />

            {/* Ladder + history — full width */}
            <section aria-label="Sell Planner Active and History" data-sell-planner>
              {/* CHANGED: use the planner-only component here */}
              <SellPlannerCombinedCardPlanner
                title=""
                ActiveView={<SellPlannerLadder coingeckoId={coingeckoId} />}
                HistoryView={
                  <SellPlannerHistory coingeckoId={coingeckoId} />
                }
                newestFirst={true}
              />
            </section>

            {/* Footer: meta (filled by SellPlannerLadder via portal) */}
            <div className="pl-foot">
              <div className="foot-left">
                <div id="sell-foot-meta" className="contents" />
              </div>
            </div>
          </section>
        </>
      )}
      {/* Confirm “Save New” (Buy Planner) */}
      {confirmSaveNewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-save-new-title"
          className="pl-modal-overlay"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close confirmation"
            onClick={closeConfirmSaveNew}
            className="absolute inset-0"
          />

          {/* Panel */}
          <div className="pl-modal z-10">
            {/* subtle info (top-right) */}
            <div className="absolute right-4 top-4 z-20">
              <span
                role="img"
                aria-label="Info"
                title="Saving a new Buy Planner locks this cycle’s Sell Planner—it's no longer live and won’t update to reflect the new Buy Planner."
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(58,59,63)] bg-[rgb(33,34,36)] text-[11px] font-semibold text-slate-200 opacity-75 hover:opacity-100 cursor-default select-none"
              >
                i
              </span>
            </div>

            <div className="pl-modal-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>

            <h2 id="confirm-save-new-title" className="pl-modal-title">
              Save new planner?
            </h2>

            <p className="pl-modal-body">
              This creates a new version for the current cycle. Your current Buy
              Planner will be preserved as history. Continue?
            </p>

            <div className="pl-modal-acts">
              <button
                ref={confirmSaveCancelRef}
                type="button"
                onClick={closeConfirmSaveNew}
                className="btn"
              >
                Cancel
              </button>

              <button type="button" onClick={confirmSaveNew} className="btn btn-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Save New Plan
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Confirm “Delete” (Buy Planner) */}
      {confirmBuyDeleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-buy-delete-title"
          className="pl-modal-overlay !z-[110]"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close delete confirmation"
            onClick={closeConfirmBuyDelete}
            className="absolute inset-0"
          />

          {/* Panel */}
          <div className="pl-modal z-10">
            <div className="pl-modal-icon danger" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" />
                <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            <h2 id="confirm-buy-delete-title" className="pl-modal-title">
              Delete Buy Planner?
            </h2>

            <p className="pl-modal-body">
              This will remove the current Buy Planner from Active and stop its
              levels and alerts for this coin. Any trades you already recorded
              under this planner will remain saved and visible in your history.
              <b className="block mt-2">This action can’t be undone.</b>
            </p>

            <div className="pl-modal-acts">
              <button
                ref={confirmBuyDeleteCancelRef}
                type="button"
                onClick={closeConfirmBuyDelete}
                className="btn"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmBuyDelete}
                className="btn btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* row highlighter; no layout impact */}
      <PlannerHighlightAgent />

      {/* Global CSS — layout shims for the planner input components */}
      <style jsx global>{`
        /* BUY — make all immediate child cards inside the Buy inputs area the same height */
        .buy-inputs-equal > div > * {
          height: 100%;
        }
        .buy-inputs-equal .card,
        .buy-inputs-equal [data-card],
        .buy-inputs-equal .Card {
          height: 100%;
        }

        /* SELL — force vertical stacking of any grid/flex layouts emitted by SellPlannerInputs */
        .sell-inputs-stack .grid {
          grid-template-columns: 1fr !important;
        }
        .sell-inputs-stack .flex {
          flex-direction: column !important;
        }
        .sell-inputs-stack .card,
        .sell-inputs-stack [data-card],
        .sell-inputs-stack .Card {
          width: 100%;
        }
      `}</style>
    </div>
  )
}
