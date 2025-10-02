'use client'

import useSWR from 'swr'
import { useEffect, useMemo, useRef, useState } from 'react'
import CoinHistoryChart from '@/components/charts/CoinHistoryChart'

type TradeLite = {
  coingecko_id: string
  side: 'buy' | 'sell'
  quantity: number
  trade_time: string
}

type Point = { t: number; v: number }

type Props = {
  /** Full trade list for the signed-in user (as already fetched on the page) */
  trades: TradeLite[]
  className?: string
}

// Fetch histories for many coins in one SWR call (Promise.all with fallbacks)
const fetchHistories = async (ids: string[], days: string | number) => {
  const urls = ids.map(
    (id) => `/api/coin-history?id=${encodeURIComponent(id)}&days=${days}`
  )

  const settled = await Promise.allSettled(
    urls.map(async (u) => {
      const r = await fetch(u)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!Array.isArray(j)) throw new Error('Bad payload')
      // normalize and guard
      const series = j
        .filter((d: any) => d && typeof d.t === 'number' && typeof d.v === 'number')
        .map((d: any) => ({ t: d.t, v: d.v })) as Point[]
      return series
    })
  )

  // Keep only successful series in the same order as ids
  const byId: Record<string, Point[]> = {}
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') byId[ids[i]] = res.value
  })
  return byId
}

const RANGE_OPTS = [
  { key: '1', label: '24h' },
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: '365', label: '1y' },
  { key: 'ytd', label: 'YTD' },
  { key: 'max', label: 'Max' }, // Max = since earliest BUY across all coins
] as const
type RangeKey = typeof RANGE_OPTS[number]['key']

export default function PortfolioHistoryChartCard({ trades, className }: Props) {
  // Unique coin ids present in trades
  const coinIds = useMemo(
    () => Array.from(new Set((trades ?? []).map(t => t.coingecko_id))),
    [trades]
  )

  // Earliest BUY timestamp across all coins
  const earliestBuyTs = useMemo(() => {
    const buys = (trades ?? []).filter(t => t.side === 'buy')
    if (!buys.length) return null
    return Math.min(...buys.map(b => new Date(b.trade_time).getTime()))
  }, [trades])

  // days span for Max (since earliest BUY), fallback to provider max if none
  const maxDays = useMemo(() => {
    if (!earliestBuyTs) return 'max'
    const ms = Date.now() - earliestBuyTs
    const days = Math.max(1, Math.ceil(ms / 86_400_000))
    return days > 3650 ? 'max' : String(days)
  }, [earliestBuyTs])

  // YTD days
  const ytdDays = useMemo(() => {
    const now = new Date()
    const ytdStart = new Date(now.getFullYear(), 0, 1).getTime()
    const days = Math.max(1, Math.ceil((Date.now() - ytdStart) / 86_400_000))
    return String(days)
  }, [])

  // Range selection (same UX as coin chart)
  const [range, setRange] = useState<RangeKey>('90')
  const effectiveDays = useMemo(() => {
    if (range === 'ytd') return ytdDays
    if (range === 'max') return maxDays
    return range // '1','7','30','90','365'
  }, [range, ytdDays, maxDays])

  // SWR: fetch all coin histories for the chosen range (cached on server)
  const {
    data: historiesMap,
    error,
    isLoading,
    isValidating,
  } = useSWR<Record<string, Point[]>>(
    coinIds.length ? ['portfolio-history', coinIds.join(','), effectiveDays] : null,
    () => fetchHistories(coinIds, effectiveDays),
    {
      refreshInterval: 120_000,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
      errorRetryCount: 2,
      errorRetryInterval: 5000,
    }
  )

  // Build aggregated series: for each timestamp in each coin’s history,
  // compute qty at that time (from trades) * price, then sum across coins.
  const aggregatedSeries = useMemo<Point[]>(() => {
    if (!historiesMap || !coinIds.length) return []

    // Index trades by coin and sort by time
    const tradesByCoin = new Map<string, TradeLite[]>()
    for (const t of trades ?? []) {
      if (!tradesByCoin.has(t.coingecko_id)) tradesByCoin.set(t.coingecko_id, [])
      tradesByCoin.get(t.coingecko_id)!.push(t)
    }
    for (const arr of tradesByCoin.values()) {
      arr.sort((a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime())
    }

    // Accumulator: timestamp -> total portfolio value at that time
    const sumByTs = new Map<number, number>()

    for (const cid of coinIds) {
      const series = historiesMap[cid]
      if (!Array.isArray(series) || series.length === 0) continue

      const coinTrades = tradesByCoin.get(cid) ?? []
      let tradeIdx = 0
      let qty = 0

      for (const p of series) {
        const tMs = p.t
        // Apply all trades up to and including this time
        while (
          tradeIdx < coinTrades.length &&
          new Date(coinTrades[tradeIdx].trade_time).getTime() <= tMs
        ) {
          const tr = coinTrades[tradeIdx]
          qty += tr.side === 'buy' ? tr.quantity : -tr.quantity
          tradeIdx++
        }
        const value = qty * p.v
        sumByTs.set(tMs, (sumByTs.get(tMs) ?? 0) + value)
      }
    }

    // Normalize to ascending array
    const out: Point[] = Array.from(sumByTs.entries())
      .map(([t, v]) => ({ t, v: Math.max(0, v) }))
      .sort((a, b) => a.t - b.t)

    return out
  }, [historiesMap, coinIds, trades])

  // Keep last good series while refreshing/when some histories error
  const lastGoodRef = useRef<Point[] | null>(null)
  useEffect(() => {
    if (aggregatedSeries.length > 0) lastGoodRef.current = aggregatedSeries
  }, [aggregatedSeries])

  const seriesToShow =
    aggregatedSeries.length > 0 ? aggregatedSeries : (lastGoodRef.current ?? [])

  const showSkeleton = seriesToShow.length === 0 && (isLoading || isValidating) && !error
  const showErrorInline = seriesToShow.length === 0 && !!error

  return (
    <div className={['rounded-2xl border border-[#081427] p-4', className].filter(Boolean).join(' ')}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
        <div className="text-sm font-medium">Portfolio Value (Price History)</div>
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
        ) : seriesToShow.length > 0 ? (
          <CoinHistoryChart data={seriesToShow} />
        ) : (
          <div className="h-full w-full grid place-items-center text-xs text-slate-400">
            {showErrorInline
              ? 'Unable to load portfolio history (temporary). Try another range.'
              : 'No data yet.'}
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Aggregates per-coin holdings × price history at each time bucket. “Max” starts at your first BUY across all coins.
      </p>
    </div>
  )
}

