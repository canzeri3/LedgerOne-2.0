'use client'

import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency, fmtPct } from '@/lib/format'

type Level = {
  id: string
  user_id: string
  coingecko_id: string
  epoch_id: string
  level: number
  rise_pct: number | null
  price: number
  sell_pct_of_remaining: number | null
  sell_tokens: number | null
  created_at: string
}

type Epoch = {
  id: string
  user_id: string
  coingecko_id: string
  is_active: boolean
}

export default function SellLevels({ id }: { id: string }) {
  const { user } = useUser()
  const { data: priceData } = useSWR<{ id: string; price: number | null }>(`/api/price/${id}`)
  const [levels, setLevels] = useState<Level[] | null>(null)
  const [activeEpoch, setActiveEpoch] = useState<Epoch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!user) { setLevels(null); setActiveEpoch(null); setLoading(false); return }
    setLoading(true)
    setError(null)

    const { data: epochRow, error: e1 } = await supabaseBrowser
      .from('epochs')
      .select('id, user_id, coingecko_id, is_active')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .eq('is_active', true)
      .maybeSingle()
    if (e1 && e1.code !== 'PGRST116') setError(e1.message)
    setActiveEpoch((epochRow as any) ?? null)

    const q = supabaseBrowser
      .from('sell_levels')
      .select('*')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .order('level', { ascending: true })

    const { data: lvRows, error: e2 } = activeEpoch
      ? await q.eq('epoch_id', (epochRow as any)?.id ?? null)
      : await q.is('epoch_id', null)
    if (e2) setError(e2.message)

    setLevels((lvRows ?? []) as any)
    setLoading(false)
  }

  useEffect(() => { load() }, [user, id])

  const withinTol = (target: number, tol = 0.05) => {
    const p = priceData?.price
    if (!p || !target) return false
    const diff = Math.abs(p - target) / target
    return diff <= tol
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-[#081427] p-4">
        <h2 className="font-medium mb-2">Take-Profit Ladder</h2>
        <p className="text-sm text-slate-400">Sign in to create and view your sell levels for this coin.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#081427] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Take-Profit Ladder</h2>
          <div className="text-xs text-slate-400">
            Live price: {priceData?.price ? fmtCurrency(priceData.price) : '…'}
          </div>
        </div>

        {loading && <div className="text-sm text-slate-400">Loading…</div>}
        {error && <div className="text-sm text-rose-400">Error: {error}</div>}
        {!activeEpoch && (
          <div className="text-xs text-amber-300 mb-2">
            No active epoch yet — new levels will be stored without an epoch until you start one.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-slate-300">
              <tr className="text-left">
                <th className="py-2 pr-2 whitespace-nowrap">#</th>
                <th className="py-2 pr-2 whitespace-nowrap">Target Price</th>
                <th className="py-2 pr-2 whitespace-nowrap">Rise</th>
                <th className="py-2 pr-2 whitespace-nowrap">% of Remaining</th>
                <th className="py-2 pr-2 whitespace-nowrap">Tokens</th>
                <th className="py-2 pr-2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {levels?.map((lv) => {
                const hit = withinTol(Number(lv.price))
                return (
                  <tr key={lv.id} className={`${hit ? 'bg-[#0a162c]' : ''} border-t border-[#081427]`}>
                    <td className="py-2 pr-2 whitespace-nowrap">{lv.level}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{fmtCurrency(Number(lv.price))}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {lv.rise_pct != null ? fmtPct(Number(lv.rise_pct) / 100) : '—'}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {lv.sell_pct_of_remaining != null
                        ? fmtPct(Number(lv.sell_pct_of_remaining) / 100)
                        : '—'}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{lv.sell_tokens ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">
                      {hit ? <span className="text-emerald-400">±5% window</span> : <span className="text-slate-500">—</span>}
                    </td>
                  </tr>
                )
              })}
              {levels?.length === 0 && !loading && (
                <tr><td className="py-3 text-slate-400 text-sm" colSpan={6}>No levels yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddLevel id={id} onAdded={load} activeEpochId={activeEpoch?.id ?? null} />
    </div>
  )
}

function AddLevel({ id, onAdded, activeEpochId }: { id: string; onAdded: () => void; activeEpochId: string | null }) {
  const { user } = useUser()
  const [price, setPrice] = useState('')
  const [sellPct, setSellPct] = useState('10')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!user) return
    setSaving(true); setError(null)
    const priceNum = Number(price)
    const sellPctNum = Number(sellPct)
    if (!(priceNum > 0)) { setError('Enter a valid target price'); setSaving(false); return }
    if (!(sellPctNum >= 0 && sellPctNum <= 100)) { setError('Percent must be 0–100'); setSaving(false); return }

    // find next level number scoped to the current epoch (or null scope if no epoch)
    const q = supabaseBrowser
      .from('sell_levels')
      .select('level')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .order('level', { ascending: false })
      .limit(1)

    const { data: maxLv } = activeEpochId
      ? await q.eq('epoch_id', activeEpochId).maybeSingle()
      : await q.is('epoch_id', null).maybeSingle()

    const nextLevel = (maxLv?.level ?? 0) + 1

    const insertPayload: any = {
      user_id: user.id,
      coingecko_id: id,
      level: nextLevel,
      rise_pct: null,
      price: priceNum,
      sell_pct_of_remaining: sellPctNum,
      sell_tokens: null,
    }
    if (activeEpochId) insertPayload.epoch_id = activeEpochId

    const { error } = await supabaseBrowser.from('sell_levels').insert(insertPayload)
    if (error) setError(error.message)
    else {
      setPrice(''); setSellPct('10'); onAdded()
    }
    setSaving(false)
  }

  if (!user) return null

  return (
    <div className="rounded-2xl border border-[#081427] p-4">
      <h3 className="font-medium mb-2">Add a TP Level</h3>
      <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Target price (USD)"
          type="number" step="0.00000001"
          value={price} onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="% of remaining (e.g., 10)"
          type="number" step="0.01" min="0" max="100"
          value={sellPct} onChange={(e) => setSellPct(e.target.value)}
        />
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
        >
          {saving ? 'Saving…' : 'Add Level'}
        </button>
      </div>
      {error && <div className="text-sm text-rose-400 mt-2">{error}</div>}
      <p className="text-xs text-slate-400 mt-2">
        Rows turn green when current price is within ±5% of the target.
      </p>
    </div>
  )
}

