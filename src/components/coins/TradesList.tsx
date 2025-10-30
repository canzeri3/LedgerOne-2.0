'use client'

import React, { useEffect, useMemo, useState } from 'react'
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

  // === Visual-only grouping: by day ===
  const groups = useMemo(() => {
    const out: Array<{ dayKey: string; items: Row[] }> = []
    const map = new Map<string, Row[]>()

    ;(rows ?? []).forEach(r => {
      const d = new Date(r.trade_time)
      const key = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` // e.g., 4/8/2025
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })

    for (const [dayKey, items] of map.entries()) {
      out.push({ dayKey, items })
    }
    return out
  }, [rows])

  const coinLabel = useMemo(() => {
    // Purely visual: derive a readable label from the coingecko_id
    return (id || '').replace(/-/g, ' ').toUpperCase()
  }, [id])

  return (
    <div className="rounded-2xl border bg-[rgb(28,29,31)] border-[rgb(28,29,31)] p-4 space-y-4 w-full">
      {/* Card title + count */}
      <div className="flex items-center justify-between gap-3">
      <h3 className="text-lg font-bold text-slate-200">Recent Trades</h3>
        <div className="text-xs rounded-md border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ring-1 ring-slate-600/30 px-2 py-1 text-slate-300">
          {isLoading ? 'Loading…' : `${rows?.length ?? 0} shown`}
        </div>
      </div>

    {/* Column header — shown once (desktop only) */}
<div className="hidden md:grid md:grid-cols-12 text-[11px] uppercase tracking-wide text-slate-400">
  <div className="col-span-1">Side</div>
  <div className="col-span-2">Time</div>
  <div className="col-span-2">Coin name</div>   {/* was 3, now 2 to make room */}
  <div className="col-span-2">Quantity</div>
  <div className="col-span-2">Price (USD)</div>
  <div className="col-span-1">Fee</div>
  <div className="col-span-1 text-right">Total</div>
  <div className="col-span-1 text-right">Delete</div>
</div>


      {/* Groups: no spacing between day sections */}
      <div className="space-y-0">
        {groups.map(({ dayKey, items }) => (
          <div key={dayKey} className="space-y-0">
            {/* Date row: full-width, larger, ring on y-axis only */}
       {/* Date row: edge-to-edge, with only top & bottom borders (no ring) */}
<div className="w-[calc(100%+2rem)] -ml-4 pl-4 bg-[rgb(32,33,35)] text-slate-300 py-2.5 border-t border-b border-[rgb(51,52,54)]">
  {dayKey}
</div>



            {/* Day rows: full-width and touching the date row */}
            <div className="space-y-0">
              {items.map((r, idx) => {
                const isBuy = String(r.side).toLowerCase().startsWith('b')
                const qty = Number(r.quantity) || 0
                const price = Number(r.price) || 0
                const fee = Number(r.fee) || 0
                const total = qty * price + (isBuy ? fee : -fee)

                const d = new Date(r.trade_time)
                const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                return (
                  <div
                    key={r.id}
                    className={`
                      relative -mx-4 px-4 py-4
                      bg-[rgb(28,29,31)] rounded-none
                      ${idx === 0 ? 'border-t-0' : 'border-t border-[rgb(55,56,57)]'}

                    `}
                  >
                  

{/* Desktop grid row: matches the single header above */}
<div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-2 text-sm">
  {/* Side */}
  <div className="col-span-1">
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${
        isBuy
        ? 'bg-[rgba(113,190,90,0.15)] text-[rgb(113,190,90)] ring-[rgb(113,190,90)]/30'
        : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
        
      }`}
    >
      {isBuy ? 'Buy' : 'Sell'}
    </span>
  </div>

  {/* Time */}
  <div className="col-span-2 text-slate-300 tabular-nums">{timeLabel}</div>

  {/* Coin name */}
  <div className="col-span-2 text-slate-200">{coinLabel}</div>

  {/* Quantity */}
  <div className="col-span-2 text-slate-200 tabular-nums">
    {qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}
  </div>

  {/* Price */}
  <div className="col-span-2 text-slate-200 tabular-nums">{fmtCurrency(price)}</div>

  {/* Fee */}
  <div className="col-span-1 text-slate-300 tabular-nums">{fee ? fmtCurrency(fee) : '—'}</div>

  {/* Total */}
  <div className={`col-span-1 text-right tabular-nums ${isBuy ? 'text-[rgb(105,167,78)]' : 'text-[rgb(180,55,53)]'}`}>

    {isBuy ? '+' : '-'}{fmtCurrency(Math.abs(total))}
  </div>

  {/* Delete */}
  <div className="col-span-1 flex justify-end">
    <button
      type="button"
      title="Delete trade"
      onClick={() => deleteTrade(r.id)}
      disabled={deletingId === r.id}
      className={`rounded-md p-1 ring-1 ring-slate-700/30 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 ${
        deletingId === r.id ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  </div>
</div>


                    {/* Mobile stacked */}
                    <div className="md:hidden text-sm text-slate-200 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                            isBuy
                              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
                          }`}
                        >
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                        <div className="text-slate-300">{timeLabel}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        <div className="text-slate-400 text-xs">Coin</div>
                        <div>{coinLabel}</div>

                        <div className="text-slate-400 text-xs">Qty</div>
                        <div className="tabular-nums">
                          {qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                        </div>

                        <div className="text-slate-400 text-xs">Price</div>
                        <div className="tabular-nums">{fmtCurrency(price)}</div>

                        <div className="text-slate-400 text-xs">Fee</div>
                        <div className="tabular-nums">{fee ? fmtCurrency(fee) : '—'}</div>

                        <div className="text-slate-400 text-xs">Total</div>
                        <div className={`tabular-nums ${isBuy ? 'text-[rgb(105,167,78)]' : 'text-[rgb(180,55,53)]'}`}>
                          {isBuy ? '+' : '-'}{fmtCurrency(Math.abs(total))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
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
