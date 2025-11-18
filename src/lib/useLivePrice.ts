// src/lib/useLivePrice.ts
'use client'

import useSWR from 'swr'

/**
 * Shape of the /api/prices response (single-coin row).
 * This mirrors what your new data core returns.
 */
type PriceRow = {
  id: string
  price: number | null
  price_24h?: number | null
  pct24h?: number | null
  source?: string | null
  stale?: boolean
  quality?: number | null
}

type PricesResponse = {
  rows: PriceRow[]
  updatedAt?: string
}

/**
 * What the hook returns to callers.
 * This is intentionally rich but backwards-friendly:
 * callers can use price / price24h / pct24h or dive into `data`.
 */
export type UseLivePriceResult = {
  price: number | null
  price24h: number | null
  pct24h: number | null
  data?: PriceRow
  updatedAt?: string
  isLoading: boolean
  isValidating: boolean
  error: unknown
}

/**
 * Simple fetcher for /api/prices.
 * Client-side: uses relative path (no INTERNAL_BASE_URL).
 */
const fetcher = async (url: string): Promise<PricesResponse> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  return res.json()
}

/**
 * useLivePrice
 *
 * Live price hook that:
 * - Uses the NEW data core only (/api/prices).
 * - Has an env-tunable refresh interval:
 *     - NEXT_PUBLIC_LIVE_REFRESH_MS (ms)
 *     - Defaults to:
 *         • dev: 0 (no polling, manual refresh during development)
 *         • prod: 30_000 ms (30s)
 * - Accepts an optional override `refreshMs` param for special cases.
 *
 * NOTE: This replaces the old /api/price/:id legacy adapter usage.
 */
export function useLivePrice(
  coingeckoId: string,
  refreshMs?: number
): UseLivePriceResult {
  const isDev = process.env.NODE_ENV === 'development'

  // Decide the default refresh interval from env or sensible defaults.
  // If NEXT_PUBLIC_LIVE_REFRESH_MS is set, respect it in both dev/prod.
  // Otherwise:
  //   - dev: 0 (no polling)
  //   - prod: 30s
  const envRaw = process.env.NEXT_PUBLIC_LIVE_REFRESH_MS
  const envParsed = envRaw ? Number(envRaw) : NaN

  const defaultInterval = Number.isFinite(envParsed)
    ? envParsed
    : isDev
      ? 0
      : 30_000

  const effectiveInterval = refreshMs ?? defaultInterval

  // If no id, disable fetching entirely.
  const hasId = !!coingeckoId
  const key = hasId
    ? `/api/prices?ids=${encodeURIComponent(coingeckoId)}&currency=USD`
    : null

  const {
    data: resp,
    error,
    isLoading,
    isValidating,
  } = useSWR<PricesResponse>(key, fetcher, {
    refreshInterval: hasId && effectiveInterval > 0 ? effectiveInterval : 0,
    // Short deduping interval; SWR will avoid refetching too aggressively.
    dedupingInterval:
      hasId && effectiveInterval > 0
        ? Math.floor(effectiveInterval * 0.8)
        : 0,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  // Extract the single row for this coin.
  const row = resp?.rows?.[0]
  const price = row?.price ?? null
  const price24h = row?.price_24h ?? null
  const pct24h = row?.pct24h ?? null
  const updatedAt = resp?.updatedAt

  return {
    price,
    price24h,
    pct24h,
    data: row,
    updatedAt,
    isLoading: !!key && isLoading,
    isValidating: !!key && isValidating,
    error: error ?? null,
  }
}
