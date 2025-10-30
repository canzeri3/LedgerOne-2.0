'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import PortfolioGrowthChart, { type Point } from '@/components/dashboard/PortfolioGrowthChart'

type TradeLite = { coingecko_id: string; side: 'buy'|'sell'; quantity: number; trade_time: string }
type Timeframe = '24h'|'7d'|'30d'|'90d'|'1y'|'YTD'|'Max'
const TIMEFRAMES: Timeframe[] = ['24h','7d','30d','90d','1y','YTD','Max']

/* ── timeframe helpers ─────────────────────────────────────── */
function startOfYTD(): number {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1).getTime()
}
function rangeStartFor(tf: Timeframe): number | null {
  const now = Date.now(), day = 24*60*60*1000
  switch (tf) {
    case '24h': return now - day
    case '7d':  return now - 7*day
    case '30d': return now - 30*day
    case '90d': return now - 90*day
    case '1y':  return now - 365*day
    case 'YTD': return startOfYTD()
    case 'Max': return null
  }
}
function stepMsFor(tf: Timeframe): number {
  const m = 60_000, h = 60*m
  switch (tf) {
    case '24h': return 5*m
    case '7d':  return 30*m
    case '30d': return 2*h
    case '90d': return 6*h
    case '1y':  return 24*h
    case 'YTD': return 12*h
    case 'Max': return 24*h
  }
}
function daysParamFor(tf: Timeframe): string {
  switch (tf) {
    case '24h': return '1'
    case '7d':  return '7'
    case '30d': return '30'
    case '90d': return '90'
    case '1y':  return '365'
    case 'YTD': return 'max'
    case 'Max': return 'max'
  }
}

/* ── fetch helpers ─────────────────────────────────────────── */
const fetcher = (url: string) => fetch(url).then(r => r.json())

async function fetchHistories(ids: string[], days: string): Promise<Record<string, Point[]>> {
  const urls = ids.map(id => `/api/coin-history?id=${encodeURIComponent(id)}&days=${encodeURIComponent(days)}`)
  const settled = await Promise.allSettled(urls.map(async (u) => {
    const r = await fetch(u, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const arr = await r.json()
    const series: Point[] = (Array.isArray(arr) ? arr : [])
      .map((row: any) => ({ t: Number(row.t), v: Number(row.v) }))
      .filter((p: any) => Number.isFinite(p.t) && Number.isFinite(p.v))
      .sort((a: Point, b: Point) => a.t - b.t)
    return series
  }))
  const byId: Record<string, Point[]> = {}
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') byId[ids[i]] = res.value as Point[]
  })
  return byId
}

/* ── alignment-based aggregation (smooth) ──────────────────── */
function buildAlignedPortfolioSeries(
  coinIds: string[],
  historiesMap: Record<string, Point[]>,
  tradesByCoin: Map<string, TradeLite[]>,
  windowStart: number | null,
  stepMs: number
): Point[] {
  const now = Date.now()
  let start = windowStart ?? Number.POSITIVE_INFINITY
  if (windowStart == null) {
    for (const id of coinIds) {
      const s = historiesMap[id]
      if (s && s.length) start = Math.min(start, s[0].t)
    }
    if (!Number.isFinite(start)) start = now - 24*60*60*1000
  }
  const end = now

  type Cursor = { priceIdx: number; tradeIdx: number; lastPrice: number | null; qty: number }
  const cursors = new Map<string, Cursor>()
  for (const id of coinIds) {
    const trades = (tradesByCoin.get(id) ?? []).slice().sort((a,b)=>new Date(a.trade_time).getTime()-new Date(b.trade_time).getTime())
    cursors.set(id, { priceIdx: 0, tradeIdx: 0, lastPrice: null, qty: 0 })
    const cur = cursors.get(id)!
    while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= start) {
      const tr = trades[cur.tradeIdx++]
      cur.qty += tr.side === 'buy' ? tr.quantity : -tr.quantity
    }
    const series = (historiesMap[id] ?? []).slice().sort((a,b)=>a.t-b.t)
    if (series.length) {
      while (cur.priceIdx < series.length && series[cur.priceIdx].t <= start) {
        cur.lastPrice = series[cur.priceIdx].v
        cur.priceIdx++
      }
      cur.priceIdx = Math.max(0, cur.priceIdx - 1)
      cur.lastPrice = cur.priceIdx >= 0 ? (series[cur.priceIdx]?.v ?? cur.lastPrice) : cur.lastPrice
    }
  }

  const out: Point[] = []
  for (let t = start; t <= end; t += stepMs) {
    let total = 0
    for (const id of coinIds) {
      const cur = cursors.get(id)!
      const series = historiesMap[id] ?? []
      const trades = tradesByCoin.get(id) ?? []

      while (cur.priceIdx + 1 < series.length && series[cur.priceIdx + 1].t <= t) {
        cur.priceIdx++
        cur.lastPrice = series[cur.priceIdx].v
      }

      while (cur.tradeIdx < trades.length && new Date(trades[cur.tradeIdx].trade_time).getTime() <= t) {
        const tr = trades[cur.tradeIdx++]
        cur.qty += tr.side === 'buy' ? tr.quantity : -tr.quantity
      }

      if (cur.lastPrice != null && Number.isFinite(cur.qty)) {
        total += cur.qty * cur.lastPrice
      }
    }
    out.push({ t, v: Math.max(0, total) })
  }

  if (out.length === 1) {
    const only = out[0]
    out.unshift({ t: only.t - stepMs, v: only.v })
  }

  return out
}

