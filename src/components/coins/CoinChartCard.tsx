'use client'

import useSWR from 'swr'
import { useEffect, useMemo, useState } from 'react'
import CoinHistoryChart from '@/components/charts/CoinHistoryChart'

type TradeLite = { side: 'buy' | 'sell'; trade_time: string }

type Props = {
  coingeckoId: string
  /** Pass your coin’s trades if you have them on the page; we only read earliest BUY time */
  trades?: TradeLite[]
  className?: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

const RANGE_OPTS = [
  { key: 'auto', label: 'Since 1st Buy' },
  { key: '1', label: '24h' },
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: '365', label: '1y' },
  { key: 'ytd', label: 'YTD' },
  { key: 'max', label: 'Max' },
] as const
type RangeKey = typeof RANGE_OPTS[number]['key']

export default function CoinChartCard({ coingeckoId, trades = [], className }: Props) {
  // Find earliest BUY (ignore sells) for this coin
  const earliestBuyTs = useMemo(() => {
    const buys = trades.filter(t => t.side === 'buy')
    if (buys.length === 0) return null
    return Math.min(...buys.map(b => new Date(b.trade_time).getTime()))
  }, [trades])

  // Compute "auto" days from earliest BUY
  const autoDays = useMemo(() => {
    if (!earliestBuyTs) return 90
    const ms = Date.now() - earliestBuyTs
    const days = Math.max(1, Math.ceil(ms / 86_400_000))
    return days > 3650 ? 'max' : String(days) // cap at ~10y, else use 'max'
  }, [earliestBuyTs])

  // Derived YTD days
  const ytdDays = useMemo(() => {
    const now = new Date()
    const ytdStart = new Date(now.getFullYear(), 0, 1).getTime()
    const days = Math.max(1, Math.ceil((Date.now() - ytdStart) / 86_400_000))
    return String(days)
  }, [])

  const [range, setRange] = useState<RangeKey>('auto')

  const effectiveDays = useMemo(() => {
    if (range === 'auto') return autoDays
    if (range === 'ytd') return ytdDays
    return range // '1','7',..,'max'
  }, [range, autoDays, ytdDays])

  // Fetch series (ISR cached ~5 min on server; SWR refresh ~2 min here)
  const { data, isLoading } = useSWR<{ t: number; v: number }[]>(
    coingeckoId ? `/api/coin-history?id=${encodeURIComponent(coingeckoId)}&days=${effectiveDays}` : null,
    fetcher,
    {
      refreshInterval: 120_000,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  )

  const series = Array.isArray(data) ? data : []

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
 <div className="min-w-0 h-64">
        {isLoading && series.length === 0 ? (
          <div className="h-full w-full animate-pulse rounded-xl bg-white/5" />
        ) : (
          <CoinHistoryChart data={series} />
        )}
      </div>

      {/* Footnote */}
      <p className="mt-3 text-[11px] text-slate-500">
        Data from CoinGecko. “Since 1st Buy” starts the chart at your earliest BUY trade for this asset.
      </p>
    </div>
  )
}

