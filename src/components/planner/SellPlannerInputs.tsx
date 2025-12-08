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

// Small-corner card shell for the two input cards (taller + bigger text)
const cardShell = `
  ${baseBg} ${baseText} ${noBorder}
  rounded-lg px-4 py-4
  text-sm
  shadow-none
`

const fieldShell = `
  mt-1 w-full
  rounded-md px-3.5 py-2.5
  bg-[rgb(32,33,35)]
  text-sm text-slate-100
  placeholder:text-slate-500
  ${noBorder}
`

const inlineSelectShell = `
  relative mt-1 w-full
`

// Small-corner dropdown button (NO arrow icon anymore)
const inlineSelectBtn = `
  w-full
  inline-flex items-center
  rounded-md px-3.5 py-2.5
  bg-[rgb(41,42,45)]
  text-sm text-slate-100
  ${noBorder}
  cursor-pointer
`

const inlineSelectMenu = `
  absolute z-20 mt-1 w-full
  rounded-xl
  bg-[rgb(24,25,27)]
  border border-[rgb(55,56,60)]
  shadow-lg
  max-h-60 overflow-y-auto
`
const inlineSelectOption = `
  w-full text-left px-3 py-2 text-xs
  text-slate-100
  hover:bg-[rgb(41,42,45)]
  cursor-pointer
`

// Card defaults / options
// Card 2: "Coin Volatility" -> step size per level
// Low: 50% step, Medium: 100% step, High: 150% step
const stepOptions = [50, 100, 150]

// Card 1: "Sell Intensity" -> % of remaining each level
// Light Trim: 10%, Balanced Trim: 15%, Firm Trim: 20%, Max Trim: 25%
const sellPctOptions = [10, 15, 20, 25]

type Planner = {
  id: string
  avg_lock_price: number | null
  created_at: string
  is_active: boolean
}

// ─────────────────────────────────────────────────────────────
// Shared "pill" dropdown UI for Sell planner (matches Buy risk)
// ─────────────────────────────────────────────────────────────

type SellMeta = {
  title: string
  desc: string
  chip: string
  bars: number
}

type SellDropdownProps = {
  value: number
  options: number[]
  onChange: (v: number) => void
  ariaLabel: string
  getMeta: (v: number) => SellMeta
}

// Coin Volatility meta (chip shows only 50% / 100% / 150% step)
function sellVolatilityMeta(v: number): SellMeta {
  if (v === 50) {
    return {
      title: 'Low',
      desc: '50% step between targets',
      chip: '50% step',
      bars: 3,
    }
  }
  if (v === 100) {
    return {
      title: 'Medium',
      desc: '100% step between targets',
      chip: '100% step',
      bars: 5,
    }
  }
  if (v === 150) {
    return {
      title: 'High',
      desc: '150% step between targets',
      chip: '150% step',
      bars: 7,
    }
  }
  // Fallback (should not hit in normal use)
  return {
    title: `${v}%`,
    desc: 'Custom step between targets',
    chip: `${v}% step`,
    bars: 4,
  }
}

// Sell Intensity meta (Light Trim / Balanced / Firm / Max)
function sellIntensityMeta(v: number): SellMeta {
  if (v === 10) {
    return {
      title: 'Light Trim',
      desc: 'Sell 10% at each target',
      chip: '10% / level',
      bars: 3,
    }
  }
  if (v === 15) {
    return {
      title: 'Balanced Trim',
      desc: 'Sell 15% at each target',
      chip: '15% / level',
      bars: 4,
    }
  }
  if (v === 20) {
    return {
      title: 'Firm Trim',
      desc: 'Sell 20% at each target',
      chip: '20% / level',
      bars: 5,
    }
  }
  if (v === 25) {
    return {
      title: 'Max Trim',
      desc: 'Sell 25% at each target',
      chip: '25% / level',
      bars: 6,
    }
  }
  // Fallback
  return {
    title: `${v}%`,
    desc: 'Custom trim pattern',
    chip: `${v}% / level`,
    bars: 4,
  }
}

