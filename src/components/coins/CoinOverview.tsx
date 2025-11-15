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

/* ---------- ultra-robust, UI-only logo (symbol-based) ---------- */
function CoinLogo({ symbol, name }: { symbol: string; name: string }) {
  // Normalize and alias a few common edge cases (UI-only)
  const sym = (symbol || '').toLowerCase().trim()
  const alias = (s: string) => {
    if (s === 'xbt') return 'btc'
    if (s === 'miota') return 'iota'
    if (s === 'bcc') return 'bch'
    if (s === 'xbt') return 'btc'
    return s
  }
  const s = alias(sym)

  // Ordered, reliable public sources by symbol.
  // (PNG/SVG sets from spothq; PNG + @2x from CoinCap; dynamic PNG from CryptoIcons API)
  const sources = useMemo(() => {
    const list: { url: string; srcSet?: string }[] = []

    // 1) CryptoIcons API (PNG; dynamic rendering of the spothq set)
    list.push({
      url: `https://cryptoicons.org/api/icon/${s}/200.png`,
      srcSet: `https://cryptoicons.org/api/icon/${s}/200.png 2x, https://cryptoicons.org/api/icon/${s}/128.png 1x`
    })
    // 2) CoinCap assets (PNG + @2x)
    list.push({
      url: `https://assets.coincap.io/assets/icons/${s}@2x.png`,
      srcSet: `https://assets.coincap.io/assets/icons/${s}.png 1x, https://assets.coincap.io/assets/icons/${s}@2x.png 2x`
    })
    // 3) spothq PNG (static 128px)
    list.push({
      url: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png`,
      srcSet: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png 2x`
    })
    // 4) spothq SVG (vector)
    list.push({
      url: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${s}.svg`
    })

    return list
  }, [s])

  const [idx, setIdx] = useState(0)
  const [hidden, setHidden] = useState(false)

  if (!s || hidden) return null

  const current = sources[idx]

  return (
    <img
      key={current.url}
      src={current.url}
      srcSet={current.srcSet}
      sizes="(min-width: 768px) 40px, 32px"
      alt={`${name} logo`}
      className="h-8 w-8 md:h-10 md:w-10 rounded-full shadow-sm"
      onError={() => {
        if (idx < sources.length - 1) setIdx(idx + 1)
        else setHidden(true)
      }}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      // crossorigin not required; all images are public and we don't read pixels
    />
  )
}

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

  // Live price
  const { data: priceData } = useSWR<PriceResp>(
    `/api/price/${id}`,
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
        {/* Left: name */}
        <div className="flex items-center gap-3 pl-3 md:pl-6">
          {/* HD coin logo (UI-only) with robust fallbacks + HiDPI */}
          <CoinLogo symbol={symbol} name={name} />
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {name}
            <span className="ml-2 align-middle text-sm uppercase text-slate-400">
              {symbol}
            </span>
          </h1>
        </div>

        {/* Right: star + price + % change */}
        <div className="flex items-baseline gap-3 pr-3 md:pr-6">
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
