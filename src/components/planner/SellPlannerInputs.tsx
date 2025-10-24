'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import Button from '@/components/ui/Button'
import {
  buildBuyLevels,
  computeBuyFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'

/* ── shared UI tokens matched to BuyPlannerInputs ─────────── */
const baseBg = 'bg-[rgb(41,42,43)]'
const baseText = 'text-slate-200'
const noBorder =
  'outline-none border-none focus:outline-none focus:ring-0 focus:border-transparent'
const radiusClosed = 'rounded-lg'
const radiusOpenBtn = 'rounded-t-lg rounded-b-none'
const radiusOpenList = 'rounded-b-lg rounded-t-none'
const fieldShell =
  'mt-1 w-full rounded-lg bg-[rgb(41,42,43)] px-3 py-2.5 text-slate-200 outline-none focus:ring-0 focus:border-transparent appearance-none'

/* ── InlineSelect: matches input size; right arrow; stable hooks ── */
type InlineSelectProps = {
  value: number
  options: number[]
  onChange: (v: number) => void
  renderLabel: (v: number) => string
  ariaLabel: string
}
function InlineSelect({ value, options, onChange, renderLabel, ariaLabel }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<number>(value)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Single effect to keep dependency array size/order constant
  useEffect(() => {
    // keep active aligned to value
    setActive(value)

    // close on outside click
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
    }
  }, [value])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    const idx = options.findIndex(v => v === active)
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(options[Math.min(options.length - 1, idx + 1)])
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(options[Math.max(0, idx - 1)])
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onChange(active)
      setOpen(false)
      return
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        className={`mt-1 w-full ${baseBg} ${baseText} ${noBorder} ${open ? radiusOpenBtn : radiusClosed}
                    px-3 py-2.5 pr-10 text-sm text-left relative`}
      >
        <span className="block">{renderLabel(value)}</span>
        {/* Right arrow, same placement as Select.tsx */}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-transform ${open ? 'rotate-180' : ''} text-slate-400`}
        >
          <path
            fill="currentColor"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.24 3.4a.75.75 0 0 1-.92 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`${baseBg} ${baseText} ${noBorder} ${radiusOpenList}
                      absolute left-0 right-0 top-full z-20 grid gap-1 px-2 py-2`}
          onKeyDown={onKeyDown}
        >
          {options.map(opt => {
            const isActive = opt === active
            const isSelected = opt === value
            return (
              <button
                key={opt}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(opt); setOpen(false) }}
                onMouseEnter={() => setActive(opt)}
                className={`w-full text-left text-sm px-2 py-2 rounded-md ${noBorder}
                            ${isActive ? 'bg-[rgb(54,55,56)]' : 'bg-transparent'}`}
              >
                <span className="flex items-center gap-2">
                  <span>{renderLabel(opt)}</span>
                  {isSelected && (
                    <span className="text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300">
                      selected
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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

  useEffect(() => {
    setMsg(null)
    setErr(null)
  }, [coingeckoId, activeSell?.id])

  const help = useMemo(() => {
    const a = activeSell?.avg_lock_price
    return a ? `Avg lock: ${fmtCurrency(Number(a))}` : 'Avg lock: — (uses on-plan avg while active)'
  }, [activeSell?.avg_lock_price])

  // Pool = on-hand tokens within the epoch (simple version)
  const getPoolTokens = async (plannerId: string) => {
    const { data: sells, error: e1 } = await supabaseBrowser
      .from('trades')
      .select('quantity')
      .eq('user_id', user!.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'sell')
      .eq('sell_planner_id', plannerId)
    if (e1) throw e1
    const sold = (sells ?? []).reduce((a, r: any) => a + Number(r.quantity || 0), 0)

    const { data: bp } = await supabaseBrowser
      .from('buy_planners')
      .select('id,started_at')
      .eq('user_id', user!.id)
      .eq('coingecko_id', coingeckoId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let bought = 0
    if (bp?.id) {
      const { data: buys, error: e2 } = await supabaseBrowser
        .from('trades')
        .select('quantity')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'buy')
        .eq('buy_planner_id', bp.id)
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
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('is_active', true)
      .maybeSingle()
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
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'buy')
      .eq('buy_planner_id', (bp as any).id)
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
      return sum + (usd > 0 ? usd / lv.price : 0)
    }, 0)

    return allocatedTokens > 0 ? allocatedUsd / allocatedTokens : 0
  }

  const onGenerate = async () => {
    setErr(null)
    setMsg(null)
    if (!user) {
      setErr('Not signed in.')
      return
    }
    if (!activeSell?.id) {
      setErr('No active Sell planner found.')
      return
    }
    if (activeSell?.is_active === false) {
      setErr('This planner is frozen. Generate only on the active sell planner.')
      return
    }

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
        const rise_pct = step * level // 50, 100, 150...
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

      {/* Match BuyPlannerInputs layout: single column, tight gaps */}
      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-xs text-slate-300">Step size per level</span>
          <InlineSelect
            value={step}
            options={stepOptions}
            onChange={setStep}
            ariaLabel="Select step size per level"
            renderLabel={(v) => `+${v}%`}
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Sell % of remaining each level</span>
          <InlineSelect
            value={sellPct}
            options={sellPctOptions}
            onChange={setSellPct}
            ariaLabel="Select sell % of remaining each level"
            renderLabel={(v) => `${v}%`}
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Number of levels</span>
          <input
            value={String(levels)}
            onChange={(e) => setLevels(Number(e.target.value))}
            className={fieldShell}
            placeholder="e.g. 8"
            inputMode="numeric"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
      <button
  type="button"
  onClick={onGenerate}
  disabled={busy}
  className="
    inline-flex items-center justify-center
    rounded-lg px-3.5 py-2.5 text-sm font-medium
    transition-colors disabled:opacity-60 disabled:cursor-not-allowed
    bg-[rgb(109,93,186)] hover:bg-[rgb(122,106,199)] active:bg-[rgb(98,84,175)]
    text-[rgb(234,235,239)]
    shadow-none ring-0 outline-none border-0
  "
>
  Generate ladder
</button>

      </div>

      {err && <div className="text-xs text-red-300">{err}</div>}
      {msg && <div className="text-xs text-green-300">{msg}</div>}
    </div>
  )
}
