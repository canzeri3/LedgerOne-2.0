'use client'

import React, { useEffect, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import { Trash2 } from 'lucide-react'

type Props = { id: string } // coingecko_id

type Row = {
  id: string
  side: 'buy' | 'sell' | string
  price: number
  quantity: number
  fee: number | null
  trade_time: string
}

const fetchTrades = async (userId: string, coinId: string): Promise<Row[]> => {
  const { data, error } = await supabaseBrowser
    .from('trades')
    .select('id, side, price, quantity, fee, trade_time')
    .eq('user_id', userId)
    .eq('coingecko_id', coinId)
    .order('trade_time', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []) as Row[]
}

export default function TradesList({ id }: Props) {
  const { user } = useUser()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const swrKey = user ? ['coin-trades', user.id, id] : null
  const { data: rows, isLoading } = useSWR<Row[]>(
    swrKey,
    () => fetchTrades(user!.id, id),
    { refreshInterval: 60_000 }
  )

  // Live updates: revalidate when trades change for this coin
  useEffect(() => {
    if (!id) return
    const channel = supabaseBrowser
      .channel(`trades-list-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `coingecko_id=eq.${id}` },
        () => {
          if (swrKey) globalMutate(swrKey)
        }
      )
      .subscribe()
    return () => { supabaseBrowser.removeChannel(channel) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteTrade(tradeId: string) {
    if (!user) return
    const ok = confirm('Delete this trade?')
    if (!ok) return
    try {
      setDeletingId(tradeId)
      const { error } = await supabaseBrowser
        .from('trades')
        .delete()
        .eq('id', tradeId)
        .eq('user_id', user.id) // safety: only delete current user's trade
      if (error) throw error
      if (swrKey) await globalMutate(swrKey)
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ring-1 ring-slate-600/30 p-4 space-y-4 w-full">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">Recent trades</h3>
        <div className="text-xs rounded-md border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ring-1 ring-slate-600/30 px-2 py-1 text-slate-300">
          {isLoading ? 'Loading…' : `${rows?.length ?? 0} shown`}
        </div>
      </div>

      {/* Table header */}
      <div className="hidden md:grid md:grid-cols-12 text-[11px] uppercase tracking-wide text-slate-400">
        <div className="col-span-3">Date</div>
        <div className="col-span-2">Side</div>
        <div className="col-span-2">Quantity</div>
        <div className="col-span-2">Price (USD)</div>
        <div className="col-span-1">Fee</div>
        <div className="col-span-2 text-right">Total</div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {(rows ?? []).map((r) => {
          const isBuy = String(r.side).toLowerCase().startsWith('b')
          const qty = Number(r.quantity) || 0
          const price = Number(r.price) || 0
          const fee = Number(r.fee) || 0
          const total = qty * price + (isBuy ? fee : -fee)

          return (
            <div
              key={r.id}
              className="relative rounded-xl border border-slate-700/30 bg-slate-900/30 ring-1 ring-slate-700/30 pl-3 pr-12 py-2"
            >
              {/* Delete button (absolute; reserved space via pr-12) */}
              <button
                type="button"
                title="Delete trade"
                onClick={() => deleteTrade(r.id)}
                disabled={deletingId === r.id}
                className={`absolute right-2 top-2 rounded-md p-1 ring-1 ring-slate-700/30 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10
                  ${deletingId === r.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>

              {/* Desktop grid */}
              <div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-2 text-sm">
                <div className="col-span-3 text-slate-300">
                  {new Date(r.trade_time).toLocaleString()}
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${
                    isBuy
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
                  }`}>
                    {isBuy ? 'Buy' : 'Sell'}
                  </span>
                </div>
                <div className="col-span-2 text-slate-200 tabular-nums">{qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div>
                <div className="col-span-2 text-slate-200 tabular-nums">{fmtCurrency(price)}</div>
                <div className="col-span-1 text-slate-300 tabular-nums">{fee ? fmtCurrency(fee) : '—'}</div>
                <div className={`col-span-2 text-right tabular-nums ${isBuy ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {isBuy ? '+' : '-'}{fmtCurrency(Math.abs(total))}
                </div>
              </div>

              {/* Mobile stacked */}
              <div className="md:hidden text-sm text-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-slate-300">{new Date(r.trade_time).toLocaleString()}</div>
                  <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                    isBuy
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
                  }`}>
                    {isBuy ? 'Buy' : 'Sell'}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <div className="text-slate-400 text-xs">Qty</div>
                  <div className="tabular-nums">{qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div>
                  <div className="text-slate-400 text-xs">Price</div>
                  <div className="tabular-nums">{fmtCurrency(price)}</div>
                  <div className="text-slate-400 text-xs">Fee</div>
                  <div className="tabular-nums">{fee ? fmtCurrency(fee) : '—'}</div>
                  <div className="text-slate-400 text-xs">Total</div>
                  <div className={`tabular-nums ${isBuy ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {isBuy ? '+' : '-'}{fmtCurrency(Math.abs(total))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      {!isLoading && (!rows || rows.length === 0) && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/30 ring-1 ring-slate-700/30 px-3 py-2 text-sm text-slate-400">
          No trades yet.
        </div>
      )}
    </div>
  )
}

