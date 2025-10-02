'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'

type DbTrade = {
  id: string
  user_id: string
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  created_at: string
}

export default function TradeLogs({ id }: { id: string }) {
  const { user } = useUser()
  const [trades, setTrades] = useState<DbTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) { setTrades([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabaseBrowser
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .order('trade_time', { ascending: true })
    if (error) setError(error.message)
    setTrades((data ?? []) as DbTrade[])
    setLoading(false)
  }, [id, user])

  useEffect(() => { void load() }, [load])

  if (!user) {
    return (
      <div className="rounded-2xl border border-[#081427] p-4">
        <h2 className="font-medium">Trade Log</h2>
        <p className="text-sm text-slate-400">Sign in to view your trades.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4 space-y-3 min-w-0 w-full">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Trade Log</h2>
        <div className="text-xs text-slate-500">{trades.length} row(s)</div>
      </div>

      {loading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-rose-400">Error: {error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-slate-300">
            <tr className="text-left">
              <th className="py-2 pr-2">Time</th>
              <th className="py-2 pr-2">Side</th>
              <th className="py-2 pr-2">Price</th>
              <th className="py-2 pr-2">Qty</th>
              <th className="py-2 pr-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {trades.map(t => (
              <tr key={t.id} className="border-t border-[#081427]">
                <td className="py-2 pr-2 text-slate-300 whitespace-nowrap">
                  {new Date(t.trade_time).toLocaleString()}
                </td>
                <td className="py-2 pr-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${t.side === 'buy' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'}`}>
                    {t.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 pr-2">{fmtCurrency(Number(t.price))}</td>
                <td className="py-2 pr-2">{Number(t.quantity).toFixed(8)}</td>
                <td className="py-2 pr-2">{t.fee != null ? fmtCurrency(Number(t.fee)) : '—'}</td>
              </tr>
            ))}
            {trades.length === 0 && !loading && (
              <tr><td className="py-3 text-slate-400 text-sm" colSpan={5}>No trades yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

