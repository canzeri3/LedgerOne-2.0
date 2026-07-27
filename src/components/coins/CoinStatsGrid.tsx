'use client'

import React, { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

// New data core (/api/prices) shape
type CorePricesResp = {
  rows?: Array<{ id: string; price: number | null }>
  updatedAt?: string
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
function fmtSignedPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '' : ''
  return `${sign}${(n * 100).toFixed(2)}%`
}

/** P&L KPI cell that toggles its value between $ and % (vs invested basis). */
function PLStat({
  label, usd, pct, accent,
}: { label: string; usd: number; pct: number | null; accent: 'pos' | 'neg' | 'neutral' }) {
  const [showPct, setShowPct] = useState(false)
  const cls = accent === 'pos' ? 'pos' : accent === 'neg' ? 'neg' : ''
  const canPct = pct != null && Number.isFinite(pct)
  return (
    <div className="ck-cell">
      <div className="l">{label}</div>
      <div className={`v ${cls}`}>{showPct && canPct ? fmtSignedPct(pct) : fmtSignedCurrency(usd)}</div>
      {canPct && (
        <button
          type="button"
          className={`ck-pct${showPct ? ' on' : ''}`}
          onClick={() => setShowPct((v) => !v)}
          aria-label={showPct ? 'Show dollar value' : 'Show percent'}
          title={showPct ? 'Show $' : 'Show %'}
        >
          {showPct ? '$' : '%'}
        </button>
      )}
    </div>
  )
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
  let grossInvested = 0


  for (const t of trades) {
    const qty = Math.max(0, n(t.quantity))
    const price = Math.max(0, n(t.price))
    const fee = Math.max(0, n(t.fee))
    if (qty <= 0 || price <= 0) continue

     if (t.side === 'buy') {
      const cost = qty * price + fee // fee adds to cost
      basis += cost
      grossInvested += cost
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

  return {
    holdingsQty: qtyHeld,
    avgPrice,
    currentValue,
    realizedPL: realized,
    unrealizedPL: unrealized,
    totalPL,
    grossInvested,
  }
}


/* ------------ UI card ------------ */

function StatCard({
  label,
  value,
  accent = 'neutral',
  icon,
  pctValue,
  enablePctToggle = false,
}: {
  label: string
  value: string
  accent?: 'neutral' | 'pos' | 'neg'
  icon?: 'up' | 'down'
  pctValue?: string
  enablePctToggle?: boolean
}) {
  const [showPct, setShowPct] = React.useState(false)

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

  const displayValue =
    enablePctToggle && showPct && pctValue != null && pctValue !== ''
      ? pctValue
      : value

  return (
    <div className={`relative rounded-2xl border border-[rgb(28,29,31)] bg-[rgb(28,29,31)]`}>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
          {icon === 'up' && <TrendingUp className="h-4 w-4 text-[rgb(124,188,97)]" />}
          {icon === 'down' && <TrendingDown className="h-4 w-4 text-[rgb(176,49,49)]" />}
        </div>
        <div className={`mt-1.5 text-xl md:text-2xl font-semibold tabular-nums ${text}`}>{displayValue}</div>
      </div>

      {enablePctToggle && pctValue != null && pctValue !== '' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowPct((prev) => !prev)
          }}
          className="absolute bottom-1.5 right-2 text-[10px] leading-none text-slate-500 hover:text-slate-200"
          aria-label="Toggle between $ and % view"
        >
          %
        </button>
      )}
    </div>
  )
}


/* ------------ main ------------ */

export default function CoinStatsGrid({ id }: Props) {
  const { user, loading } = useUser()

  // Live price (NEW data core — replaces legacy /api/price/[id] adapter)
  const { data: pricesRaw } = useSWR<CorePricesResp>(
    id ? `/api/prices?ids=${encodeURIComponent(id)}&currency=USD` : null,
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

  const livePrice = useMemo(() => {
    const row = pricesRaw?.rows?.find((r) => r?.id === id) ?? pricesRaw?.rows?.[0]
    return row?.price ?? null
  }, [pricesRaw, id])

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

const invested = stats.grossInvested ?? 0
const unrealPct = invested > 0 ? stats.unrealizedPL / invested : null
const realPct = invested > 0 ? stats.realizedPL / invested : null
const totalPct = invested > 0 ? stats.totalPL / invested : null

  const unrealAccent = stats.unrealizedPL > 0 ? 'pos' : stats.unrealizedPL < 0 ? 'neg' : 'neutral'
  const realAccent = stats.realizedPL > 0 ? 'pos' : stats.realizedPL < 0 ? 'neg' : 'neutral'
  const totalAccent = stats.totalPL > 0 ? 'pos' : stats.totalPL < 0 ? 'neg' : 'neutral'


  return (
    <div className="mb-6 px-6 md:px-8 lg:px-6">
      {/* KPI band — one bordered strip, five position stats
          (Current Value omitted: already shown in the chart card) */}
      <div className="ck">
        <div className="ck-cell">
          <div className="l">Holdings (Qty)</div>
          <div className="v">{fmtQty(stats.holdingsQty)}</div>
        </div>
        <div className="ck-cell">
          <div className="l">Avg Cost</div>
          <div className="v">{stats.holdingsQty > 0 ? fmtCurrency(stats.avgPrice) : '—'}</div>
        </div>
        <PLStat label="Unrealized P&L" usd={stats.unrealizedPL} pct={unrealPct} accent={unrealAccent} />
        <PLStat label="Realized P&L" usd={stats.realizedPL} pct={realPct} accent={realAccent} />
        <PLStat label="Total P&L" usd={stats.totalPL} pct={totalPct} accent={totalAccent} />
      </div>
    </div>
  )
}
