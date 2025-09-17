'use client'

import useSWR from 'swr'
import React, { useEffect, useMemo, useState } from 'react'
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

type HistoryPoint = { t: number; p: number }

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

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
  return Math.abs(v) <= 1 ? v : v / 100
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

export default function CoinOverview({ id, name, symbol }: Props) {
  // Favorites (optimistic)
  const { favorites, toggle, isLoading: favLoading } = useFavorites()
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

  // Live price
  const { data: priceData } = useSWR<PriceResp>(`/api/price/${id}`, fetcher, { refreshInterval: 30_000 })
  const price = priceData?.price ?? null

  // 24h history (for authoritative comparison / fallback)
  const { data: histRaw } = useSWR<any>(`/api/coin-history?id=${encodeURIComponent(id)}&days=1`, fetcher, { refreshInterval: 300_000 })
  const hist = useMemo(() => normalizeHistory(histRaw), [histRaw])

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
        {/* Left: favorite + name */}
        <div className="flex items-center gap-3">
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

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {name}
            <span className="ml-2 align-middle text-sm uppercase text-slate-400">
              {symbol}
            </span>
          </h1>
        </div>

        {/* Right: price + % change */}
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
    </div>
  )
}

