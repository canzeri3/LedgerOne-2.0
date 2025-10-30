'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtCurrency, fmtPct } from '@/lib/format'
import CoinLogo from '@/components/common/CoinLogo'

export type Point = { t: number; v: number }
type TradeLite = { coingecko_id: string; side: 'buy' | 'sell'; quantity: number; trade_time: string }
type CoinMeta = { coingecko_id: string; symbol: string; name: string }

type Props = {
  coinIds: string[]
  historiesMapLive: Record<string, Point[]>
  trades: TradeLite[] | undefined
  coins?: CoinMeta[] | undefined
}

/** Brand color map (ids & symbols). Extend anytime without touching the UI. */
function coinColor(idOrSymbol: string): string {
  const k = idOrSymbol.toLowerCase()
  const map: Record<string, string> = {
    bitcoin: '#F7931A', btc: '#F7931A',
    ethereum: '#6C5CE7', eth: '#6C5CE7', weth: '#6C5CE7',
    tether: '#26A17B', usdt: '#26A17B',
    usdcoin: '#2775CA', usdc: '#2775CA',
    binancecoin: '#F3BA2F', bnb: '#F3BA2F',
    solana: '#14F195', sol: '#14F195',
    cardano: '#0033AD', ada: '#0033AD',
    ripple: '#23292F', xrp: '#23292F',
    dogecoin: '#C2A633', doge: '#C2A633',
    polygon: '#8247E5', matic: '#8247E5',
    near: '#00D19D', 'near-protocol': '#00D19D',
    default: '#06B6D4',
  }
  return map[k] ?? map.default
}

/** Mini progress bar with coin color (compact). */
function MiniProgress({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(1, pct || 0))
  return (
    <div className="h-1.5 rounded-full bg-[rgb(56,57,60)] w-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${(clamped * 100).toFixed(2)}%`, backgroundColor: color }}
      />
    </div>
  )
}

/** Dashboard table of user holdings by asset. Pure UI + props; no extra network calls. */
export default function PortfolioHoldingsTable({ coinIds, historiesMapLive, trades, coins }: Props) {
  const router = useRouter()

  const rows = useMemo(() => {
    const qty = new Map<string, number>()
    coinIds.forEach(id => qty.set(id, 0))
    for (const tr of (trades ?? [])) {
      const cur = qty.get(tr.coingecko_id) ?? 0
      qty.set(tr.coingecko_id, cur + (tr.side === 'buy' ? tr.quantity : -tr.quantity))
    }

    const out: Array<{
      id: string
      symbol: string
      name: string
      price: number | null
      amount: number
      value: number
    }> = []

    for (const id of coinIds) {
      const series = historiesMapLive[id] ?? []
      const last = series.length ? series[series.length - 1].v : null
      const amount = qty.get(id) ?? 0
      const price = (last != null && Number.isFinite(last)) ? last : null
      const value = (price != null && Number.isFinite(amount)) ? price * amount : 0
      const meta = (coins ?? []).find(c => c.coingecko_id === id)
      out.push({
        id,
        symbol: (meta?.symbol || id).toUpperCase(),
        name: meta?.name || id,
        price,
        amount,
        value,
      })
    }

    const filtered = out.filter(r => (r.amount || 0) !== 0 || (r.value || 0) !== 0 || r.price != null)
    filtered.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const total = filtered.reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0)
    return { rows: filtered, total }
  }, [coinIds.join(','), historiesMapLive, trades, coins])

  if (!rows.rows.length) {
    return <div className="p-3 text-slate-300 text-[12px]">No holdings to display yet. Add your first trade to see this table.</div>
  }

  return (
    <div className="w-full overflow-hidden">
      {/* Fixed layout + precise colgroup to center Allocation (no whitespace in colgroup!) */}
      <table className="w-full text-left border-collapse table-fixed text-[14px]">
        <colgroup><col style={{width:'22ch'}}/><col style={{width:'16ch'}}/><col/><col style={{width:'16ch'}}/><col style={{width:'22ch'}}/></colgroup>

        <thead className="border-y border-y-[rgb(41,42,45)] bg-[rgb(32,33,35)]">
          <tr className="text-slate-300 text-[12px] uppercase tracking-wide">
            <th className="px-3 py-2 font-medium">Asset</th>
            <th className="px-3 py-2 font-medium text-left">Price</th>
            <th className="px-3 py-2 font-medium text-center">Allocation</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
            <th className="px-3 py-2 font-medium text-right">Value</th>
          </tr>
        </thead>

        <tbody>
          {rows.rows.map((r, idx) => {
            const pct = rows.total > 0 ? (r.value / rows.total) : 0
            const color = coinColor(r.id || r.symbol)

            const go = () => router.push(`/coins/${r.id}`)
            const onKey = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                go()
              }
            }

            return (
              <tr
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={go}
                onKeyDown={onKey}
                className={`outline-none cursor-pointer transition-colors duration-150
                  ${idx % 2 ? 'bg-[rgb(32,33,35)]' : ''}
                  hover:bg-[rgb(19,20,21)] focus:bg-[rgb(19,20,21)]`}
                aria-label={`Open ${r.name} details`}
              >
                {/* ASSET */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CoinLogo symbol={r.symbol} name={r.name} className="h-6 w-6 flex-none" />
                    <div className="flex flex-col leading-tight min-w-0">
                      {/* Keeping the link for SEO and standard behavior; row click also navigates */}
                      <Link
                        href={`/coins/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[14px] font-semibold text-slate-100 hover:underline truncate"
                        title={r.name}
                      >
                        {r.name}
                      </Link>
                      <span className="text-[11px] text-slate-400 uppercase">{r.symbol}</span>
                    </div>
                  </div>
                </td>

                {/* PRICE */}
                <td className="px-3 py-2 whitespace-nowrap text-[rgb(157,158,159)] text-left">
                  {r.price != null ? fmtCurrency(r.price) : '—'}
                </td>

                {/* ALLOCATION (centered exactly; % snug to bar) */}
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-0">
                    <span className="text-slate-300 text-[13px] leading-none mr-[2px]">
                      {fmtPct(pct)}
                    </span>
                    <div className="w-40 md:w-56 max-w-full">
                      <MiniProgress pct={pct} color={color} />
                    </div>
                  </div>
                </td>

                {/* AMOUNT (fixed position right edge, with space before ticker) */}
                <td className="px-3 py-2">
                  <div className="w-[16ch] ml-auto text-right whitespace-nowrap tabular-nums">
                    {Number.isFinite(r.amount)
                      ? `${r.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${r.symbol}`
                      : '—'}
                  </div>
                </td>

                {/* VALUE */}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {fmtCurrency(r.value)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
