'use client'

import useSWR from 'swr'
import { useEffect, useRef } from 'react'

type ApiShape =
  | {
      // New route shape I proposed
      price?: number | null
      pct24h?: number | null     // percent, e.g. -0.82
      abs24h?: number | null     // USD change over 24h
      lastPrice?: number | null  // yesterday price (implied)
      updatedAt?: number | string | null
      captured_at?: never
      change_24h_pct?: never
    }
  | {
      // Your existing route shape
      price?: number | null
      change_24h_pct?: number | null // percent, e.g. -0.82
      captured_at?: string | null
      provider?: string
    }
  | Record<string, unknown>

function toNum(x: unknown): number | null {
  if (x == null) return null
  const n =
    typeof x === 'number' ? x :
    typeof x === 'string' ? Number(x) : NaN
  return Number.isFinite(n) ? n : null
}

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' })
    .then(r => r.json() as Promise<ApiShape>)
    .catch(() => ({} as ApiShape))

/**
 * useLivePrice(coingeckoId, refreshMs)
 *
 * Returns:
 * - price:      current USD price (live tick)
 * - lastPrice:  previous tick's price (for crossing detection)
 * - pct24h:     24h change in percent (from API when present; computed if needed)
 * - abs24h:     24h absolute USD change (computed if needed)
 * - yesterdayPrice: yesterday's price implied by pct24h (computed if needed)
 * - updatedAt:  when the API last updated (epoch seconds or ISO string passthrough)
 */
export function useLivePrice(coingeckoId: string, refreshMs = 15000) {
  const { data, error, isLoading, mutate } = useSWR<ApiShape>(
    coingeckoId ? `/api/price/${encodeURIComponent(coingeckoId)}` : null,
    fetcher,
    {
      refreshInterval: refreshMs,
      dedupingInterval: Math.max(1000, Math.floor(refreshMs * 0.8)),
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryInterval: 10000,
      errorRetryCount: 5,
    }
  )

  // Normalize fields from either API shape
  const price = toNum((data as any)?.price)

  let pct24h =
    toNum((data as any)?.pct24h) ??
    toNum((data as any)?.change_24h_pct) ?? // ← current route field
    toNum((data as any)?.usd_24h_change) ?? // safety
    null

  let abs24h =
    toNum((data as any)?.abs24h) ??
    toNum((data as any)?.change24h) ??
    null

  let yesterdayPrice =
    toNum((data as any)?.lastPrice) ?? // new route
    toNum((data as any)?.prev24h) ??   // safety alias
    null

  const updatedAt =
    (data as any)?.updatedAt ??
    (data as any)?.captured_at ??
    null

  // Backfill missing pieces consistently
  if (price != null && pct24h != null && yesterdayPrice == null) {
    // P_now = P_prev * (1 + pct/100) → P_prev = P_now / (1+pct/100)
    yesterdayPrice = price / (1 + pct24h / 100)
  }
  if (price != null && pct24h != null && abs24h == null && yesterdayPrice != null) {
    abs24h = price - yesterdayPrice
  }
  if (price != null && abs24h != null && pct24h == null) {
    const prev = price - abs24h
    if (prev) pct24h = (abs24h / prev) * 100
  }

  // Preserve previous *tick* for crossing detection
  const prevTickRef = useRef<number | null>(null)
  const lastTickRef = useRef<number | null>(null)

  const current = price != null && isFinite(price) ? price : null

  useEffect(() => {
    if (current != null) {
      prevTickRef.current = lastTickRef.current
      lastTickRef.current = current
    }
  }, [current])

  return {
    price: lastTickRef.current ?? current, // current live tick
    lastPrice: prevTickRef.current,        // previous *tick* (NOT yesterday)
    pct24h,
    abs24h,
    yesterdayPrice,
    updatedAt,
    isLoading,
    error,
    mutate,
  }
}

export default useLivePrice

