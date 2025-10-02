'use client'

import React, { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

type PriceResp = {
  price: number | null
}

type Props = {
  id: string // coingecko id, e.g. "bitcoin"
}

/* ------------ utils ------------ */

const fetcher = (url: string) => fetch(url).then(r => r.json())

const n = (v: any) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function fmtQty(v: number): string {
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function fmtSignedCurrency(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${fmtCurrency(v)}`
}

/**
 * WAC engine:
 * - BUY: add qty & cost (including buy fee)
 * - SELL: realized += (sellPrice - avgCost)*qty - sellFee; reduce basis at avg
 * Fees:
 *  - Buy fee increases basis
 *  - Sell fee reduces realized P/L
 */
function computeStats(trades: Array<{
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee?: number | null
  trade_time: string
}>, livePrice: number | null) {
  const rows = [...trades].sort((a, b) =>
    new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime()
  )

  let qtyHeld = 0
  let basis = 0 // USD basis of current holdings
  let realized = 0

  for (const t of rows) {
    const qty = n(t.quantity)
    const price = n(t.price)
    const fee = Math.max(0, n(t.fee ?? 0))
    if (qty <= 0 || price <= 0) continue

    if (t.side === 'buy') {
      basis += qty * price + fee // fee adds to cost
      qtyHeld += qty
    } else {
      const sellQty = Math.min(qty, qtyHeld)
      if (sellQty > 0 && qtyHeld > 0) {
        const avg = basis / qtyHeld
        realized += sellQty * (price - avg) - fee // fee reduces proceeds
        basis -= sellQty * avg
        qtyHeld -= sellQty
      } else {
        // ignore sells beyond holdings (no shorting)
      }
    }
  }

  const avgPrice = qtyHeld > 0 ? basis / qtyHeld : 0
  const currentValue = livePrice != null ? qtyHeld * livePrice : 0
  const unrealized = qtyHeld > 0 && livePrice != null ? qtyHeld * (livePrice - avgPrice) : 0
  const totalPL = realized + unrealized

  return { holdingsQty: qtyHeld, avgPrice, currentValue, realizedPL: realized, unrealizedPL: unrealized, totalPL }
}

/* ------------ UI card ------------ */

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: React.ReactNode
  accent?: 'pos' | 'neg' | 'neutral'
  icon?: 'up' | 'down'
}) {
  const ring =
    accent === 'pos'
      ? 'ring-emerald-500/25'
      : accent === 'neg'
      ? 'ring-rose-500/25'
      : 'ring-slate-600/30'
  const glow =
    accent === 'pos'
      ? 'shadow-[0_0_0.5rem_rgba(16,185,129,0.15)]'
      : accent === 'neg'
      ? 'shadow-[0_0_0.5rem_rgba(244,63,94,0.15)]'
      : 'shadow-[0_0_0.5rem_rgba(148,163,184,0.08)]'
  const text =
    accent === 'pos' ? 'text-emerald-400' : accent === 'neg' ? 'text-rose-400' : 'text-slate-200'

  return (
    <div className={`rounded-2xl border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ${glow} ring-1 ${ring}`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
          {icon === 'up' && <TrendingUp className="h-4 w-4 text-emerald-400" />}
          {icon === 'down' && <TrendingDown className="h-4 w-4 text-rose-400" />}
        </div>
        <div className={`mt-2 text-xl md:text-2xl font-semibold tabular-nums ${text}`}>{value}</div>
      </div>
    </div>
  )
}

/* ------------ main ------------ */

export default function CoinStatsGrid({ id }: Props) {
  const { user, loading } = useUser()

  // Live price
  const { data: priceData } = useSWR<PriceResp>(
    id ? `/api/price/${encodeURIComponent(id)}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  )
  const livePrice = priceData?.price ?? null

  // Trades (gate on user to ensure session is attached; mirrors your other components)
  const { data: trades } = useSWR<
    Array<{ side: 'buy' | 'sell'; price: number; quantity: number; fee: number | null; trade_time: string }>
  >(
    !loading && user ? ['/coin/stats/trades', user.id, id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('side,price,quantity,fee,trade_time')
        .eq('user_id', user!.id)
        .eq('coingecko_id', id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map(t => ({
        side: String(t.side) as 'buy' | 'sell',
        price: n(t.price),
        quantity: n(t.quantity),
        fee: n(t.fee),
        trade_time: String(t.trade_time),
      }))
    },
    { refreshInterval: 30_000 }
  )

  const stats = useMemo(() => computeStats(trades ?? [], livePrice), [trades, livePrice])

  const unrealAccent = stats.unrealizedPL > 0 ? 'pos' : stats.unrealizedPL < 0 ? 'neg' : 'neutral'
  const realAccent = stats.realizedPL > 0 ? 'pos' : stats.realizedPL < 0 ? 'neg' : 'neutral'
  const totalAccent = stats.totalPL > 0 ? 'pos' : stats.totalPL < 0 ? 'neg' : 'neutral'

  return (
    <div className="mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Holdings (qty)" value={fmtQty(stats.holdingsQty)} />
        <StatCard label="Avg price" value={stats.holdingsQty > 0 ? fmtCurrency(stats.avgPrice) : '—'} />
        <StatCard label="Current value" value={fmtCurrency(stats.currentValue)} />
        <StatCard
          label="Unrealized P/L"
          value={fmtSignedCurrency(stats.unrealizedPL)}
          accent={unrealAccent as any}
          icon={unrealAccent === 'pos' ? 'up' : unrealAccent === 'neg' ? 'down' : undefined}
        />
        <StatCard
          label="Realized P/L"
          value={fmtSignedCurrency(stats.realizedPL)}
          accent={realAccent as any}
          icon={realAccent === 'pos' ? 'up' : realAccent === 'neg' ? 'down' : undefined}
        />
        <StatCard
          label="Total P/L"
          value={fmtSignedCurrency(stats.totalPL)}
          accent={totalAccent as any}
          icon={totalAccent === 'pos' ? 'up' : totalAccent === 'neg' ? 'down' : undefined}
        />
      </div>
    </div>
  )
}