// Pill-style dropdown (mirrors Buy LadderDepthDropdown UI)
function SellDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  getMeta,
}: SellDropdownProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return

    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current && wrapRef.current.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const currentMeta = getMeta(value)

  const baseBg = 'bg-[rgb(41,42,43)]'
  const baseText = 'text-slate-200'
  const noBorder =
    'outline-none border-none focus:outline-none focus:ring-0 focus:border-transparent'
  const heightPad = 'px-3 py-2.5'
  const radiusClosed = 'rounded-lg'
  const muted = 'text-slate-400'

  return (
    <div ref={wrapRef} className="relative mt-1">
      {/* Control (pill-style button) */}
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
        className={`${baseBg} ${baseText} ${noBorder} ${heightPad} w-full text-left select-none ${radiusClosed}`}
      >
        <div className="inline-flex w-full items-center gap-1">
          {/* Left: option name (Low / Medium / High, Light Trim, etc.) */}
          <span className="text-sm" style={{ width: 'auto' }}>
            {currentMeta.title}
          </span>

          {/* Chip immediately next to the name */}
          <span
            className="ml-1 text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300"
            style={{ width: 'auto', flexShrink: 0 }}
          >
            {currentMeta.chip}
          </span>

          {/* Arrow pushed to far right, fixed-size circle */}
          <span
            className="inline-flex items-center justify-center rounded-full bg-[rgb(54,55,56)] ml-auto"
            aria-hidden="true"
            style={{ width: 20, height: 20, flexShrink: 0 }}
          >
            <svg
              className={`h-3 w-3 text-slate-200 transition-transform ${
                open ? 'rotate-180' : 'rotate-0'
              }`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.19l3.71-3.96a.75.75 0 1 1 1.08 1.04l-4.25 4.53a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </button>

                 {/* Dropdown menu – 2-line structure, no mini bars */}
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`${baseBg} ${baseText} ${noBorder} mt-2 w-full rounded-lg border border-[rgb(32,33,34)] shadow-lg`}
        >
          <div className="py-1">
            {options.map((opt) => {
              const meta = getMeta(opt)
              const selected = opt === value

              // For Sell Intensity we want [10%], [15%], etc
              // For Coin Volatility we use meta.chip -> [50% step], etc
              const bracketChip =
                ariaLabel === 'Select sell intensity' ? `${opt}%` : meta.chip

              // Dropdown label:
              // - Coin Volatility: "Low Volatility", "Medium Volatility", "High Volatility"
              // - Sell Intensity: keep "Light Trim", "Balanced Trim", etc.
              const label =
                ariaLabel === 'Select coin volatility'
                  ? `${meta.title} Volatility`
                  : meta.title

              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt)
                    setOpen(false)
                    buttonRef.current?.focus()
                  }}
                  className={`w-full text-left px-3 py-2 transition ${
                    selected ? 'bg-[rgb(47,48,49)]' : 'hover:bg-[rgb(47,48,49)]'
                  }`}
                >
                  {/* First line: Name ............ [chip] (right-aligned) */}
                  <div className="inline-flex w-full items-center">
                    <span className="text-sm" style={{ width: 'auto' }}>
                      {label}
                    </span>
                    <span
                      className="ml-auto text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300"
                      style={{ width: 'auto', flexShrink: 0 }}
                    >
                      {bracketChip}
                    </span>
                  </div>

                  {/* Second line: description */}
                  <div className={`mt-1 text-[12px] ${muted}`}>{meta.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}


    </div>
  )
}

