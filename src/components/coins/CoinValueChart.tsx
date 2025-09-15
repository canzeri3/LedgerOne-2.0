'use client'

import { useMemo, useRef } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label
} from 'recharts'

type Trade = {
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  side: 'buy' | 'sell'
}

type HistoryResp = { points: { t: number; v: number }[] }
type ValuePoint = { t: number; value: number; qty: number; price: number }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function CoinValueChart({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()

  // 1) Trades (ASC). If this fails, we show an instructive message instead of crashing.
  const { data: trades } = useSWR<Trade[]>(
    user ? ['/value/trades/range', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('price,quantity,fee,trade_time,side')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map(t => ({
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: t.fee ?? 0,
        trade_time: t.trade_time,
        side: t.side as 'buy' | 'sell',
      }))
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      errorRetryInterval: 10_000,
      errorRetryCount: 5,
    }
  )

  // 2) First BUY anchor
  const firstBuyMs = useMemo(() => {
    if (!trades || trades.length === 0) return null
    const fb = trades.find(t => t.side === 'buy')
    return fb ? new Date(fb.trade_time).getTime() : null
  }, [trades])

  // 3) Stable history key (no Date.now() here to avoid loops)
  const historyKey = useMemo(() => {
    if (!firstBuyMs) return null
    return `/api/coin-history?id=${encodeURIComponent(coingeckoId)}&from=${firstBuyMs}`
  }, [coingeckoId, firstBuyMs])

  // Keep last non-empty history to avoid flicker on transient API empties
  const lastGoodHistory = useRef<HistoryResp | null>(null)

  const { data: history } = useSWR<HistoryResp>(
    historyKey,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 300_000,   // match ISR
      dedupingInterval: 300_000,
      errorRetryInterval: 10_000,
      errorRetryCount: 5,
      onSuccess: (data) => {
        if (data && Array.isArray(data.points) && data.points.length >= 2) {
          lastGoodHistory.current = data
        }
      },
    }
  )

  const effectiveHistory = useMemo<HistoryResp | null>(() => {
    if (history?.points?.length) return history
    return lastGoodHistory.current // fall back to last good
  }, [history])

  // 4) Live price ping to keep the right edge moving (doesn't change key)
  const { data: live } = useSWR<{ price: number | null }>(
    `/api/price/${encodeURIComponent(coingeckoId)}`,
    fetcher,
    {
      refreshInterval: 15_000,
      dedupingInterval: 15_000,
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryInterval: 10_000,
      errorRetryCount: 5,
    }
  )

  // 5) Build value series: sweep trades across price history, value = qty × price
  const series = useMemo<ValuePoint[] | null>(() => {
    if (!trades || !firstBuyMs) return null

    const histPts = effectiveHistory?.points
      ?.filter(p => p.t >= firstBuyMs)
      ?.sort((a, b) => a.t - b.t) ?? []

    // If no history made it through, synthesize a flat line at last trade price / live price
    if (histPts.length < 2) {
      // compute current qty
      let qty = 0
      for (const tr of trades) {
        const tt = new Date(tr.trade_time).getTime()
        if (tt < firstBuyMs) continue
        qty = tr.side === 'buy' ? qty + tr.quantity : Math.max(0, qty - tr.quantity)
      }
      const fallbackPrice = typeof live?.price === 'number'
        ? (live!.price as number)
        : (trades.at(-1)?.price ?? 0)
      const t1 = Math.max(firstBuyMs, Date.now() - 1000)
      const t2 = Date.now()
      return [
        { t: t1, value: qty * fallbackPrice, qty, price: fallbackPrice },
        { t: t2, value: qty * fallbackPrice, qty, price: fallbackPrice },
      ]
    }

    let qty = 0
    let ti = 0
    const out: ValuePoint[] = []
    for (const p of histPts) {
      for (; ti < trades.length; ti++) {
        const tt = new Date(trades[ti].trade_time).getTime()
        if (tt > p.t) break
        qty = trades[ti].side === 'buy'
          ? qty + trades[ti].quantity
          : Math.max(0, qty - trades[ti].quantity)
      }
      out.push({ t: p.t, value: qty * p.v, qty, price: p.v })
    }

    // Live right-edge
    const lastQty = out.at(-1)?.qty ?? 0
    const livePrice = typeof live?.price === 'number' ? (live!.price as number) : (out.at(-1)?.price ?? 0)
    out.push({ t: Date.now(), value: lastQty * livePrice, qty: lastQty, price: livePrice })

    // Guarantee at least 2 points
    if (out.length === 1) out.unshift({ ...out[0], t: out[0].t - 1 })
    return out
  }, [trades, firstBuyMs, effectiveHistory, live])

  // Axis formatters
  const tickFmtY = (v: number) => fmtCurrency(v)
  const tickFmtX = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })

  // Guards (user messaging stays, but we still try to synthesize a line above)
  if (!trades || trades.length === 0) {
    return (
      <div className="rounded-2xl border border-[#081427] p-4">
        <div className="text-sm text-slate-300 mb-2">Holdings Value Over Time</div>
        <div className="text-slate-400 text-sm">No trades yet. Add a BUY trade to start the chart.</div>
      </div>
    )
  }
  if (!firstBuyMs) {
    return (
      <div className="rounded-2xl border border-[#081427] p-4">
        <div className="text-sm text-slate-300 mb-2">Holdings Value Over Time</div>
        <div className="text-slate-400 text-sm">No BUY trades found. The chart starts at your first BUY.</div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-300">Holdings Value Over Time</div>
      </div>

      <div className="h-72 w-full">
        {series && series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 8 }}>
              <defs>
                <linearGradient id="valFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3763d6" stopOpacity={0.35}/>
                  <stop offset="100%" stopColor="#3763d6" stopOpacity={0}/>
                </linearGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" floodColor="#0b1830"/>
                </filter>
              </defs>

              <CartesianGrid stroke="#0b1830" strokeOpacity={0.8} />

              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tickFmtX}
                axisLine={{ stroke: '#0b1830' }}
                tickLine={{ stroke: '#0b1830' }}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              >
                <Label value="Time" position="insideBottomRight" offset={-10} fill="#94a3b8" />
              </XAxis>

              <YAxis
                tickFormatter={tickFmtY}
                axisLine={{ stroke: '#0b1830' }}
                tickLine={{ stroke: '#0b1830' }}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                width={80}
              >
                <Label value="Value (USD)" angle={-90} position="insideLeft" offset={-2} fill="#94a3b8" />
              </YAxis>

              <Tooltip
                contentStyle={{ background: '#0a162c', border: '1px solid #0b1830', borderRadius: 8 }}
                labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
                formatter={(v: any, name: any) => {
                  if (name === 'value') return [fmtCurrency(v), 'Value']
                  if (name === 'price') return [fmtCurrency(v), 'Price']
                  if (name === 'qty') return [String(v), 'Qty']
                  return [String(v), name]
                }}
              />

              <Area
                dataKey="value"
                name="Value"
                type="monotone"
                stroke="#3763d6"
                strokeWidth={2}
                fill="url(#valFill)"
                dot={false}
                animationDuration={300}
                style={{ filter: 'url(#shadow)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Not enough data to draw the chart yet.
          </div>
        )}
      </div>
    </div>
  )
}

