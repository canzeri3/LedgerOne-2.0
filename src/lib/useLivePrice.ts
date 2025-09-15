'use client'

import useSWR from 'swr'
import { useEffect, useRef } from 'react'

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).catch(() => ({ price: null }))

/**
 * Polls /api/price/:id and gives you the current price AND the previous tick price
 * so we can detect "crossings" (last>level & now<=level for buys, etc.).
 */
export function useLivePrice(coingeckoId: string, interval = 15000) {
  const { data } = useSWR<{ price: number | null }>(
    coingeckoId ? `/api/price/${encodeURIComponent(coingeckoId)}` : null,
    fetcher,
    {
      refreshInterval: interval,
      dedupingInterval: interval,
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryInterval: 10000,
      errorRetryCount: 5,
    }
  )

  const current = (typeof data?.price === 'number' && isFinite(data.price!)) ? data!.price! : null

  const prevRef = useRef<number | null>(null)
  const lastRef = useRef<number | null>(null)

  useEffect(() => {
    if (current != null) {
      prevRef.current = lastRef.current
      lastRef.current = current
    }
  }, [current])

  return { price: lastRef.current ?? current, lastPrice: prevRef.current }
}