// Main Sell planner inputs
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

  // Card 2: Coin Volatility (step size per level)
  // Default when there is NO active sell planner: Low (50% step)
  const [step, setStep] = useState<number>(50)

  // Card 1: Sell Intensity (% of remaining each level)
  // Default when there is NO active sell planner: Balanced Trim (15% per level)
  const [sellPct, setSellPct] = useState<number>(15)

  // Always use 12 levels for the ladder (no user control)
  const levels = 12
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Clear transient messages when coin or active planner changes
  useEffect(() => {
    setMsg(null)
    setErr(null)
  }, [coingeckoId, activeSell?.id])

  // When an active sell planner exists, infer presets from its ladder;
  // otherwise default to Low volatility + Balanced Trim.
  useEffect(() => {
    if (!user || !coingeckoId) return

    const plannerId = activeSell?.id
    // No active planner -> explicit defaults: Low + Balanced Trim
    if (!plannerId) {
      setStep(50)
      setSellPct(15)
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('sell_levels')
          .select('rise_pct,sell_pct_of_remaining')
          .eq('user_id', user.id)
          .eq('coingecko_id', coingeckoId)
          .eq('sell_planner_id', plannerId)
          .order('level', { ascending: true })

        if (cancelled) return

        if (error || !data || !data.length) {
          // If we can't read the ladder, fall back to defaults.
          setStep(50)
          setSellPct(15)
          return
        }

        const first = data[0] as any

        const rawStep = Number(first.rise_pct ?? 0)
        // We generate rise_pct = step * level (level 1 → rise_pct = step),
        // so the first level’s rise_pct is the step size in %.
        const stepCandidate = stepOptions.includes(rawStep) ? rawStep : 50

        const rawPct = Number(first.sell_pct_of_remaining ?? 0) * 100
        // Snap to the closest of our allowed options (10, 15, 20, 25)
        const closestSellPct = sellPctOptions.reduce((best, opt) => {
          return Math.abs(opt - rawPct) < Math.abs(best - rawPct) ? opt : best
        }, sellPctOptions[0])

        setStep(stepCandidate)
        setSellPct(closestSellPct)
      } catch {
        if (cancelled) return
        // On any error, fall back to defaults
        setStep(50)
        setSellPct(15)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [user?.id, coingeckoId, activeSell?.id])

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
    const soldQty = (sells ?? []).reduce((sum, t) => sum + Number(t.quantity ?? 0), 0)

    const { data: buys, error: e2 } = await supabaseBrowser
      .from('trades')
      .select('quantity')
      .eq('user_id', user!.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'buy')
    if (e2) throw e2
    const boughtQty = (buys ?? []).reduce((sum, t) => sum + Number(t.quantity ?? 0), 0)

    const pool = Math.max(0, boughtQty - soldQty)
    return pool
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

    const depthNum = Number((bp as any).ladder_depth || 70)
    const depth = (depthNum === 90
      ? 90
      : depthNum === 75
        ? 75
        : 70) as 70 | 75 | 90

    const growth = Number((bp as any).growth_per_level ?? 25)

    const levelsArr: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)

    const { data: buysRaw, error: eBuys } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,fee,trade_time')
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'buy')
      .order('trade_time', { ascending: true })
    if (eBuys) throw eBuys

    const buys: BuyTrade[] = (buysRaw ?? []).map(t => ({
      price: Number(t.price),
      quantity: Number(t.quantity),
      fee: (t as any).fee ?? 0,
      trade_time: (t as any).trade_time,
    }))

    if (!levelsArr.length || !buys.length) return 0

    const fills = computeBuyFills(levelsArr, buys) // STRICT waterfall

    const allocatedUsd = fills.allocatedUsd.reduce((s, v) => s + v, 0)
    const allocatedTokens = levelsArr.reduce((sum, lv, i) => {
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

    if (!Number.isFinite(levels) || levels < 1 || levels > 60) {
      setErr('Levels must be between 1 and 60.')
      return
    }

    setBusy(true)
    try {
      const poolTokens = await getPoolTokens(activeSell.id)
      const avg = Number(activeSell.avg_lock_price || 0) || (await getCurrentOnPlanAvg())
      const baseAvg = avg > 0 ? avg : 0
      if (!baseAvg) {
        setErr('Unable to compute base average price.')
        return
      }

      const stepFrac = step / 100
      const pctOfRemaining = sellPct / 100

      let remaining = poolTokens
      const plan = Array.from({ length: levels }, (_, i) => {
        const level = i + 1
        const rise_pct = step * level // 50, 100, 150...
        const price = baseAvg * (1 + stepFrac * level)
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
      const rows = plan.map((lv) => ({
        user_id: user.id,
        coingecko_id: coingeckoId,
        sell_planner_id: activeSell.id,
        level: lv.level,
        rise_pct: lv.rise_pct,
        price: lv.price,
        sell_tokens: lv.sell_tokens,
        sell_pct_of_remaining: lv.sell_pct_of_remaining,
      }))

      const { error: eIns } = await supabaseBrowser.from('sell_levels').insert(rows)
      if (eIns) throw eIns

      setMsg(
        `Generated ${plan.length} levels: +${step}% steps, sell ${sellPct}% of remaining each level.`
      )

      // Emit a browser event so ladder cards can refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sellPlannerUpdated', {
            detail: { coinId: coingeckoId, plannerId: activeSell.id },
          })
        )
      }
    } catch (e: any) {
      console.error(e)
      setErr(e?.message || 'Failed to generate ladder.')
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
  {/* Card 2: Coin Volatility (step size per level) */}
  <label className="block">
    <span className="text-sm font-medium text-slate-100">Coin Volatility</span>
    <SellDropdown
      value={step}
      options={stepOptions}
      onChange={setStep}
      ariaLabel="Select coin volatility"
      getMeta={sellVolatilityMeta}
    />
  </label>

  {/* Card 1: Sell Intensity (% of remaining each level) */}
  <label className="block">
    <span className="text-sm font-medium text-slate-100">Sell Intensity</span>
    <SellDropdown
      value={sellPct}
      options={sellPctOptions}
      onChange={setSellPct}
      ariaLabel="Select sell intensity"
      getMeta={sellIntensityMeta}
    />
  </label>
</div>


      <div className="flex items-center gap-3 pt-1">
        {/* Match Buy Planner "Save New" button UI */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="button disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="button-content">Generate Ladder</span>
        </button>
      </div>

      {err && <div className="text-xs text-red-300">{err}</div>}
      {msg && <div className="text-xs text-green-300">{msg}</div>}
    </div>
  )
}
