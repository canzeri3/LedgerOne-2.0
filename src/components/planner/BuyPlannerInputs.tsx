'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import type { BuyPlannerRow } from '@/types/db'

const toNum = (v: any) => (v === '' || v == null ? NaN : Number(v))

export default function BuyPlannerInputs({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()

  // Load latest (current) buy planner for this coin
  const { data: planner, mutate } = useSWR<BuyPlannerRow | null>(
    user && coingeckoId ? ['/buy-planner/latest', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select('id,user_id,coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,started_at,is_active')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as BuyPlannerRow) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Form state
  const [top, setTop] = useState<string>('')
  const [budget, setBudget] = useState<string>('') // keep budget_usd & total_budget in sync
  const [depth, setDepth] = useState<'70'|'90'>('70')
  const [growth, setGrowth] = useState<string>('1.25')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Prefill from existing planner
  useEffect(() => {
    if (!planner) return
    setTop(String(planner.top_price ?? ''))
    const b = planner.budget_usd ?? planner.total_budget ?? null
    setBudget(b == null ? '' : String(b))
    setDepth(String(planner.ladder_depth) === '90' ? '90' : '70')
    setGrowth(String(planner.growth_per_level ?? '1.25'))
  }, [planner])

  const summary = useMemo(() => {
    const t = Number(top); const b = Number(budget)
    return Number.isFinite(t) && Number.isFinite(b)
      ? `Top ${fmtCurrency(t)} · Budget ${fmtCurrency(b)} · Depth ${depth}% · Growth x${growth || '1.25'}`
      : 'Enter your recent top and total budget'
  }, [top, budget, depth, growth])

  const validate = () => {
    const t = toNum(top), b = toNum(budget), g = toNum(growth)
    if (!Number.isFinite(t) || t <= 0) return 'Enter a valid recent top price'
    if (!Number.isFinite(b) || b <= 0) return 'Enter a valid total budget'
    if (!(depth === '70' || depth === '90')) return 'Choose ladder depth'
    if (!Number.isFinite(g) || g < 1.0) return 'Growth per level should be ≥ 1.0'
    return null
  }

  // Edit current buy planner
  const onEdit = async () => {
    setErr(null); setMsg(null)
    const v = validate(); if (v) { setErr(v); return }
    if (!user) { setErr('Not signed in.'); return }
    if (!planner?.id) { setErr('No planner found to edit.'); return }

    const numBudget = Number(budget)
    setBusy(true)
    try {
      const { error: e1 } = await supabaseBrowser
        .from('buy_planners')
        .update({
          top_price: Number(top),
          budget_usd: numBudget,
          total_budget: numBudget,
          ladder_depth: Number(depth),
          growth_per_level: Number(growth),
        })
        .eq('id', planner.id)
        .eq('user_id', user.id)
      if (e1) throw e1

      setMsg('Updated current Buy planner.')
      await mutate()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to update Buy planner.')
    } finally {
      setBusy(false)
    }
  }

  // Save New via atomic RPC
  const onSaveNew = async () => {
    setErr(null); setMsg(null)
    const v = validate(); if (v) { setErr(v); return }
    if (!user) { setErr('Not signed in.'); return }

    setBusy(true)
    try {
      const { data: ignoredData, error } = await supabaseBrowser.rpc('rotate_buy_sell_planners', {
        p_coingecko_id: coingeckoId,
        p_top_price: Number(top),
        p_budget: Number(budget),
        p_ladder_depth: Number(depth),
        p_growth: Number(growth),
      })
      if (error) throw error

      setMsg('Saved new Buy planner and rotated Sell planner.')
      await mutate()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save new Buy planner.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400">
        {summary}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-slate-300">Recent Top Price</span>
          <input
            value={top}
            onChange={(e) => setTop(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5 text-slate-200 outline-none focus:border-blue-500/60"
            placeholder="e.g. 68000"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Total Budget (USD)</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5 text-slate-200 outline-none focus:border-blue-500/60"
            placeholder="e.g. 1000"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Ladder depth</span>
          <Select
            value={depth}
            onChange={(e) => setDepth(e.target.value as '70'|'90')}
            fullWidth
          >
            <option value="70">70%</option>
            <option value="90">90%</option>
          </Select>
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Growth per level</span>
          <input
            value={growth}
            onChange={(e) => setGrowth(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5 text-slate-200 outline-none focus:border-blue-500/60"
            placeholder="e.g. 1.25"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={onEdit} disabled={!planner || !!err || busy} variant="secondary">
          Edit Planner
        </Button>
        <Button onClick={onSaveNew} disabled={busy} variant="primary">
          Save New
        </Button>
      </div>

      {err && <div className="text-xs text-red-300">{err}</div>}
      {msg && <div className="text-xs text-green-300">{msg}</div>}
    </div>
  )
}