/* ── page ──────────────────────────────────────────────────── */
export default function Page() {
  const { user } = useUser()
  const [tf, setTf] = useState<Timeframe>('30d')

  const { data: trades } = useSWR<TradeLite[]>(
    user ? ['/dashboard/trades-lite', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('coingecko_id,side,quantity,trade_time')
        .eq('user_id', user!.id)
      if (error) throw error
      return (data ?? []).map((t: any) => ({
        coingecko_id: String(t.coingecko_id),
        side: (String(t.side).toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy'|'sell',
        quantity: Number(t.quantity ?? 0),
        trade_time: String(t.trade_time),
      })) as TradeLite[]
    },
    { revalidateOnFocus: tf === '24h', refreshInterval: tf === '24h' ? 30_000 : 120_000 }
  )

  const coinIds = useMemo(() => Array.from(new Set((trades ?? []).map(t => t.coingecko_id))), [trades])

  const { data: historiesMap } = useSWR<Record<string, Point[]>>(
    coinIds.length ? ['portfolio-histories', coinIds.join(','), daysParamFor(tf)] : null,
    () => fetchHistories(coinIds, daysParamFor(tf)),
    { revalidateOnFocus: tf === '24h', refreshInterval: tf === '24h' ? 30_000 : 120_000, keepPreviousData: true }
  )

  const aggregated: Point[] = useMemo(() => {
    if (!historiesMap || !trades || coinIds.length === 0) return []
    const windowStart = rangeStartFor(tf)
    const step = stepMsFor(tf)

    const tradesByCoin = new Map<string, TradeLite[]>()
    for (const t of trades) {
      if (!tradesByCoin.has(t.coingecko_id)) tradesByCoin.set(t.coingecko_id, [])
      tradesByCoin.get(t.coingecko_id)!.push(t)
    }

    let series = buildAlignedPortfolioSeries(coinIds, historiesMap, tradesByCoin, windowStart, step)
    if (tf === 'YTD') {
      const ytd = startOfYTD()
      series = series.filter(p => p.t >= ytd)
    }

    return series
  }, [historiesMap, trades, coinIds.join(','), tf])

  return (
    <div className="space-y-6">
      {/* Card header */}
      {/* tighter corners to match coins page stat cards + required background */}
      <div className="rounded-md border border-neutral-800 bg-[rgb(28,29,31)]">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Portfolio Value (Live)</h2>
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            {TIMEFRAMES.map(key => {
              const active = tf === key
              return (
                <button
                  key={key}
                  onClick={() => setTf(key)}
                  className={[
                    'px-2.5 py-1.5 text-xs md:text-sm rounded-lg transition-colors',
                    'border border-transparent',
                    active ? 'bg-white/15 text-white' : 'text-slate-200/80 hover:text-white hover:bg-white/10'
                  ].join(' ')}
                >
                  {key}
                </button>
              )
            })}
          </div>
        </div>

        {/* Card body */}
        <div className="p-4">
          <div className="h-[360px]">
            <PortfolioGrowthChart data={aggregated} />
          </div>
        </div>
      </div>

      {/* Leave the rest of the dashboard as-is */}
    </div>
  )
}
