'use client'
import { SWRConfig } from 'swr'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        shouldRetryOnError: true,
        dedupingInterval: 10_000,
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  )
}

