'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import { Trash2 } from 'lucide-react'

type Props = { id: string } // coingecko_id

type TradeRow = {
  id: string
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  buy_planner_id: string | null
  sell_planner_id: string | null
}

export default function TradesList({ id }: Props) {
  const { user } = useUser()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR<TradeRow[]>(
    user ? ['/coin/trades', user.id, id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('id,coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', id)
        .order('trade_time', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []).map(t => ({
        id: String(t.id),
        coingecko_id: t.coingecko_id,
        side: t.side as 'buy'|'sell',
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: t.fee ?? 0,
        trade_time: t.trade_time,
        buy_planner_id: t.buy_planner_id ?? null,
        sell_planner_id: t.sell_planner_id ?? null,
      }))
    }
  )

  async function onDelete(tr: TradeRow) {
    if (!user) return
    setErrorMsg(null)

    const ok = window.confirm(
      `Delete this ${tr.side.toUpperCase()} trade?\n\n` +
      `Time: ${new Date(tr.trade_time).toLocaleString()}\n` +
      `Price: ${fmtCurrency(tr.price)}\n` +
      `Qty: ${tr.quantity}`
    )
    if (!ok) return

    setBusyId(tr.id)
    try {
      const { error } = await supabaseBrowser
        .from('trades')
        .delete()
        .eq('user_id', user.id)
        .eq('id', tr.id)

      if (error) throw error

      // Optimistic refresh
      mutate()
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to delete trade')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-300">
          Recent Trades
          {data && <span className="text-xs text-slate-500 ml-2">({data.length})</span>}
        </div>
        {errorMsg && <div className="text-xs text-rose-400">{errorMsg}</div>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-slate-300">
            <tr className="text-left">
              <th className="py-2 pr-2">Time</th>
              <th className="py-2 pr-2">Side</th>
              <th className="py-2 pr-2">Price</th>
              <th className="py-2 pr-2">Qty</th>
              <th className="py-2 pr-2">Fee</th>
              <th className="py-2 pr-2">Total</th>
              <th className="py-2 pr-2">Planner Tags</th>
              <th className="py-2 pr-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="py-3 text-slate-400" colSpan={8}>Loading…</td></tr>
            )}
            {!isLoading && (!data || data.length === 0) && (
              <tr><td className="py-3 text-slate-400" colSpan={8}>No trades yet.</td></tr>
            )}
            {data?.map(tr => {
              const total = tr.side === 'buy'
                ? (tr.price * tr.quantity) + (tr.fee ?? 0)
                : (tr.price * tr.quantity) - (tr.fee ?? 0)
              return (
                <tr key={tr.id} className="border-t border-[#081427]">
                  <td className="py-2 pr-2">{new Date(tr.trade_time).toLocaleString()}</td>
                  <td className={`py-2 pr-2 font-medium ${tr.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tr.side.toUpperCase()}
                  </td>
                  <td className="py-2 pr-2">{fmtCurrency(tr.price)}</td>
                  <td className="py-2 pr-2">{tr.quantity.toFixed(8)}</td>
                  <td className="py-2 pr-2">{tr.fee ? fmtCurrency(tr.fee) : '—'}</td>
                  <td className="py-2 pr-2">{fmtCurrency(total)}</td>
                  <td className="py-2 pr-2 text-xs text-slate-400">
                    {tr.buy_planner_id ? `Buy#${tr.buy_planner_id.slice(0,6)}… ` : ''}
                    {tr.sell_planner_id ? `Sell#${tr.sell_planner_id.slice(0,6)}…` : ''}
                    {!tr.buy_planner_id && !tr.sell_planner_id ? '—' : ''}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onDelete(tr)}
                        disabled={busyId === tr.id}
                        title="Delete trade"
                        aria-label="Delete trade"
                        className="rounded-md border border-[#0b1830] px-2 py-1.5 text-xs hover:bg-[#0a162c] disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        {busyId === tr.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

