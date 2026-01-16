'use client'

import useSWR from 'swr'
import type { Entitlements } from '@/lib/entitlements'

async function fetcher(url: string): Promise<Entitlements> {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`Failed to load entitlements (${res.status})`)
  return res.json()
}

export function useEntitlements(userId?: string) {
  const key = userId ? '/api/billing/entitlements' : null

  const { data, error, isLoading, mutate } = useSWR<Entitlements>(key, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })

  return {
    entitlements: data,
    loading: isLoading,
    error,
    mutate,
  }
}
