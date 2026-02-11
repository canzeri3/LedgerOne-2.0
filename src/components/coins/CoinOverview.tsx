'use client'

import useSWR from 'swr'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import CoinLogo from '@/components/common/CoinLogo'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { useFavorites } from '@/lib/useFavorites'
import { TrendingUp, TrendingDown } from 'lucide-react'

type PriceResp = {
  price: number | null
  // Optional variants your API may return:
  change_24h?: number | null            // could be absolute USD delta OR percent
  change_24h_pct?: number | null        // percent number (e.g., -0.82 or -0.82%)
  change_24h_percent?: number | null    // alias
  price_24h?: number | null             // price 24h ago
  previous_price_24h?: number | null    // alias
  captured_at?: string | null
  provider?: string | null
  stale?: boolean
}

// New data core (/api/prices) shape
type CorePricesRow = {
  id: string
  price: number | null
  price_24h?: number | null
  pct24h?: number | null
  source?: string | null
  stale?: boolean
}

type CorePricesResp = {
  rows?: CorePricesRow[]
  updatedAt?: string
}

type HistoryPoint = { t: number; p: number }


const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

type Props = {
  id: string
  name: string
  symbol: string
}

/* ---------- helpers ---------- */

function normalizeHistory(raw: any): HistoryPoint[] {
  if (!raw) return []
  if (Array.isArray(raw?.prices)) {
    const out: HistoryPoint[] = []
    for (const row of raw.prices) {
      if (Array.isArray(row) && row.length >= 2) {
        const t = Number(row[0]); const p = Number(row[1])
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
      }
    }
    out.sort((a, b) => a.t - b.t)
    return out
  }
  if (Array.isArray(raw)) {
    const out: HistoryPoint[] = []
    for (const row of raw) {
      if (Array.isArray(row) && row.length >= 2) {
        const t = Number(row[0]); const p = Number(row[1])
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
        continue
      }
      if (row && typeof row === 'object') {
        const t = Number(row.t ?? row.time ?? row.timestamp ?? row[0])
        const p = Number(row.p ?? row.price ?? row.value ?? row.v ?? row[1])
        if (Number.isFinite(t) && Number.isFinite(p)) out.push({ t, p })
      }
    }
    out.sort((a, b) => a.t - b.t)
    return out
  }
  return []
}

function percentNumberToFraction(x: number | null | undefined): number | null {
  if (x == null) return null
  const v = Number(x)
  if (!Number.isFinite(v)) return null

  // New data core contract:
  // - pct24h/change_24h_pct is a PERCENT number (e.g. 0.21 => 0.21%)
  //   and MUST be converted to a FRACTION for fmtPct.
  //   0.21   => 0.0021  (0.21%)
  //   2.14   => 0.0214  (2.14%)
  //   -5.82  => -0.0582 (-5.82%)
  return v / 100
}


function fractionFromHistory(hist: HistoryPoint[] | null): number | null {
  if (!hist || hist.length < 2) return null
  const first = hist[0]?.p
  const last = hist[hist.length - 1]?.p
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null
  return last / first - 1
}

// Priority:
// 1) explicit percent fields
// 2) previous price
// 3) history (authoritative)
// 4) interpret change_24h safely (fraction | percent number | USD delta)
function derive24hFraction(priceData: PriceResp | undefined, hist: HistoryPoint[] | null): number | null {
  if (priceData) {
    const price = Number(priceData.price)
    const pctField = percentNumberToFraction(priceData.change_24h_pct ?? priceData.change_24h_percent)
    if (pctField != null) return pctField

    const prevPrice = Number(priceData.price_24h ?? priceData.previous_price_24h)
    if (Number.isFinite(price) && Number.isFinite(prevPrice) && prevPrice > 0) {
      return price / prevPrice - 1
    }
  }

  const fromHist = fractionFromHistory(hist)
  if (fromHist != null) return fromHist

  if (priceData) {
    const price = Number(priceData.price)
    const raw = Number(priceData.change_24h)
    if (Number.isFinite(raw)) {
      if (Math.abs(raw) <= 1) return raw            // fraction already
      if (Math.abs(raw) <= 20) return raw / 100     // percent number
      if (Number.isFinite(price) && price - raw !== 0) {
        return raw / (price - raw)                  // USD delta
      }
    }
  }
  return null
}

/* ---------- star icons (hollow/filled) ---------- */

function StarHollow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 17.27 18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.45 13.97 5.82 21 12 17.27" />
    </svg>
  )
}

function StarFilled({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 17.27 18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.45 13.97 5.82 21 12 17.27" />
    </svg>
  )
}

/* ---------- coin logo: uses shared CoinLogo (local SVG first → remote fallback) ---------- */

