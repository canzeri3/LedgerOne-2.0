'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import { History, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'

type CoinMeta = { coingecko_id: string; symbol: string; name: string }

type Row = {
  id: string
  coingecko_id: string
  side: 'buy' | 'sell' | string
  price: number
  quantity: number
  fee: number | null
  trade_time: string
}

const COLLAPSED = 5
const EXPANDED = 50

const POS = 'rgb(116,170,98)'
const NEG = 'rgb(214,66,78)'

async function fetchRecentTrades(userId: string, limit: number): Promise<Row[]> {
  // One extra row tells us whether anything is hidden, without a second count query.
  const { data, error } = await supabaseBrowser
    .from('trades')
    .select('id, coingecko_id, side, price, quantity, fee, trade_time')
    .eq('user_id', userId)
    .order('trade_time', { ascending: false })
    .limit(limit + 1)

  if (error) throw error
  return (data ?? []) as Row[]
}

/** "crypto-com-chain" → "Crypto Com Chain" when we have no coin metadata for it. */
function fallbackName(coinId: string): string {
  return (coinId || '')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 })
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Phone transactions list: icon badge, action + date, signed quantity and fiat value.
 * Rows link through to the coin page, which is where trades are edited.
 */
export default function MobileTransactions({ coins }: { coins?: CoinMeta[] }) {
  const { user } = useUser()
  const [limit, setLimit] = useState(COLLAPSED)

  const { data: rows, isLoading } = useSWR<Row[]>(
    user ? ['mobile-trades/recent', user.id, limit] : null,
    () => fetchRecentTrades(user!.id, limit),
    { refreshInterval: 60_000, keepPreviousData: true }
  )

  // Keep the list live when trades change elsewhere (coin page, import, delete).
  useEffect(() => {
    if (!user?.id) return

    const channel = supabaseBrowser
      .channel(`mobile-trades-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` },
        () => {
          globalMutate(
            key => Array.isArray(key) && key[0] === 'mobile-trades/recent' && key[1] === user.id
          )
        }
      )
      .subscribe()

    return () => {
      supabaseBrowser.removeChannel(channel)
    }
  }, [user?.id])

  const tickerById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of coins ?? []) {
      const id = String(c.coingecko_id ?? '').trim().toLowerCase()
      const sym = String(c.symbol ?? '').trim().toUpperCase()
      if (id && sym) m.set(id, sym)
    }
    return m
  }, [coins])

  const visible = useMemo(() => (rows ?? []).slice(0, limit), [rows, limit])
  const hasMore = Boolean(rows && rows.length > limit)
  const expanded = limit > COLLAPSED

  return (
    <div className="border-t border-[rgb(41,42,45)] pt-4">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-1">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h2 className="text-[15px] font-medium text-slate-100">Transactions</h2>
        </div>

        {(hasMore || expanded) && (
          <button
            type="button"
            onClick={() => setLimit(expanded ? COLLAPSED : EXPANDED)}
            className="select-none text-[14px] font-medium text-[rgb(137,128,213)] focus:outline-none"
          >
            {expanded ? 'Show less' : 'Show all'}
          </button>
        )}
      </div>

      {/* Rows */}
      {visible.length === 0 ? (
        <div className="px-5 py-4 text-[12.5px] text-slate-400">
          {isLoading ? 'Loading transactions…' : 'No transactions yet.'}
        </div>
      ) : (
        <ul className="mt-1">
          {visible.map(r => {
            const isBuy = String(r.side).toLowerCase() !== 'sell'
            const ticker =
              tickerById.get(String(r.coingecko_id).trim().toLowerCase()) ??
              fallbackName(r.coingecko_id)
            const qty = Number(r.quantity ?? 0)
            const total = qty * Number(r.price ?? 0)
            const Icon = isBuy ? ArrowDownLeft : ArrowUpRight

            return (
              <li key={r.id}>
                <Link
                  href={`/coins/${r.coingecko_id}`}
                  className="flex items-center gap-3.5 px-5 py-3.5 transition-colors active:bg-[rgb(32,33,35)]"
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[rgb(38,39,42)]"
                    aria-hidden="true"
                  >
                    <Icon className="h-[18px] w-[18px]" style={{ color: isBuy ? POS : NEG }} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-slate-100">
                      {isBuy ? 'Bought' : 'Sold'} {ticker}
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-slate-500">
                      {fmtDay(r.trade_time)}
                    </div>
                  </div>

                  <div className="flex-none text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <div className="text-[15px] font-medium" style={{ color: isBuy ? POS : NEG }}>
                      {isBuy ? '+' : '-'}
                      {fmtQty(Math.abs(qty))} {ticker}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-slate-500">{fmtCurrency(total)}</div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
