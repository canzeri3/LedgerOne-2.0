'use client'

import React, { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import { useDisplayCurrency } from '@/lib/displayCurrency'
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
  const { code: displayCode } = useDisplayCurrency()
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

      // Fetch minimal metadata so we can refresh the correct planner caches
      const { data: meta, error: metaErr } = await supabaseBrowser
        .from('trades')
        .select('side,buy_planner_id,sell_planner_id')
        .eq('id', tradeId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (metaErr) throw metaErr

      const buyPlannerId = (meta as any)?.buy_planner_id ?? null
      const sellPlannerId = (meta as any)?.sell_planner_id ?? null

      // Delete (scoped to current user)
      const { error } = await supabaseBrowser
        .from('trades')
        .delete()
        .eq('id', tradeId)
        .eq('user_id', user.id)
      if (error) throw error

      // Refresh the recent trades list
      if (swrKey) await globalMutate(swrKey)

      // Refresh planner/ladders that depend on trades
      const uid = user.id
      const cid = id

      void globalMutate(['/buy-planner/active', uid, cid])
      void globalMutate(['/buy-planner/active-ladder', uid, cid])
      if (buyPlannerId) {
        void globalMutate(['/trades/buys/by-planner', uid, cid, buyPlannerId])
        void globalMutate(['/trades/buys/for-ladder', uid, cid, buyPlannerId])
      }

      void globalMutate(['/sell-active', uid, cid])
      if (sellPlannerId) {
        void globalMutate(['/sell-levels', uid, cid, sellPlannerId])
        void globalMutate(['/sells', uid, cid, sellPlannerId])
      }

      // Broadcast to any listeners (including holdings refresh in TradesPanel)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('buyPlannerUpdated', { detail: { coinId: id } }))
        window.dispatchEvent(new CustomEvent('sellPlannerUpdated', { detail: { coinId: id } }))
      }
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
    <section className="card w-full">
      {/* Card title + count */}
      <div className="card-h">
        <div>
          <span className="card-title">Recent Trades</span>
          <span className="card-sub">{coinLabel} only</span>
        </div>
        <span className="count-chip">
          {isLoading ? 'Loading…' : `${rows?.length ?? 0} shown`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Side</th>
              <th>Time</th>
              <th className="num">Quantity</th>
              <th className="num">Price ({displayCode})</th>
              <th className="num">Fee</th>
              <th className="num">Total</th>
              <th style={{ width: 40 }} aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {groups.map(({ dayKey, items }) => (
              <React.Fragment key={dayKey}>
                {/* Date group row */}
                <tr>
                  <td className="date-cell" colSpan={7}>{dayKey}</td>
                </tr>

                {items.map((r) => {
                  const isBuy = String(r.side).toLowerCase().startsWith('b')
                  const qty = Number(r.quantity) || 0
                  const price = Number(r.price) || 0
                  const fee = Number(r.fee) || 0
                  const total = qty * price + (isBuy ? fee : -fee)

                  const d = new Date(r.trade_time)
                  const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                  return (
                    <tr key={r.id}>
                      <td>
                        <span className={`side-chip ${isBuy ? 'buy' : 'sell'}`}>
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                      </td>
                      <td className="muted tabular-nums">{timeLabel}</td>
                      <td className="num">
                        {qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                      </td>
                      <td className="num muted">{fmtCurrency(price)}</td>
                      <td className="num muted">{fee ? fmtCurrency(fee) : '—'}</td>
                      <td className={`num ${isBuy ? 'pos' : 'neg'}`}>
                        {isBuy ? '+' : '-'}{fmtCurrency(Math.abs(total))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          title="Delete trade"
                          onClick={() => deleteTrade(r.id)}
                          disabled={deletingId === r.id}
                          className={`row-del ${deletingId === r.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}

            {/* Empty state */}
            {!isLoading && (!rows || rows.length === 0) && (
              <tr>
                <td colSpan={7}>
                  <div className="py-8 text-center text-sm text-slate-400">No trades yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
