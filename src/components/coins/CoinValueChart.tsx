'use client'

import useSWR from 'swr'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import CoinHistoryChart from '@/components/charts/CoinHistoryChart'

type Point = { t: number; v: number }
type TradeLite = { side: 'buy' | 'sell'; trade_time: string }

type Props = {
  coingeckoId: string
  /** Optional: pass coin trades if already loaded (we only read side & trade_time) */
  trades?: TradeLite[]
  className?: string
}

// Strict fetcher: throw on !ok or bad payload so SWR treats as error
const fetcher = async (url: string): Promise<Point[]> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error('Bad payload')
  return j
    .filter((d: any) => d && typeof d.t === 'number' && typeof d.v === 'number')
    .map((d: any) => ({ t: d.t, v: d.v }))
}

const RANGE_OPTS = [
  { key: '1', label: '24h' },
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: '365', label: '1y' },
  { key: 'ytd', label: 'YTD' },
  { key: 'max', label: 'Max' }, // NOTE: Max = since first BUY (if any)
] as const
type RangeKey = typeof RANGE_OPTS[number]['key']

export default function CoinValueChart({ coingeckoId, trades = [], className }: Props) {
  const { user } = useUser()

  // If trades not provided, fetch the earliest BUY timestamp
  const { data: fallbackEarliest } = useSWR<number | null>(
    !trades.length && user && coingeckoId
      ? [`/earliest-buy/${user.id}/${coingeckoId}`]
      : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('trade_time')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'buy')
        .order('trade_time', { ascending: true })
        .limit(1)
      if (error) throw error
      if (!data || !data.length) return null
      return new Date(data[0].trade_time).getTime()
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // Earliest BUY time (prefer prop, else fetched)
  const earliestBuyTs = useMemo(() => {
    const fromProp = trades
      .filter(t => t.side === 'buy')
      .map(t => new Date(t.trade_time).getTime())
    if (fromProp.length) return Math.min(...fromProp)
    return fallbackEarliest ?? null
  }, [trades, fallbackEarliest])

  // Days since earliest BUY used when range === 'max'
  const maxDays = useMemo(() => {
    if (!earliestBuyTs) return 'max' // if no buys yet, fallback to upstream 'max'
    const ms = Date.now() - earliestBuyTs
    const days = Math.max(1, Math.ceil(ms / 86_400_000))
    return days > 3650 ? 'max' : String(days) // cap at ~10y, else exact day span
  }, [earliestBuyTs])

  // Derived YTD days
  const ytdDays = useMemo(() => {
    const now = new Date()
    const ytdStart = new Date(now.getFullYear(), 0, 1).getTime()
    const days = Math.max(1, Math.ceil((Date.now() - ytdStart) / 86_400_000))
    return String(days)
  }, [])

  const [range, setRange] = useState<RangeKey>('90') // sensible default
  const effectiveDays = useMemo(() => {
    if (range === 'ytd') return ytdDays
    if (range === 'max') return maxDays
    return range // '1','7','30','90','365'
  }, [range, ytdDays, maxDays])

  // Keep the last good series while revalidating or on error
  const lastGoodRef = useRef<Point[] | null>(null)

  const {
    data,
    error,
    isLoading,
    isValidating,
  } = useSWR<Point[]>(
    coingeckoId ? `/api/coin-history?id=${encodeURIComponent(coingeckoId)}&days=${effectiveDays}` : null,
    fetcher,
    {
      refreshInterval: 120_000,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
      errorRetryCount: 2,
      errorRetryInterval: 5000,
    }
  )

  useEffect(() => {
    if (Array.isArray(data) && data.length > 0) {
      lastGoodRef.current = data
    }
  }, [data])

  const series: Point[] =
    (Array.isArray(data) && data.length > 0)
      ? data
      : (lastGoodRef.current ?? [])

  const showSkeleton = series.length === 0 && (isLoading || isValidating) && !error
  const showErrorInline = series.length === 0 && !!error

  return (
    <div className={['rounded-2xl border border-[#081427] p-4', className].filter(Boolean).join(' ')}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
        <div className="text-sm font-medium">Price History</div>
        <div className="flex flex-wrap gap-1">
          {RANGE_OPTS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={[
                'rounded-full px-3 py-1 text-xs border transition-colors',
                range === opt.key
                  ? 'bg-white/15 text-white border-white/25'
                  : 'bg-white/5 text-slate-200 hover:bg-white/10 border-white/10',
              ].join(' ')}
              aria-pressed={range === opt.key}
              title={opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {showSkeleton ? (
          <div className="h-full w-full animate-pulse rounded-xl bg-white/5" />
        ) : series.length > 0 ? (
          <CoinHistoryChart data={series} />
        ) : (
          <div className="h-full w-full grid place-items-center text-xs text-slate-400">
            {showErrorInline ? 'Unable to load price history (temporary). Try another range.' : 'No data yet.'}
          </div>
        )}
      </div>

      {/* Footnote */}
      <p className="mt-3 text-[11px] text-slate-500">
        “Max” spans from your first BUY for this asset (if any), otherwise the provider’s maximum range. Area under the line fades for visual clarity.
      </p>
    </div>
  )
}