export default function CoinOverview({ id, name, symbol }: Props) {
  // Favorites (optimistic)
const { list: favorites, toggle, isLoading: favLoading } = useFavorites()
  const isFavFromStore = useMemo(
    () => !!favorites?.some((f: any) => f?.coingecko_id === id || f?.id === id || f?.slug === id),
    [favorites, id]
  )
  const [isFav, setIsFav] = useState<boolean>(isFavFromStore)
  useEffect(() => setIsFav(isFavFromStore), [isFavFromStore])
  const onToggleFav = async () => {
    if (favLoading) return
    setIsFav(prev => !prev)
    try { await toggle(id) } catch { setIsFav(prev => !prev) }
  }

    // Coin note (UI-only): stored locally per coin so users can tag exchange/notes
  const noteKey = useMemo(() => `lg1:coin_note:${id}`, [id])

  // NOTE: Do not use a React state setter for this field.
  // In this repo, the setter identifier is being resolved as "void" during typecheck.
  // Use refs + localStorage instead (same behavior, no UI/business logic changes).
  const noteInputRef = useRef<HTMLInputElement | null>(null)
  const noteDraftRef = useRef<string>('')

  const readNote = () => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(noteKey) ?? ''
  }

  useEffect(() => {
    const v = readNote()
    noteDraftRef.current = v
    if (noteInputRef.current) noteInputRef.current.value = v
  }, [noteKey])

  const commitNote = () => {
    if (typeof window === 'undefined') return
    const v = (noteDraftRef.current ?? '').trim()
    if (!v) window.localStorage.removeItem(noteKey)
    else window.localStorage.setItem(noteKey, v)

    // keep the input visually in sync with trimmed value
    noteDraftRef.current = v
    if (noteInputRef.current) noteInputRef.current.value = v
  }


  // Live price (NEW data core)
  const { data: pricesRaw } = useSWR<CorePricesResp>(
    `/api/prices?ids=${encodeURIComponent(id)}&currency=USD`,
    fetcher,
    {
      refreshInterval: 15_000,          // poll faster, but lightweight
      revalidateOnFocus: true,
      revalidateIfStale: true,
      keepPreviousData: true,
      errorRetryCount: 4,                // ~20s of quick retries if a blip happens
      errorRetryInterval: 5_000,
    }
  )

  const priceData = useMemo<PriceResp | undefined>(() => {
    const row = pricesRaw?.rows?.find((r) => r?.id === id) ?? pricesRaw?.rows?.[0]
    if (!row) return undefined
    return {
      price: row.price ?? null,
      change_24h_pct: row.pct24h ?? null,   // percent number (converted to fraction downstream)
      price_24h: row.price_24h ?? null,
      captured_at: pricesRaw?.updatedAt ?? null,
      provider: row.source ?? 'consensus',
      stale: !!row.stale,
    }
  }, [pricesRaw, id])

    const price = priceData?.price ?? null

  // 24h history (NEW data core)
  const { data: histRaw } = useSWR<any>(
    `/api/price-history?id=${encodeURIComponent(id)}&days=1&interval=hourly&currency=USD`,
    fetcher,
    { refreshInterval: 300_000 }
  )
  const hist = useMemo(() => normalizeHistory(histRaw?.points ?? histRaw), [histRaw])

  // Final 24h percent (fraction)
  const pctFrac = useMemo(() => derive24hFraction(priceData, hist), [priceData, hist])
  const pctPositive = pctFrac != null && pctFrac >= 0
  const pctClasses =
    pctFrac == null
      ? 'bg-slate-500/10 text-slate-300 ring-1 ring-inset ring-slate-500/20'
      : pctPositive
        ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20'
        : 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20'

  return (
    <div className="mb-4">
      {/* Title row */}
      <div className="flex items-end justify-between gap-3">
        {/* Left: name */}
        <div className="flex items-center gap-3 pl-3 md:pl-6">
          {/* HD coin logo (UI-only) with robust fallbacks + HiDPI */}
          <CoinLogo symbol={symbol} name={name} />
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
            <span className="block">
              {name}
              <span className="ml-2 align-middle text-sm uppercase text-slate-400">
                {symbol}
              </span>
            </span>

                           <input
              ref={noteInputRef}
              defaultValue=""
              onChange={(e) => {
                noteDraftRef.current = e.currentTarget.value
              }}
              onBlur={() => commitNote()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  if (typeof window !== 'undefined') {
                    const v = window.localStorage.getItem(noteKey) ?? ''
                    noteDraftRef.current = v
                    e.currentTarget.value = v
                  }
                  (e.currentTarget as HTMLInputElement).blur()
                }
              }}
              placeholder="(Exchange)"
              aria-label="(Exchange)"
              className="mt-0.5 block h-4 w-[160px] max-w-[52vw] bg-transparent px-0 text-[11px] font-normal text-slate-400 placeholder:text-slate-600 focus:outline-none"
            />

          </h1>

        </div>

        {/* Right: star + price + % change */}
        <div className="flex items-baseline gap-0.5 pr-3 md:pr-6">
      



          <button
            type="button"
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFav}
            onClick={onToggleFav}
            disabled={favLoading}
            className="inline-flex h-8 w-8 items-center justify-center transition"
          >
            {isFav ? (
              <StarFilled className="h-5 w-5 text-yellow-400" />
            ) : (
              <StarHollow className="h-5 w-5 text-slate-400" />
            )}
          </button>


          <div className="tabular-nums text-xl md:text-2xl font-semibold">
            {price != null ? (
              fmtCurrency(price)
            ) : (
              <span className="inline-block h-6 w-24 animate-pulse rounded bg-slate-600/30" />
            )}
          </div>

                   <span
            className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pctClasses}`}
            aria-live="polite"
          >

            {pctFrac == null ? (
              '—'
            ) : pctPositive ? (
              <>
                <TrendingUp className="h-3.5 w-3.5" />
                {'+' + fmtPct(pctFrac)}
              </>
            ) : (
              <>
                <TrendingDown className="h-3.5 w-3.5" />
                {fmtPct(pctFrac)}
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
