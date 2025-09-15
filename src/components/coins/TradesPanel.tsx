'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

type PlannerId = string

type BuyPlanner = {
  id: PlannerId
  user_id: string
  coingecko_id: string
  is_active: boolean
  started_at: string
}

type SellPlanner = {
  id: PlannerId
  user_id: string
  coingecko_id: string
  is_active: boolean
  created_at: string
  frozen_at: string | null
}

type Props = { id: string } // coin id

export default function TradesPanel({ id }: Props) {
  const { user } = useUser()

  // form state
  const [side, setSide] = useState<'buy'|'sell'>('buy')
  const [price, setPrice] = useState<string>('')
  const [qty, setQty] = useState<string>('')
  const [fee, setFee] = useState<string>('0')
  const [time, setTime] = useState<string>(() => new Date().toISOString().slice(0,16)) // yyyy-mm-ddThh:mm

  // planners
  const [activeBuy, setActiveBuy] = useState<BuyPlanner | null>(null)
  const [activeSell, setActiveSell] = useState<SellPlanner | null>(null)
  const [sellPlanners, setSellPlanners] = useState<SellPlanner[]>([])
  const [selectedSellPlannerId, setSelectedSellPlannerId] = useState<PlannerId>('')

  // ui state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  function broadcast() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('buyPlannerUpdated',  { detail: { coinId: id } }))
      window.dispatchEvent(new CustomEvent('sellPlannerUpdated', { detail: { coinId: id } }))
    }
  }

  async function loadPlanners() {
    if (!user) { setActiveBuy(null); setActiveSell(null); setSellPlanners([]); setSelectedSellPlannerId(''); setLoading(false); return }
    setLoading(true); setErr(null); setOk(null)

    const [{ data: bp, error: e1 }, { data: spAll, error: e2 }] = await Promise.all([
      supabaseBrowser
        .from('buy_planners')
        .select('*')
        .eq('user_id', user.id)
        .eq('coingecko_id', id)
        .eq('is_active', true)
        .maybeSingle(),
      supabaseBrowser
        .from('sell_planners')
        .select('id,user_id,coingecko_id,is_active,created_at,frozen_at')
        .eq('user_id', user.id)
        .eq('coingecko_id', id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
    ])

    if (e1 && e1.code !== 'PGRST116') setErr(e1.message)
    if (e2) setErr(e2.message)

    const activeB = (bp as any) ?? null
    setActiveBuy(activeB)

    const allSP = (spAll ?? []) as SellPlanner[]
    setSellPlanners(allSP)
    const activeS = allSP.find(p => p.is_active) ?? null
    setActiveSell(activeS)

    // for sell form default selection
    setSelectedSellPlannerId(activeS?.id ?? '')
    setLoading(false)
  }

  useEffect(() => { loadPlanners() }, [user, id])

  const canSubmit = useMemo(() => {
    const p = Number(price), q = Number(qty)
    if (!(p > 0) || !(q > 0)) return false
    if (!user) return false
    if (side === 'buy') return !!activeBuy // require active buy plan to tag correctly
    if (side === 'sell') return !!(selectedSellPlannerId || activeSell?.id)
    return false
  }, [user, side, price, qty, activeBuy, activeSell?.id, selectedSellPlannerId])

  async function submitTrade() {
    if (!user) return
    setSaving(true); setErr(null); setOk(null)

    const trade_time_iso = toIso(time)

    if (side === 'buy') {
      // BUY: tag to active Buy Planner and active Sell Planner (if present)
      if (!activeBuy) { setErr('No active Buy Planner for this coin. Create one with Save New.'); setSaving(false); return }

      const payload = {
        user_id: user.id,
        coingecko_id: id,
        side: 'buy',
        price: Number(price),
        quantity: Number(qty),
        fee: Number(fee || 0),
        trade_time: trade_time_iso,
        buy_planner_id: activeBuy.id,
        sell_planner_id: activeSell?.id ?? null, // buys count toward the active Sell epoch’s pool/avg
      }

      const { error } = await supabaseBrowser.from('trades').insert(payload as any)
      if (error) { setErr(error.message); setSaving(false); return }
      setOk('Buy recorded.')
      broadcast()
      resetAfterSubmit()
    } else {
      // SELL: default to active sell planner, allow override via dropdown
      const chosen = selectedSellPlannerId || activeSell?.id || null
      if (!chosen) { setErr('No Sell Planner selected.'); setSaving(false); return }

      const payload = {
        user_id: user.id,
        coingecko_id: id,
        side: 'sell',
        price: Number(price),
        quantity: Number(qty),
        fee: Number(fee || 0),
        trade_time: trade_time_iso,
        sell_planner_id: chosen,
        buy_planner_id: null,
      }

      const { error } = await supabaseBrowser.from('trades').insert(payload as any)
      if (error) { setErr(error.message); setSaving(false); return }
      setOk('Sell recorded.')
      broadcast()
      resetAfterSubmit()
    }

    setSaving(false)
  }

  function resetAfterSubmit() {
    setPrice('')
    setQty('')
    setFee('0')
    setTime(new Date().toISOString().slice(0,16))
  }

  const noActiveBuy = !activeBuy
  const noActiveSell = !activeSell

  return (
    <div className="rounded-2xl border border-[#081427] p-4 space-y-4 w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-medium">Add Trade</h2>
        <div className="text-xs text-slate-400">
          {loading ? 'Loading planners…' : (
            <>
              {activeBuy ? <span>Buy Plan: <span className="text-emerald-400">Active</span></span> : <span>Buy Plan: <span className="text-rose-400">None</span></span>}
              {' · '}
              {activeSell ? <span>Sell Plan: <span className="text-emerald-400">Active</span></span> : <span>Sell Plan: <span className="text-rose-400">None</span></span>}
            </>
          )}
        </div>
      </div>

      {err && <div className="text-sm text-rose-400">{err}</div>}
      {ok && <div className="text-sm text-emerald-400">{ok}</div>}

      {/* Guidance banners */}
      {noActiveBuy && (
        <div className="text-xs rounded-md border border-[#081427] p-2 bg-[#0a162c]">
          No active Buy Planner for this coin. Go to <a className="underline" href="/planner">Planner</a> and click <span className="font-medium">Save New</span>.
        </div>
      )}
      {noActiveSell && (
        <div className="text-xs rounded-md border border-[#081427] p-2 bg-[#0a162c]">
          No active Sell Planner for this coin. Click <span className="font-medium">Save New</span> on the Buy Planner to create a new Sell epoch.
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-6">
        <div className="col-span-2 rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2">
          <div className="text-xs text-slate-400 mb-1">Side</div>
          <div className="flex gap-3">
            <label className="text-sm flex items-center gap-1">
              <input type="radio" name="side" checked={side==='buy'} onChange={() => setSide('buy')} /> Buy
            </label>
            <label className="text-sm flex items-center gap-1">
              <input type="radio" name="side" checked={side==='sell'} onChange={() => setSide('sell')} /> Sell
            </label>
          </div>
        </div>

        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Price"
          type="number" step="0.00000001" min="0"
          value={price} onChange={(e)=>setPrice(e.target.value)}
        />

        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Quantity"
          type="number" step="0.00000001" min="0"
          value={qty} onChange={(e)=>setQty(e.target.value)}
        />

        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Fee (optional)"
          type="number" step="0.00000001" min="0"
          value={fee} onChange={(e)=>setFee(e.target.value)}
        />

        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Trade time"
          type="datetime-local"
          value={time}
          onChange={(e)=>setTime(e.target.value)}
        />
      </div>

      {/* SELL override: choose planner */}
      {side === 'sell' && (
        <div className="grid gap-2 md:grid-cols-[1fr_260px]">
          <div className="text-xs text-slate-400">
            Sells default to the <span className="font-medium">Active</span> Sell Planner. You can override below.
          </div>
          <select
            value={selectedSellPlannerId}
            onChange={(e)=>setSelectedSellPlannerId(e.target.value)}
            className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
            title="Choose which Sell Planner this trade should belong to"
          >
            <option value="" disabled>{sellPlanners.length ? 'Select Sell Planner' : 'No Sell Planners yet'}</option>
            {sellPlanners.map(p => (
              <option key={p.id} value={p.id}>
                {p.is_active ? 'Active' : 'Frozen'} · {new Date(p.created_at).toLocaleDateString()}
                {p.frozen_at ? ` (frozen ${new Date(p.frozen_at).toLocaleDateString()})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={submitTrade}
          disabled={!canSubmit || saving}
          className={`rounded-lg border border-[#081427] px-3 py-2 ${(!canSubmit || saving) ? 'bg-[#0e1b33] text-slate-500 cursor-not-allowed' : 'bg-[#0a162c]'}`}
        >
          {saving ? 'Saving…' : 'Add Trade'}
        </button>
        <button
          onClick={resetAfterSubmit}
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          type="button"
        >
          Reset
        </button>
      </div>

      <p className="text-xs text-slate-500">
        BUYs are tagged to the active Buy & Sell planners; SELLs default to the active Sell planner, but you can assign them to any Frozen planner for accurate ladder fills and realized P&L.
      </p>
    </div>
  )
}

function toIso(localValue: string): string {
  // local "YYYY-MM-DDTHH:mm" -> ISO string
  try {
    const d = new Date(localValue)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch {}
  return new Date().toISOString()
}

