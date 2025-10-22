'use client'

import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'

type Epoch = {
  id: string
  user_id: string
  coingecko_id: string
  started_at: string
  anchor_price: number
  top_price: number
  frozen_at: string | null
  is_active: boolean
}

export default function EpochsPanel({ id }: { id: string }) {
  const { user } = useUser()
  const { data: priceData } = useSWR<{ id: string; price: number | null }>(`/api/price/${id}`)
  const [active, setActive] = useState<Epoch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!user) { setActive(null); setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error } = await supabaseBrowser
      .from('epochs')
      .select('*')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .eq('is_active', true)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') setError(error.message) // ignore "no rows" code
    setActive((data as any) ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [user, id])

  async function startEpoch() {
    if (!user) return
    const anchor = priceData?.price ?? 0
    const payload = {
      user_id: user.id,
      coingecko_id: id,
      anchor_price: anchor,
      top_price: anchor,
      is_active: true,
    }
    const { error } = await supabaseBrowser.from('epochs').insert(payload)
    if (error) setError(error.message)
    else load()
  }

  async function markNewTop() {
    if (!user || !active) return
    const p = priceData?.price ?? null
    if (!p || p <= Number(active.top_price)) return
    const { error } = await supabaseBrowser
      .from('epochs')
      .update({ top_price: p })
      .eq('id', active.id)
      .eq('user_id', user.id)
    if (error) setError(error.message)
    else load()
  }

  async function freezeEpoch() {
    if (!user || !active) return
    const { error } = await supabaseBrowser
      .from('epochs')
      .update({ is_active: false, frozen_at: new Date().toISOString() })
      .eq('id', active.id)
      .eq('user_id', user.id)
    if (error) setError(error.message)
    else load()
  }

  async function startNewEpoch() {
    if (!user) return
    const anchor = priceData?.price ?? 0
    const payload = {
      user_id: user.id,
      coingecko_id: id,
      anchor_price: anchor,
      top_price: anchor,
      is_active: true,
    }
    const { error } = await supabaseBrowser.from('epochs').insert(payload)
    if (error) setError(error.message)
    else load()
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4 space-y-3 min-w-0 w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-medium">Epochs (Freeze on New Top)</h2>
        <div className="text-xs text-slate-400">
          Live price: {priceData?.price ? fmtCurrency(priceData.price) : '…'}
        </div>
      </div>

      {loading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-rose-400">Error: {error}</div>}

      {!user && (
        <p className="text-sm text-slate-400">Sign in to manage epochs.</p>
      )}

      {user && !active && !loading && (
        <div className="flex items-center justify-between rounded-lg border border-[#081427] p-3">
          <div className="text-sm text-slate-300">No active epoch.</div>
          <button onClick={startEpoch} className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2">
            Start Epoch (anchor = live price)
          </button>
        </div>
      )}

      {user && active && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Info label="Started" value={new Date(active.started_at).toLocaleString()} />
            <Info label="Anchor" value={fmtCurrency(Number(active.anchor_price))} />
            <Info label="Top" value={fmtCurrency(Number(active.top_price))} />
            <Info label="Frozen" value={active.frozen_at ? new Date(active.frozen_at).toLocaleString() : '—'} />
            <Info label="Status" value={active.is_active ? 'Active' : 'Frozen'} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={markNewTop}
              className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
              disabled={!priceData?.price || !active?.is_active}
              title="Set Top to current live price if higher than current top"
            >
              Mark New Top
            </button>
            <button
              onClick={freezeEpoch}
              className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
              disabled={!active?.is_active}
            >
              Freeze Epoch
            </button>
            <button
              onClick={startNewEpoch}
              className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
              disabled={!!active?.is_active}
            >
              Start New Epoch
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Tip: Freeze an epoch at a new top, then start a new epoch anchored to the current price.
            (We’ll add “Save New Ladder” cloning in the next step.)
          </p>
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

