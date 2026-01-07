'use client'

import type { Middleware } from 'swr'
import { decInFlight, getNavId, incInFlight } from './swrLoadingStore'

// SWR middleware that tracks in-flight SWR fetches for the current route generation.
// This enables a full-screen cover to stay visible until the page's SWR-backed
// components have actually finished loading (not time-based).
export const swrLoadingMiddleware: Middleware = (useSWRNext) => {
  return (key, fetcher, config) => {
    const wrappedFetcher =
      fetcher &&
      (async (...args: any[]) => {
        const navId = getNavId()
        incInFlight(navId)
        try {
          return await (fetcher as any)(...args)
        } finally {
          decInFlight(navId)
        }
      })

    return useSWRNext(key, wrappedFetcher as any, config)
  }
}

