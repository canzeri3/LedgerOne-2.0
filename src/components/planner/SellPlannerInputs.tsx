'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import {
  buildBuyLevels,
  computeBuyFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'

type Planner = {
  id: string
  avg_lock_price: number | null
  created_at: string
  is_active?: boolean
}

const stepOptions = [50, 100, 150, 200]
const sellPctOptions = [10, 20]

export default function SellPlannerInputs({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()

  const { data: activeSell } = useSWR<Planner | null>(
    user && coingeckoId ? ['/sell-planner/active-mini', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,avg_lock_price,created_at,is_active')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const [step, setStep] = useState<number>(50)
  const [sellPct, setSellPct] = useState<number>(10)
  const [levels, setLevels] = useState<number>(8)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setMsg(null); setErr(null) }, [coingeckoId, activeSell?.id])

  const help = useMemo(() => {
    const a = activeSell?.avg_lock_price
    return a ? `Avg lock: ${fmtCurrency(Number(a))}` : 'Avg lock: — (uses on-plan avg while active)'
  }, [activeSell?.avg_lock_price])

  // Pool = on-hand tokens within the epoch (simple version)
  const getPoolTokens = async (plannerId: string) => {
    const { data: sells, error: e1 } = await supabaseBrowser
      .from('trades').select('quantity')
      .eq('user_id', user!.id).eq('coingecko_id', coingeckoId)
      .eq('side', 'sell').eq('sell_planner_id', plannerId)
    if (e1) throw e1
    const sold = (sells ?? []).reduce((a, r: any) => a + Number(r.quantity || 0), 0)

    const { data: bp } = await supabaseBrowser
      .from('buy_planners').select('id,started_at')
      .eq('user_id', user!.id).eq('coingecko_id', coingeckoId)
      .eq('is_active', true)
      .order('started_at', { ascending: false }).limit(1).maybeSingle()

    let bought = 0
    if (bp?.id) {
      const { data: buys, error: e2 } = await supabaseBrowser
        .from('trades').select('quantity')
        .eq('user_id', user!.id).eq('coingecko_id', coingeckoId)
        .eq('side', 'buy').eq('buy_planner_id', bp.id)
      if (e2) throw e2
      bought = (buys ?? []).reduce((a, r: any) => a + Number(r.quantity || 0), 0)
    }

    return Math.max(0, bought - sold)
  }

  // Compute ACTIVE planner average from ON-PLAN allocations only (strict)
  const getCurrentOnPlanAvg = async (): Promise<number> => {
    if (!user) return 0

    const { data: bp, error: eBp } = await supabaseBrowser
      .from('buy_planners')
      .select('id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level')
      .eq('user_id', user.id).eq('coingecko_id', coingeckoId)
      .eq('is_active', true).maybeSingle()
    if (eBp) throw eBp
    if (!bp?.id) return 0

    const top = Number((bp as any).top_price || 0)
    const budget = Number((bp as any).budget_usd ?? (bp as any).total_budget ?? 0)
    const depth = Number((bp as any).ladder_depth || 70) as 70 | 90
    const growth = Number((bp as any).growth_per_level ?? 25)

    const levels: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)

    const { data: buysRaw, error: eBuys } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,fee,trade_time,side,buy_planner_id')
      .eq('user_id', user.id).eq('coingecko_id', coingeckoId)
      .eq('side', 'buy').eq('buy_planner_id', (bp as any).id)
      .order('trade_time', { ascending: true })
    if (eBuys) throw eBuys

    const buys: BuyTrade[] = (buysRaw ?? []).map(t => ({
      price: Number(t.price),
      quantity: Number(t.quantity),
      fee: (t as any).fee ?? 0,
      trade_time: (t as any).trade_time,
    }))

    if (!levels.length || !buys.length) return 0

    const fills = computeBuyFills(levels, buys) // STRICT waterfall

    const allocatedUsd = fills.allocatedUsd.reduce((s, v) => s + v, 0)
    const allocatedTokens = levels.reduce((sum, lv, i) => {
      const usd = fills.allocatedUsd[i] ?? 0
      return sum + (usd > 0 ? (usd / lv.price) : 0)
    }, 0)

    return allocatedTokens > 0 ? (allocatedUsd / allocatedTokens) : 0
  }

  const onGenerate = async () => {
    setErr(null); setMsg(null)
    if (!user) { setErr('Not signed in.'); return }
    if (!activeSell?.id) { setErr('No active Sell planner found.'); return }
    if (activeSell?.is_active === false) { setErr('This planner is frozen. Generate only on the active sell planner.'); return }

    // Base average: prefer locked; otherwise on-plan moving average (STRICT)
    let baseAvg = Number(activeSell?.avg_lock_price ?? 0)
    if (!Number.isFinite(baseAvg) || baseAvg <= 0) {
      try {
        baseAvg = await getCurrentOnPlanAvg()
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to compute on-plan average from buys.')
        return
      }
      if (!Number.isFinite(baseAvg) || baseAvg <= 0) {
        setErr('Need at least one ON-PLAN BUY before generating a ladder.')
        return
      }
    }

    if (!Number.isFinite(levels) || levels < 1 || levels > 60) {
      setErr('Levels must be between 1 and 60.')
      return
    }

    setBusy(true)
    try {
      const poolTokens = await getPoolTokens(activeSell.id)
      const avg = Number(baseAvg)
      const stepFrac = step / 100
      const pctOfRemaining = sellPct / 100

      let remaining = poolTokens
      const plan = Array.from({ length: levels }, (_, i) => {
        const level = i + 1
        const rise_pct = step * level                 // 50, 100, 150...
        const price = avg * (1 + stepFrac * level)
        const sell_tokens = i === levels - 1 ? remaining : Math.max(0, remaining * pctOfRemaining)
        const sell_pct_of_remaining = pctOfRemaining
        remaining = Math.max(0, remaining - sell_tokens)
        return { level, rise_pct, price, sell_tokens, sell_pct_of_remaining }
      })

      // Clear previous ladder for this active sell planner
      await supabaseBrowser
        .from('sell_levels')
        .delete()
        .eq('user_id', user.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', activeSell.id)

      // Insert with ALL required NOT-NULL columns
      if (plan.length > 0) {
        const rows = plan.map(p => ({
          user_id: user.id,
          coingecko_id: coingeckoId,
          sell_planner_id: activeSell.id,
          level: p.level,
          rise_pct: p.rise_pct,
          price: p.price,
          sell_pct_of_remaining: p.sell_pct_of_remaining,
          sell_tokens: p.sell_tokens,
        }))
        const { error: eIns } = await supabaseBrowser.from('sell_levels').insert(rows)
        if (eIns) throw eIns
      }

      // NEW: notify so the ladder revalidates immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sellPlannerUpdated', { detail: { coinId: coingeckoId } }))
      }

      setMsg(`Generated ${plan.length} levels: +${step}% steps, sell ${sellPct}% of remaining each level.`)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to generate ladder.')
    } finally {
      setBusy(false)
    }
  }

  // NEW: listen for BUY-related updates and auto-generate if UNLOCKED
  useEffect(() => {
    if (typeof window === 'undefined') return
    let running = false
    const handler = async (e: any) => {
      if (running) return
      const detailCoin = e?.detail?.coinId
      if (detailCoin && detailCoin !== coingeckoId) return
      const isUnlocked = !(Number(activeSell?.avg_lock_price ?? 0) > 0)
      if (!isUnlocked) return
      if (!user || !activeSell?.id) return
      running = true
      try {
        await onGenerate()
      } finally {
        running = false
      }
    }
    // We react to planner/trade events already emitted by TradesPanel
    window.addEventListener('buyPlannerUpdated', handler)
    return () => window.removeEventListener('buyPlannerUpdated', handler)
  }, [user?.id, coingeckoId, activeSell?.id, activeSell?.avg_lock_price]) // rebind if lock state/id changes

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400">{help}</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-slate-300">Step size per level</span>
          <Select value={step} onChange={(e) => setStep(Number(e.target.value))} fullWidth>
            {stepOptions.map(v => <option key={v} value={v}>+{v}%</option>)}
          </Select>
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Sell % of remaining each level</span>
          <Select value={sellPct} onChange={(e) => setSellPct(Number(e.target.value))} fullWidth>
            {sellPctOptions.map(v => <option key={v} value={v}>{v}%</option>)}
          </Select>
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Number of levels</span>
          <input
            value={String(levels)}
            onChange={(e) => setLevels(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5 text-slate-200 outline-none focus:border-blue-500/60"
            placeholder="e.g. 8"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={onGenerate} disabled={busy} variant="primary">
          Generate ladder
        </Button>
      </div>

      {err && <div className="text-xs text-red-300">{err}</div>}
      {msg && <div className="text-xs text-green-300">{msg}</div>}
    </div>
  )
}
