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

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function fmtSignedCurrency(n: number) {
  const s = fmtCurrency(Math.abs(n))
  if (n > 0) return `+${s}`
  if (n < 0) return `-${s}`
  return s
}

function fmtQty(n: number) {
  // show up to 8 decimals but trim trailing zeros
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
    useGrouping: true,
  })
}

/* ------------ compute holdings / P&L ------------ */

function n(x: number | null | undefined): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
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
  fee: number
  trade_time: string
}>, livePrice: number | null) {
  let qtyHeld = 0
  let basis = 0 // total cost basis of current holdings
  let realized = 0

  for (const t of trades) {
    const qty = Math.max(0, n(t.quantity))
    const price = Math.max(0, n(t.price))
    const fee = Math.max(0, n(t.fee))
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
  accent = 'neutral',
  icon,
}: {
  label: string
  value: string
  accent?: 'neutral' | 'pos' | 'neg'
  icon?: 'up' | 'down'
}) {
  // // Make positive glow a touch stronger & use generic RGB (R87 G181 B66)
const glow =
accent === 'pos'
  ? 'shadow-[0_0_12px_rgba(87,181,66,0.16)]'
  : accent === 'neg'
  ? 'shadow-[0_0_8px_rgba(244,63,94,0.065)]'
  : 'shadow-[0_0_6px_rgba(148,163,184,0.055)]'

  const ring =
    accent === 'pos'
      ? 'ring-[rgba(124,188,97,0.10)]'
      : accent === 'neg'
      ? 'ring-rose-400/10'
      : 'ring-slate-300/10'

  // Use exact positive green for text when accent is positive
  const text =
  accent === 'pos'
    ? 'text-[rgb(96,173,70)]' // generic RGB (R G190 B90)
    : accent === 'neg'
    ? 'text-[rgb(176,49,49)]'
    : 'text-slate-200'


  return (
    <div className={`rounded-2xl border border-[rgb(28,29,31)] bg-[rgb(28,29,31)]`}>



      <div className="p-3">
        <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
          {icon === 'up' && <TrendingUp className="h-4 w-4 text-[rgb(124,188,97)]" />}
          {icon === 'down' && <TrendingDown className="h-4 w-4 text-[rgb(176,49,49)]" />}
        </div>
        <div className={`mt-1.5 text-xl md:text-2xl font-semibold tabular-nums ${text}`}>{value}</div>


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
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
      revalidateIfStale: true,
      keepPreviousData: true,
      errorRetryCount: 4,
      errorRetryInterval: 5_000,
    }
  )
  
  
  const livePrice = priceData?.price ?? null

  // Trades
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
        side: (t.side as 'buy' | 'sell') ?? 'buy',
        price: n(t.price),
        quantity: n(t.quantity),
        fee: n(t.fee),
        trade_time: t.trade_time,
      }))
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    }
  )

const stats = useMemo(
  () => computeStats((trades ?? []) as any, livePrice),
  [trades, livePrice]
)

  const unrealAccent = stats.unrealizedPL > 0 ? 'pos' : stats.unrealizedPL < 0 ? 'neg' : 'neutral'
  const realAccent = stats.realizedPL > 0 ? 'pos' : stats.realizedPL < 0 ? 'neg' : 'neutral'
  const totalAccent = stats.totalPL > 0 ? 'pos' : stats.totalPL < 0 ? 'neg' : 'neutral'

  return (
    <div className="mb-6 px-6 md:px-8 lg:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* TOP ROW (Current value → Holdings (qty) → Avg price) */}
        <StatCard label="Current value" value={fmtCurrency(stats.currentValue)} />
        <StatCard label="Holdings (qty)" value={fmtQty(stats.holdingsQty)} />
        <StatCard label="Avg price" value={stats.holdingsQty > 0 ? fmtCurrency(stats.avgPrice) : '—'} />

        {/* BOTTOM ROW (Unrealized P/L → Realized P/L → Total P/L) */}
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
