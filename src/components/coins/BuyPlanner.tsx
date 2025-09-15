'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import { allocateBuysToPlan, buildPlan, type Buy, type PlanLevel } from '@/lib/waterfall'

type PlannerCfg = {
  id: string
  user_id: string
  coingecko_id: string
  tolerance_pct: number | null
  base_budget: number | null
  start_price: number | null
  step_pct: number | null
  depth_pct: number | null
  include_extra_deep: boolean | null
}

type DbTrade = {
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
}

export default function BuyPlanner({ id }: { id: string }) {
  const { user } = useUser()
  const { data: priceData } = useSWR<{ id: string; price: number | null }>(`/api/price/${id}`)

  // Planner state (form)
  const [cfg, setCfg] = useState<PlannerCfg | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Trades (buys only)
  const [buys, setBuys] = useState<Buy[]>([])

  async function load() {
    if (!user) { setCfg(null); setBuys([]); setLoading(false); return }
    setLoading(true); setError(null)

    // get config for this coin/user
    const { data: cfgRow, error: e1 } = await supabaseBrowser
      .from('planner_configs')
      .select('*')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .maybeSingle()

    if (e1) setError(e1.message)

    // get buys for allocation
    const { data: tradeRows, error: e2 } = await supabaseBrowser
      .from('trades')
      .select('side, price, quantity, fee, trade_time')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .eq('side', 'buy')

    if (e2) setError(e2.message)

    setCfg((cfgRow as any) ?? null)

    const mappedBuys: Buy[] = (tradeRows ?? []).map(t => ({
      price: Number(t.price),
      qty: Number(t.quantity),
      fee: t.fee ? Number(t.fee) : 0
    }))
    setBuys(mappedBuys)
    setLoading(false)
  }

  useEffect(() => { load() }, [user, id])

  // Defaults when no config exists yet
  const defaults = {
    start_price: priceData?.price ?? null,
    base_budget: 1000,
    tolerance_pct: 5,
    step_pct: 10,
    depth_pct: 70,
    include_extra_deep: false,
  }

  const form = {
    start_price: cfg?.start_price ?? defaults.start_price,
    base_budget: cfg?.base_budget ?? defaults.base_budget,
    tolerance_pct: cfg?.tolerance_pct ?? defaults.tolerance_pct,
    step_pct: cfg?.step_pct ?? defaults.step_pct,
    depth_pct: cfg?.depth_pct ?? defaults.depth_pct,
    include_extra_deep: cfg?.include_extra_deep ?? defaults.include_extra_deep,
  }

  async function save() {
    if (!user) return
    if (!form.start_price || !form.base_budget) { setError('Enter start price and budget'); return }
    const payload = {
      user_id: user.id,
      coingecko_id: id,
      start_price: Number(form.start_price),
      base_budget: Number(form.base_budget),
      tolerance_pct: Number(form.tolerance_pct),
      step_pct: Number(form.step_pct),
      depth_pct: Number(form.depth_pct),
      include_extra_deep: Boolean(form.include_extra_deep),
    }
    const { error } = await supabaseBrowser
      .from('planner_configs')
      .upsert(payload, { onConflict: 'user_id,coingecko_id' }) // works with the UNIQUE(user_id, coingecko_id)
      .select('id')
      .maybeSingle()
    if (error) setError(error.message)
    else load()
  }

  // Build plan + allocate
  const plan: PlanLevel[] = useMemo(() => {
    if (!form.start_price || !form.base_budget) return []
    const p = buildPlan({
      startPrice: Number(form.start_price),
      baseBudget: Number(form.base_budget),
      stepPct: Number(form.step_pct),
      depthPct: Number(form.depth_pct),
      includeExtraDeep: Boolean(form.include_extra_deep),
    })
    return allocateBuysToPlan(p, buys, Number(form.tolerance_pct))
  }, [form.start_price, form.base_budget, form.step_pct, form.depth_pct, form.include_extra_deep, form.tolerance_pct, buys])

  const overall = useMemo(() => {
    const planned = plan.reduce((s, l) => s + l.planned_usd, 0)
    const filled = plan.reduce((s, l) => s + Math.min(l.planned_usd, l.filled_usd), 0)
    const pct = planned > 0 ? filled / planned : 0
    return { planned, filled, pct }
  }, [plan])

  if (!user) {
    return (
<div className="rounded-2xl border border-[#081427] p-4 space-y-4 min-w-0 w-full">

        <h2 className="font-medium mb-2">Buy Planner</h2>
        <p className="text-sm text-slate-400">Sign in to set your plan and see fills.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-medium">Buy Planner</h2>
        <div className="text-xs text-slate-400">
          Live price: {priceData?.price ? fmtCurrency(priceData.price) : '…'}
        </div>
      </div>

      {/* Config form */}
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Start price"
          type="number" step="0.00000001"
          value={form.start_price ?? ''}
          onChange={(e) => setCfg(c => ({ ...(c ?? {} as any), start_price: Number(e.target.value) }))}
        />
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Budget (USD)"
          type="number" step="0.01"
          value={form.base_budget ?? ''}
          onChange={(e) => setCfg(c => ({ ...(c ?? {} as any), base_budget: Number(e.target.value) }))}
        />
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Step % (e.g., 10)"
          type="number" step="0.01" min="1"
          value={form.step_pct ?? ''}
          onChange={(e) => setCfg(c => ({ ...(c ?? {} as any), step_pct: Number(e.target.value) }))}
        />
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Depth % (e.g., 70)"
          type="number" step="0.01" min="1"
          value={form.depth_pct ?? ''}
          onChange={(e) => setCfg(c => ({ ...(c ?? {} as any), depth_pct: Number(e.target.value) }))}
        />
        <input
          className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="Tolerance % (±, default 5)"
          type="number" step="0.01" min="0"
          value={form.tolerance_pct ?? ''}
          onChange={(e) => setCfg(c => ({ ...(c ?? {} as any), tolerance_pct: Number(e.target.value) }))}
        />
        <label className="inline-flex items-center gap-2 text-sm px-2">
          <input
            type="checkbox"
            checked={Boolean(form.include_extra_deep)}
            onChange={(e) => setCfg(c => ({ ...(c ?? {} as any), include_extra_deep: e.target.checked }))}
          />
          include -80%/-90%
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2">
          Save Plan
        </button>
        {loading && <span className="text-sm text-slate-400">Loading…</span>}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>

      {/* Overall progress */}
      <div className="text-sm">
        Planned: <span className="font-medium">{fmtCurrency(overall.planned)}</span> ·
        Filled: <span className="font-medium">{fmtCurrency(overall.filled)}</span> ·
        Progress: <span className="font-medium">{(overall.pct * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded bg-[#0a162c] overflow-hidden">
        <div
          className="h-2 bg-emerald-500"
          style={{ width: `${Math.min(100, overall.pct * 100)}%` }}
        />
      </div>

      {/* Levels table */}
      <table className="w-full text-sm">
        <thead className="text-slate-300">
          <tr className="text-left">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Depth</th>
            <th className="py-2 pr-2">Target</th>
            <th className="py-2 pr-2">Planned</th>
            <th className="py-2 pr-2">Filled</th>
            <th className="py-2 pr-2">Progress</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((l) => (
            <tr key={l.level} className="border-t border-[#081427]">
              <td className="py-2 pr-2">{l.level}</td>
              <td className="py-2 pr-2">-{l.depth_pct}%</td>
              <td className="py-2 pr-2">{fmtCurrency(l.price)}</td>
              <td className="py-2 pr-2">{fmtCurrency(l.planned_usd)}</td>
              <td className="py-2 pr-2">{fmtCurrency(Math.min(l.planned_usd, l.filled_usd))}</td>
              <td className="py-2 pr-2 w-[180px]">
                <div className="h-2 rounded bg-[#0a162c] overflow-hidden">
                  <div className="h-2 bg-sky-500" style={{ width: `${Math.min(100, l.filled_pct * 100)}%` }} />
                </div>
              </td>
            </tr>
          ))}
          {plan.length === 0 && (
            <tr><td className="py-3 text-slate-400 text-sm" colSpan={6}>Set start price and budget to generate a plan.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

