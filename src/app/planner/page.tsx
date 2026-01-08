'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { usePrice } from '@/lib/dataCore'

import BuyPlannerInputs from '@/components/planner/BuyPlannerInputs'
import SellPlannerInputs from '@/components/planner/SellPlannerInputs'
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'
/* CHANGED: use the planner-only copy instead of the shared one */
import SellPlannerCombinedCardPlanner from '@/components/planner/SellPlannerCombinedCard.Planner'

import Card from '@/components/ui/Card'
import PlannerHighlightAgent from '@/components/planner/PlannerHighlightAgent'

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
  const [highlight, setHighlight] = useState<number>(-1)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(
    () => items.find(i => i.coingecko_id === selectedId),
    [items, selectedId]
  )

  // Reset highlight when list or open state changes
  useEffect(() => {
    setHighlight(
      items.length
        ? Math.max(0, items.findIndex(i => i.coingecko_id === selectedId))
        : -1
    )
  }, [items, selectedId, open])

  // Close on click outside / Esc
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Keyboard nav when open
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (!items.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight(h => (h < items.length - 1 ? h + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight(h => (h > 0 ? h - 1 : items.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const idx = highlight >= 0 ? highlight : 0
        const choice = items[idx]
        if (choice) {
          onChange(choice.coingecko_id)
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, items, highlight, onChange])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full min-w-[240px] md:min-w-[260px] rounded-xl bg-transparent ring-1 ring-inset ring-[rgb(41,42,45)]/70 px-3 py-2 text-[14px] md:text-[15px] text-slate-200 hover:bg-[rgb(28,29,31)]/50 focus:outline-none focus:ring-[rgb(136,128,213)]/70 flex items-center justify-between gap-3"
      >
        <span className="truncate">
          {selected
            ? `${selected.name} (${(selected.symbol ?? '').toUpperCase()})`
            : 'Select a coin'}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="opacity-70"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
        </svg>
      </button>

      {open && (
        <div
          ref={popRef}
          role="listbox"
          aria-label="Coins"
          className="absolute z-50 mt-2 w-full rounded-xl ring-1 ring-[rgb(41,42,45)] bg-[rgb(28,29,31)] shadow-xl overflow-x-hidden"
        >
          <div className="max-h-[340px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[rgb(163,163,164)]">
                No results
              </div>
            ) : (
              items.map((c, idx) => {
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
                    }}
                    className={
                      'relative w-full text-left px-3 py-2.5 text-[13px] md:text-[14px] flex items-center justify-between overflow-hidden whitespace-nowrap truncate ' +
                      (isActive ? 'bg-[rgb(31,32,33)] ' : 'bg-transparent ') +
                      (isSelected
                        ? 'z-10 ring-1 ring-[rgb(136,128,213)]/70 ring-offset-2 ring-offset-[rgb(28,29,31)] rounded-lg '
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
    '/api/coins?limit=50&order=marketcap',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // ── Local state: selected coin id ─────────────────────────────────────────
  const [coingeckoId, setCoingeckoId] = useState<string>('')

  // ── Local state: inline search query for filtering the selector ───────────
  const [coinQuery, setCoinQuery] = useState<string>('')

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

  // Prime selection once coins load (prefer deep-link if present)
  useEffect(() => {
    if (coingeckoId) return
    if (!coins || coins.length === 0) return

    const fromQuery = requestedId
      ? coins.find(c => c.coingecko_id === requestedId)
      : null

    setCoingeckoId(fromQuery?.coingecko_id ?? coins[0].coingecko_id)
  }, [coins, coingeckoId, requestedId])

  const selected = useMemo(
    () => coins?.find(c => c.coingecko_id === coingeckoId),
    [coins, coingeckoId]
  )

  // Filtered list used by the dropdown based on search query (name or symbol)
  const filteredCoins = useMemo(() => {
    const list = coins ?? []
    const q = coinQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(c => {
      const name = c.name?.toLowerCase() ?? ''
      const sym = c.symbol?.toLowerCase() ?? ''
      return name.includes(q) || sym.includes(q)
    })
  }, [coins, coinQuery])

  // Keep selection sane if list changes due to filtering
  useEffect(() => {
    if (!coingeckoId && filteredCoins.length > 0) {
      setCoingeckoId(filteredCoins[0].coingecko_id)
    }
  }, [filteredCoins, coingeckoId])

  // ── New price cycle detection (banner only; no logic changes) ─────────────
  const { user } = useUser()

  const { data: activeBuyPlanner } = useSWR<BuyPlannerRow | null>(
    user && coingeckoId
      ? ['/buy-planner/latest-banner', user.id, coingeckoId]
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
    coingeckoId
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


  return (
    <div
      className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-screen-2xl mx-auto space-y-10"
      data-coingecko-id={coingeckoId || undefined}
    >
      {/* ───────── Integrated header / coin selector (no Card wrapper) ───────── */}
      <div className="space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[rgb(41,42,45)]/80 pb-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[20px] md:text-[22px] font-semibold text-white/90 leading-tight">
                Buy / Sell Planner
              </h1>
              {selected ? (
                <span className="text-[13px] md:text-[14px] text-[rgb(163,163,164)] truncate">
                  {(selected.symbol ?? '').toUpperCase()} · {selected.name}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[13px] md:text-[14px] text-[rgb(163,163,164)]">
              Pick a coin, then configure inputs and review ladders in a clean,
              unified view.
            </p>
          </div>

          {/* Right side: Search + new integrated dropdown */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Inline search input (filters the dropdown list) */}
            <div className="hidden sm:block">
              <input
                type="text"
                inputMode="search"
                placeholder="Coin Ticker…"
                value={coinQuery}
                onChange={e => setCoinQuery(e.target.value)}
                className="rounded-xl bg-transparent ring-1 ring-inset ring-[rgb(41,42,45)]/70 px-3 py-2 text-[13px] md:text-[14px] text-slate-200 placeholder:text-[rgb(163,163,164)] hover:bg-[rgb(28,29,31)]/50 focus:outline-none focus:ring-[rgb(136,128,213)]/70 min-w-[180px]"
                aria-label="Search coins by name or symbol"
              />
            </div>

            <label className="text-slate-300 text-[13px] md:text-[14px]">
              Coin
            </label>

            {/* Connected, professional dropdown */}
               <CoinDropdown
              items={filteredCoins}
              selectedId={coingeckoId}
              onChange={(id) => {
                userSelectedRef.current = true
                setCoingeckoId(id)
              }}
              disabled={!coins?.length}
            />

          </div>
        </div>

        <div className="text-[13px] md:text-[14px] text-slate-400">
          {selected ? `${selected.name} selected` : 'Loading coins…'}
        </div>
      </div>

      {/* Guard against undefined selection while coins load */}
      {!coingeckoId ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* New price cycle banner (short, points people to tooltip) */}
          {showCycleBanner && selected && (
            <div className="mb-4 rounded-lg border border-[rgb(60,61,65)] bg-[rgb(32,33,36)] px-4 py-3 text-sm text-slate-200">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-2 w-2 rounded-full bg-[rgb(136,128,213)]"
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    {(selected.symbol ?? '').toUpperCase() || selected.name} new
                    price cycle detected
                  </span>
                </div>
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

          {/* ───────── BUY: one seamless card (Inputs + Ladder) ───────── */}
                    {/* ───────── BUY: one seamless card (Inputs + Ladder) ───────── */}
          <Card
            title={
              (
                <div className="flex items-center gap-2">
                  <span>Buy Planner</span>
                  {/* Info tooltip – keeps page clean but explanation always available */}
                  <div className="relative inline-flex items-center group">
                    <button
                      type="button"
                      aria-label="How the Buy Planner & price cycles work"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(74,75,79)] bg-[rgb(40,41,44)] text-[11px] font-medium text-[rgb(177,178,182)] hover:border-[rgb(136,128,213)]/80 hover:text-slate-100 hover:bg-[rgb(50,51,55)] focus:outline-none"
                    >
                      i
                    </button>
                    <div className="pointer-events-none absolute left-6 top-1/2 z-50 w-72 -translate-y-1/2 rounded-md border border-[rgb(60,61,65)] bg-[rgb(28,29,31)] px-3 py-2 text-[11px] leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity transition-transform duration-150 ease-out group-hover:opacity-100 group-hover:translate-y-0">
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
              ) as any
            }

            className="w-full bg-none bg-[rgb(28,29,31)] border-0 rounded-md"
            headerBorderClassName="border-[rgb(41,42,45)]"
            noHoverLift
            noShadow
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-6 md:gap-y-8 gap-x-6 md:gap-x-8">
              {/* Left: Inputs */}
              <section
                aria-label="Buy Planner Inputs"
                className="md:col-span-4 lg:col-span-3 space-y-4 buy-inputs-equal"
              >
                <div className="text-xs text-slate-400 md:hidden">Inputs</div>
                <div
                  className={`
                    grid grid-cols-1 gap-4
                    [&>*>.card]:h-full
                    [&>*>[data-card]]:h-full
                    [&>*>.Card]:h-full
                    [&_*]:[contain:layout_style_paint]
                  `}
                >
                  <BuyPlannerInputs coingeckoId={coingeckoId} />
                </div>
              </section>

              {/* Right: Ladder */}
              <section
                aria-label="Buy Planner Ladder"
                className="md:col-span-8 lg:col-span-9 space-y-4"
                data-buy-planner
              >
                <div className="text-xs text-slate-400 md:hidden">Ladder</div>
                <div className="p-2 rounded-md border border-[rgb(58,59,63)] bg-[rgb(41,42,45)]">
                  <BuyPlannerLadder coingeckoId={coingeckoId} />
                </div>
              </section>
            </div>

                        {/* Footer: ACTIONS — Remove on the left, Edit/Save on the right */}
          <div className="mt-3 flex items-center justify-between">
            {/* Delete current planner (soft-deactivate) on the left side */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('buyplanner:action', {
                    detail: { action: 'remove' },
                  })
                )
              }
              className="planner-delete-btn"
            >
              <span className="button__text">Delete</span>
              <span className="button__icon" aria-hidden="true">
                <svg className="svg" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 6h18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M10 11v6M14 11v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>

            {/* Edit + Save New grouped on the right */}
            <div className="flex gap-3">
              {/* Edit current planner (top/budget/growth) */}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('buyplanner:action', {
                      detail: { action: 'edit' },
                    })
                  )
                }
                className="rounded px-4 py-2 text-sm font-medium bg-[rgb(41,42,45)] border border-[rgb(58,59,63)] text-slate-200 hover:bg-[rgb(45,46,49)]"
              >
                Edit Planner
              </button>

              {/* Save New — Uiverse.io sphere button */}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('buyplanner:action', {
                      detail: { action: 'save' },
                    })
                  )
                }
                className="button"
              >
                <span className="button-content">Save New</span>
              </button>
            </div>
          </div>




          </Card>

          {/* ───────── SELL: inputs + active/history ───────── */}
          <Card
title={
  (
    <div className="flex items-center gap-2">
      <span>Sell Planner</span>

      {/* Info tooltip – same UI as Buy Planner */}
      <div className="relative inline-flex items-center group">
        <button
          type="button"
          aria-label="How the Sell Planner works"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(74,75,79)] bg-[rgb(40,41,44)] text-[11px] font-medium text-[rgb(177,178,182)] hover:border-[rgb(136,128,213)]/80 hover:text-slate-100 hover:bg-[rgb(50,51,55)] focus:outline-none"
        >
          i
        </button>

        <div className="pointer-events-none absolute left-6 top-1/2 z-50 w-72 -translate-y-1/2 rounded-md border border-[rgb(60,61,65)] bg-[rgb(28,29,31)] px-3 py-2 text-[11px] leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity transition-transform duration-150 ease-out group-hover:opacity-100 group-hover:translate-y-0">
          <p className="mb-1 font-semibold text-slate-100">How this planner works</p>

          <p className="text-slate-300">
            The Sell Planner is a structured distribution plan. Choose{' '}
            <span className="font-medium">Coin Volatility</span> and{' '}
            <span className="font-medium">Sell Intensity</span>, then click{' '}
            <span className="font-medium">Generate Ladder</span> to create a
            repeatable scale-out ladder.
          </p>

          <p className="mt-2 text-slate-300">
            When a row turns <span className="font-medium">yellow</span>, it’s time to sell.
            Execute at your exchange/broker, then record the sell under{' '}
            <span className="font-medium">Add Trade</span> (attach it to the correct Sell
            Planner) so progress updates; rows turn green once filled.
          </p>

          <p className="mt-2 text-slate-300">
            When you generate a new Buy Planner for a new price cycle, the current Sell
            Planner is preserved as history and a new Sell Planner version is created for
            the new cycle.
          </p>
        </div>
      </div>
    </div>
  ) as any
}
            className="w-full bg-none bg-[rgb(28,29,31)] border-0 rounded-md"
            headerBorderClassName="border-[rgb(41,42,45)]"
            headerRight={
              <div
                id="sell-planner-header-right"
                className="flex items-center gap-2"
              />
            }
            noHoverLift
            noShadow
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-6 md:gap-y-8 gap-x-6 md:gap-x-8">
              <section
                aria-label="Sell Planner Inputs"
                className="md:col-span-4 lg:col-span-3 space-y-4 sell-inputs-stack"
              >
                <div className="text-xs text-slate-400 md:hidden">Inputs</div>
                <div
                  className={`
                    flex flex-col gap-4
                    [&_*]:w-full
                    [&_.grid]:!grid-cols-1
                    [&_.flex]:!flex-col
                    [&_.card]:w-full
                    [&_[data-card]]:w-full
                  `}
                >
                  <SellPlannerInputs coingeckoId={coingeckoId} />
                </div>
              </section>

              <section
                aria-label="Sell Planner Active and History"
                className="md:col-span-8 lg:col-span-9 space-y-4"
                data-sell-planner
              >
                <div className="text-xs text-slate-400 md:hidden">
                  Active &amp; History
                </div>
                <div className="p-0">
                  {/* CHANGED: use the planner-only component here */}
                  <SellPlannerCombinedCardPlanner
                    title="Active & History"
                    ActiveView={<SellPlannerLadder coingeckoId={coingeckoId} />}
                    HistoryView={
                      <SellPlannerHistory coingeckoId={coingeckoId} />
                    }
                    newestFirst={true}
                  />
                </div>
              </section>
            </div>
          </Card>
        </>
      )}

      {/* row highlighter; no layout impact */}
      <PlannerHighlightAgent />

      {/* Global CSS — includes Uiverse.io Save New button styles */}
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

        /* From Uiverse.io by Madflows — Save New button */
        .button {
          position: relative;
          overflow: hidden;
          height: 2.5rem;
          padding: 0 2rem;
          border-radius: 0.25rem;
          background: #39364fff;
          background-size: 400%;
          color: #fff;
          font-size: 0.875rem;
          line-height: 1.25rem;
          font-weight: 500;
          border: 1px solid rgb(58, 59, 63);
          cursor: pointer;
        }
        .button:hover::before {
          transform: scaleX(1);
        }
        .button-content {
          position: relative;
          z-index: 1;
        }
        .button::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          transform: scaleX(0);
          transform-origin: 0 50%;
          width: 100%;
          height: inherit;
          border-radius: inherit;
          background: linear-gradient(
            82.3deg,
            rgba(109, 93, 186) 10.8%,
            rgba(109, 93, 186) 94.3%
          );
          transition: all 0.4s;
        }
                      /* Planner Delete button — identical style to Sell planner delete */
        .planner-delete-btn {
          position: relative;
          border-radius: 6px;
          width: 95px;
          height: 28px;
          cursor: pointer;
          display: flex;
          align-items: center;
          border: 1px solid rgb(105, 40, 40);
          background-color: rgba(41, 42, 45, 1);
          overflow: hidden;
        }

        .planner-delete-btn,
        .planner-delete-btn .button__icon,
        .planner-delete-btn .button__text {
          transition: all 0.3s;
        }

        .planner-delete-btn .button__text {
          transform: translateX(22px);
          color: #fff;
          font-weight: 600;
          font-size: 10px;
          line-height: 1;
        }

        .planner-delete-btn .button__icon {
          position: absolute;
          transform: translateX(68px);
          height: 100%;
          width: 27px;
          background-color: rgb(105, 40, 40);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }

        .planner-delete-btn .svg {
          width: 16px;
          height: 16px;
        }

        .planner-delete-btn:hover {
          background: rgb(115, 45, 45);
        }

        .planner-delete-btn:hover .button__text {
          color: transparent;
        }

        .planner-delete-btn:hover .button__icon {
          width: 94px;
          transform: translateX(0);
        }

        .planner-delete-btn:active .button__icon {
          background-color: rgb(95, 35, 35);
        }

        .planner-delete-btn:active {
          border: 1px solid rgb(95, 35, 35);
        }


      `}</style>
    </div>
  )
}
