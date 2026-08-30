'use client'

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FileUp,
  Search,
  ShieldCheck,
  Target,
} from 'lucide-react'
import CoinLogo from '@/components/common/CoinLogo'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  market_cap_rank?: number | null
}

export type ActivePlannerSummary = {
  id: string
  coingecko_id: string
}

type Props = {
  activePlanner: ActivePlannerSummary | null
  onUseLedger: () => void
}

const inputClass = [
  'h-12 w-full rounded-lg border border-[rgb(58,59,63)] bg-[rgb(24,25,27)] px-3.5',
  'text-base text-slate-100 placeholder:text-slate-600 outline-none transition-colors',
  'focus:border-[rgb(137,128,213)] focus:ring-2 focus:ring-[rgba(137,128,213,0.16)]',
].join(' ')

function PlannerPreview({ active }: { active: boolean }) {
  const levels = [82, 66, 51, 38]
  return (
    <div className="relative overflow-hidden rounded-xl border border-[rgb(41,42,45)] bg-[rgb(24,25,27)] p-5 shadow-[0_20px_60px_-35px_rgba(0,0,0,0.9)] sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[rgba(137,128,213,0.12)] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Buy Planner</p>
            <h3 className="mt-1.5 font-display text-[19px] font-semibold text-slate-100">
              Structured entry levels
            </h3>
          </div>
          <span
            className={[
              'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
              active
                ? 'border-[rgba(116,170,98,0.35)] bg-[rgba(116,170,98,0.1)] text-[rgb(116,170,98)]'
                : 'border-[rgba(137,128,213,0.32)] bg-[rgba(137,128,213,0.08)] text-[rgb(137,128,213)]',
            ].join(' ')}
          >
            {active ? 'Active' : 'Preview'}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {['Investment amount', 'Risk profile'].map((label) => (
            <div key={label} className="rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
              <div className="mt-2 h-4 w-20 rounded bg-slate-700/45" aria-hidden="true" />
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-400">Planned buy levels</span>
            <span className="text-[10px] text-slate-500">Price decreases →</span>
          </div>
          <div className="mt-4 space-y-3">
            {levels.map((width, index) => (
              <div key={width} className="flex items-center gap-3">
                <span className="w-4 text-[10px] font-medium text-slate-600">{index + 1}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(38,39,42)]">
                  <span
                    className="block h-full rounded-full bg-[linear-gradient(90deg,rgba(137,128,213,0.45),rgba(137,128,213,0.95))]"
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="h-4 w-12 rounded bg-slate-700/35" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
          <Check className="h-3.5 w-3.5 text-[rgb(116,170,98)]" aria-hidden="true" />
          Define the plan first, then record purchases as levels execute.
        </div>
      </div>
    </div>
  )
}

export default function PlannerActivation({ activePlanner, onUseLedger }: Props) {
  const [selectingAsset, setSelectingAsset] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()
  const inputId = useId()

  const { data: coins, error, isLoading, mutate } = useSWR<Coin[]>(
    selectingAsset ? '/api/coins?limit=500&order=marketcap' : null,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error('Assets could not be loaded')
      const data = await response.json()
      if (!Array.isArray(data)) return []
      return data
        .filter((coin) => coin?.coingecko_id && coin?.symbol && coin?.name)
        .map((coin) => ({
          coingecko_id: String(coin.coingecko_id),
          symbol: String(coin.symbol),
          name: String(coin.name),
          market_cap_rank: Number.isFinite(Number(coin.market_cap_rank))
            ? Number(coin.market_cap_rank)
            : null,
        }))
    },
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 60_000 }
  )

  const filteredCoins = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase()
    const list = coins ?? []
    if (!normalized) return list.slice(0, 8)
    return list
      .filter((coin) =>
        [coin.name, coin.symbol, coin.coingecko_id]
          .some((value) => value.toLowerCase().includes(normalized))
      )
      .slice(0, 8)
  }, [coins, deferredQuery])

  useEffect(() => setActiveIndex(0), [deferredQuery])

  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: MouseEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [menuOpen])

  const selectCoin = (coin: Coin) => {
    setSelectedCoin(coin)
    setQuery(`${coin.symbol.toUpperCase()} — ${coin.name}`)
    setMenuOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMenuOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, filteredCoins.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
      return
    }
    if (event.key === 'Enter' && menuOpen && filteredCoins[activeIndex]) {
      event.preventDefault()
      selectCoin(filteredCoins[activeIndex])
      return
    }
    if (event.key === 'Escape') setMenuOpen(false)
  }

  if (selectingAsset && !activePlanner) {
    return (
      <section
        data-dashboard-activation
        aria-labelledby="planner-asset-title"
        className="mx-auto w-full max-w-[760px] rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]"
      >
        <div className="border-b border-[rgb(41,42,45)] px-5 py-5 sm:px-7">
          <button
            type="button"
            onClick={() => {
              setSelectingAsset(false)
              setMenuOpen(false)
            }}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[rgb(137,128,213)]">
            First investment plan
          </p>
          <h2 id="planner-asset-title" className="mt-2 font-display text-[25px] font-bold tracking-tight text-slate-100 sm:text-[29px]">
            Which asset do you want to plan?
          </h2>
          <p className="mt-2 text-[13px] leading-5 text-slate-400">
            Select one asset now. You can create plans for additional assets later.
          </p>
        </div>

        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div ref={fieldRef} className="relative">
            <label htmlFor={inputId} className="mb-2 block text-[12px] font-semibold text-slate-300">
              Crypto asset
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id={inputId}
                type="text"
                role="combobox"
                aria-expanded={menuOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={menuOpen && filteredCoins[activeIndex] ? `${listId}-${filteredCoins[activeIndex].coingecko_id}` : undefined}
                autoComplete="off"
                value={query}
                onFocus={() => setMenuOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedCoin(null)
                  setMenuOpen(true)
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search Bitcoin, Ethereum, Solana…"
                className={`${inputClass} pl-10 pr-10`}
              />
              <ChevronDown className={`pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </div>

            {menuOpen ? (
              <div id={listId} role="listbox" className="absolute z-30 mt-2 max-h-[286px] w-full overflow-y-auto rounded-xl border border-[rgb(58,59,63)] bg-[rgb(24,25,27)] p-1.5 shadow-2xl shadow-black/40">
                {isLoading ? (
                  <div role="status" className="px-3 py-5 text-center text-[12px] text-slate-500">Loading assets…</div>
                ) : error ? (
                  <div role="alert" className="px-3 py-4 text-center">
                    <p className="text-[12px] text-slate-400">Assets couldn&apos;t be loaded.</p>
                    <button type="button" onClick={() => void mutate()} className="mt-2 text-[12px] font-medium text-[rgb(137,128,213)]">Try again</button>
                  </div>
                ) : filteredCoins.length === 0 ? (
                  <div className="px-3 py-5 text-center text-[12px] text-slate-500">No assets match that search.</div>
                ) : (
                  filteredCoins.map((coin, index) => (
                    <button
                      id={`${listId}-${coin.coingecko_id}`}
                      key={coin.coingecko_id}
                      type="button"
                      role="option"
                      aria-selected={selectedCoin?.coingecko_id === coin.coingecko_id}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCoin(coin)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${activeIndex === index ? 'bg-[rgb(38,39,42)]' : 'hover:bg-[rgb(38,39,42)]'}`}
                    >
                      <CoinLogo symbol={coin.symbol} name={coin.name} className="h-8 w-8 shrink-0" loading="lazy" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-slate-200">{coin.name}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{coin.symbol}</span>
                      </span>
                      {coin.market_cap_rank ? <span className="text-[11px] text-slate-600">#{coin.market_cap_rank}</span> : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-lg border border-[rgb(41,42,45)] bg-[rgb(24,25,27)] px-4 py-3.5">
            <p className="text-[12px] font-medium text-slate-300">Next: set your investment amount and risk profile</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">LedgerOne will generate structured buy levels. No trade is placed or recorded when you create a plan.</p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[rgb(41,42,45)] pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setSelectingAsset(false)}
              className="min-h-11 rounded-lg border border-[rgb(58,59,63)] px-4 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            {selectedCoin ? (
              <Link
                href={`/planner?id=${encodeURIComponent(selectedCoin.coingecko_id)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[rgb(103,95,164)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.5)]"
              >
                Continue to Planner
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[rgb(58,59,63)] bg-[rgb(42,43,45)] px-5 text-[13px] font-semibold text-slate-500"
              >
                Select an asset to continue
              </button>
            )}
          </div>
        </div>
      </section>
    )
  }

  const hasActivePlanner = activePlanner != null
  const plannerHref = hasActivePlanner
    ? `/planner?id=${encodeURIComponent(activePlanner.coingecko_id)}`
    : null
  const tradeHref = hasActivePlanner
    ? `/coins/${encodeURIComponent(activePlanner.coingecko_id)}`
    : null

  return (
    <section
      data-dashboard-activation
      aria-labelledby="paid-activation-title"
      className="mx-auto w-full max-w-[1120px] overflow-hidden rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]"
    >
      <div className="grid min-h-[560px] items-center gap-10 px-6 py-10 md:grid-cols-[minmax(0,0.94fr)_minmax(360px,1.06fr)] md:px-10 lg:gap-16 lg:px-14">
        <div className="max-w-[520px]">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(137,128,213,0.34)] bg-[rgba(137,128,213,0.1)] text-[rgb(137,128,213)]">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-6 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[rgb(137,128,213)]">
            {hasActivePlanner ? 'Your strategy is ready' : 'Start with a strategy'}
          </p>
          <h2 id="paid-activation-title" className="mt-3 max-w-[490px] font-display text-[32px] font-bold leading-[1.12] tracking-tight text-slate-100 sm:text-[38px]">
            {hasActivePlanner ? 'Your investment plan is active' : 'Build your first investment plan'}
          </h2>
          <p className="mt-4 max-w-[480px] text-[15px] leading-6 text-slate-400">
            {hasActivePlanner
              ? 'Follow your planned buy levels. After you execute a purchase through your exchange, record it in LedgerOne so the ladder and portfolio update together.'
              : 'Choose an asset, investment amount, and risk profile. LedgerOne will generate structured buy levels for you to follow.'}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {hasActivePlanner && tradeHref ? (
              <Link
                href={tradeHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[rgb(103,95,164)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.5)]"
              >
                Record a completed purchase
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setSelectingAsset(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[rgb(103,95,164)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.5)]"
              >
                Create your first plan
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {hasActivePlanner && plannerHref ? (
              <Link
                href={plannerHref}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-5 text-[14px] font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-[rgb(38,39,42)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.35)]"
              >
                Continue your plan
              </Link>
            ) : (
              <button
                type="button"
                onClick={onUseLedger}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-5 text-[14px] font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-[rgb(38,39,42)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.35)]"
              >
                I already own crypto
              </button>
            )}
          </div>

          {!hasActivePlanner ? (
            <Link href="/csv#trade-import" className="mt-4 inline-flex items-center gap-2 text-[12px] font-medium text-slate-500 hover:text-slate-300">
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Import existing transaction history instead
            </Link>
          ) : null}

          <div className="mt-6 flex items-start gap-2.5 text-[12px] leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span>LedgerOne provides a plan. You execute purchases through your own exchange or broker.</span>
          </div>
        </div>

        <PlannerPreview active={hasActivePlanner} />
      </div>
    </section>
  )
}
