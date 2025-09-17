'use client'

import useSWR from 'swr'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { useFavorites } from '@/lib/useFavorites'
import { Star, TrendingUp, TrendingDown } from 'lucide-react'
import React from 'react'

type PriceResp = {
  price: number | null
  // NOTE: Backends vary. This may be:
  //  - fractional change (e.g., 0.025 = +2.5%)
  //  - percent as a number (e.g., 2.5 = +2.5%)
  //  - absolute price delta (e.g., 1540.82 = +$1540.82)
  change_24h: number | null
  captured_at: string | null
  provider: string | null
  stale: boolean
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Props = {
  id: string
  name: string
  symbol: string
}

/** Normalize a possibly-misinterpreted "change_24h" into a FRACTION (0.0245 = +2.45%).
 * Heuristics:
 *  - |x| <= 1       -> treat as fraction already
 *  - 1 < |x| <= 20  -> treat as percent value (x/100)
 *  - otherwise      -> treat as absolute price delta; percent = delta / (price - delta)
 * This covers common API variations and fixes the “+1,540.82%” bug.
 */
function normalizeChangeToFraction(raw: number | null | undefined, price: number | null | undefined) {
  if (raw == null) return null
  const x = Number(raw)
  const ax = Math.abs(x)

  if (ax <= 1) return x // already fraction
  if (ax <= 20) return x / 100 // percent number -> fraction

  if (price != null) {
    const prev = price - x // if x was absolute delta
    if (prev !== 0) return x / prev
  }
  // Fallback: assume percent number
  return x / 100
}

export default function CoinOverview({ id, name, symbol }: Props) {
  // Favorites (star) toggle
  const { favorites, toggle, isLoading: favLoading } = useFavorites()
  const isFav = !!favorites?.some(f => f.coingecko_id === id)

  // Live price + 24h change
  const { data } = useSWR<PriceResp>(`/api/price/${id}`, fetcher, { refreshInterval: 30_000 })
  const price = data?.price ?? null

  // Normalize to FRACTION for fmtPct()
  const pctFrac = normalizeChangeToFraction(data?.change_24h, price)

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
        {/* Left: favorite + name */}
        <div className="flex items-center gap-3">
          {/* Floating star (same look/feel as sidebar coin star, no borders) */}
          <button
            type="button"
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFav}
            onClick={() => toggle(id)}
            disabled={favLoading}
            className={`inline-flex h-8 w-8 items-center justify-center transition ${
              isFav
                ? 'text-yellow-400 hover:opacity-90'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className={`h-5 w-5 ${isFav ? 'fill-yellow-400 text-yellow-400' : ''}`} />
          </button>

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {name}
            <span className="ml-2 align-middle text-sm uppercase text-slate-400">
              {symbol}
            </span>
          </h1>
        </div>

        {/* Right: price + % change (keep layout; chip shows PERCENT, not raw price delta) */}
        <div className="flex items-baseline gap-3">
          <div className="tabular-nums text-xl md:text-2xl font-semibold">
            {price != null ? (
              fmtCurrency(price)
            ) : (
              <span className="inline-block h-6 w-24 animate-pulse rounded bg-slate-600/30" />
            )}
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pctClasses}`}
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

      {/* Optional stale badge
      {data?.stale && (
        <div className="mt-2 text-[10px] text-amber-300">
          Price may be delayed.
        </div>
      )}
      */}
    </div>
  )
}

