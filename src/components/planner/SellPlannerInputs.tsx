'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import { useMenuTransition } from '@/lib/useMenuTransition'
import SlotPortal from '@/components/planner/SlotPortal'


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
      // 50% option
desc: 'Standard scale-out spacing',
chip: 'Tight',
      bars: 3,
    }
  }
  if (v === 100) {
    return {
      title: 'Medium',
      // 100% option
desc: 'Extended scale-out spacing',
chip: 'Extended',
      bars: 5,
    }
  }
  if (v === 150) {
    return {
      title: 'High',
      // 150% option
desc: 'Wide scale-out spacing',
chip: 'Wide',
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
// 10
desc: 'Light pace; gradual exposure reduction',
      chip: 'Low',
      bars: 3,
    }
  }
  if (v === 15) {
    return {
      title: 'Balanced Trim',
// 15
desc: 'Standard pace; steady exposure reduction',
      chip: 'Standard',
      bars: 4,
    }
  }
  if (v === 20) {
    return {
      title: 'Firm Trim',
// 20
desc: 'Firm pace; faster exposure reduction',   
   chip: 'High',
      bars: 5,
    }
  }
  if (v === 25) {
    return {
      title: 'Max Trim',
// 25
desc: 'Max pace; fastest exposure reduction',
      chip: 'Max',
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
  const { mounted, shown } = useMenuTransition(open)
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

  return (
    <div ref={wrapRef} className="dd">
      {/* Control */}
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
        className={`dd-trigger${open ? ' open' : ''}`}
      >
        <span className="lab">{currentMeta.title}</span>
        <span className="dd-badge">{currentMeta.chip}</span>
        <span className="dd-caret" aria-hidden="true">
          <svg
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : 'rotate-0'}`}
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
      </button>

      {/* Dropdown menu – 2-line structure */}
      {mounted && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          aria-hidden={!open}
          data-state={open ? 'open' : 'closed'}
          style={{ transformOrigin: 'top' }}
          className={`dd-panel hdr-pop z-50${shown ? ' is-open' : ''}`}
        >
          {options.map((opt) => {
            const meta = getMeta(opt)
            const selected = opt === value

            const bracketChip = meta.chip
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
                className={`dd-opt hdr-pop-item block w-full text-left${selected ? ' sel' : ''}`}
              >
                <div className="dd-opt-top">
                  <span className="dd-opt-name">{label}</span>
                  <span className="dd-badge">{bracketChip}</span>
                </div>

                <div className="dd-opt-desc">{meta.desc}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}// Main Sell planner inputs
export default function SellPlannerInputs({ coingeckoId }: { coingeckoId: string }) {

  const { user, loading: userLoading } = useUser()

  const { data: activeSell, mutate: mutateActiveSell } = useSWR<Planner | null>(
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
    return a ? `Avg lock: ${fmtCurrency(Number(a))}` : ''
  }, [activeSell?.avg_lock_price])

  // Pool = buys (active buy planner) - sells (this sell planner)
  const getPoolTokens = async (sellPlannerId: string) => {
    if (!user) return 0

    const { data: bp, error: eBp } = await supabaseBrowser
      .from('buy_planners')
      .select('id')
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('is_active', true)
      .maybeSingle()
    if (eBp) throw eBp
    const buyPlannerId = (bp as any)?.id
    if (!buyPlannerId) return 0

    const { data: sells, error: eS } = await supabaseBrowser
      .from('trades')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'sell')
      .eq('sell_planner_id', sellPlannerId)
    if (eS) throw eS
    const soldQty = (sells ?? []).reduce((sum, t: any) => sum + Number(t.quantity ?? 0), 0)

    const { data: buys, error: eB } = await supabaseBrowser
      .from('trades')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'buy')
      .eq('buy_planner_id', buyPlannerId)
    if (eB) throw eB
    const boughtQty = (buys ?? []).reduce((sum, t: any) => sum + Number(t.quantity ?? 0), 0)

    return Math.max(0, boughtQty - soldQty)
  }

  // User-specific avg cost for the CURRENT active buy planner (trade-weighted)
  const getCurrentBuyPlannerAvgCost = async (): Promise<number> => {
    if (!user) return 0

    const { data: bp, error: eBp } = await supabaseBrowser
      .from('buy_planners')
      .select('id')
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('is_active', true)
      .maybeSingle()
    if (eBp) throw eBp
    const buyPlannerId = (bp as any)?.id
    if (!buyPlannerId) return 0

    const { data: buysRaw, error: eBuys } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,trade_time')
      .eq('user_id', user.id)
      .eq('coingecko_id', coingeckoId)
      .eq('side', 'buy')
      .eq('buy_planner_id', buyPlannerId)
      .order('trade_time', { ascending: true })
    if (eBuys) throw eBuys

    let cost = 0
    let qty = 0
    for (const t of (buysRaw ?? []) as any[]) {
      const p = Number(t.price ?? 0)
      const q = Number(t.quantity ?? 0)
      if (!(p > 0) || !(q > 0)) continue
      cost += p * q
      qty += q
    }
    return qty > 0 ? cost / qty : 0
  }

  // NOTE: Legacy "on-plan" avg (ladder-based waterfall math) removed.
  // Sell ladder now uses the user's trade-weighted avg cost from the ACTIVE buy planner:
  // see getCurrentBuyPlannerAvgCost() + onGenerate().


  const onGenerate = async () => {
    setErr(null)
    setMsg(null)
    // Desktop exposes these controls as soon as the page renders. Do not turn
    // a click during auth hydration into a misleading "Not signed in" no-op.
    if (userLoading) return
    if (!user) {
      setErr('Not signed in.')
      return
    }

    if (!Number.isFinite(levels) || levels < 1 || levels > 60) {
      setErr('Levels must be between 1 and 60.')
      return
    }

    setBusy(true)
    try {
      // Re-read before generating. The cached value can still be null immediately
      // after Save New rotates the Buy/Sell planners.
      let sellPlanner = await mutateActiveSell()
      let liveAvg: number | null = null

      // Older/incomplete planner states can have an active Buy planner (and its
      // trades) without the companion Sell planner. Generate Ladder should repair
      // that state instead of leaving the user stuck.
      if (!sellPlanner?.id) {
        const { data: activeBuy, error: activeBuyError } = await supabaseBrowser
          .from('buy_planners')
          .select('id,top_price')
          .eq('user_id', user.id)
          .eq('coingecko_id', coingeckoId)
          .eq('is_active', true)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (activeBuyError) throw activeBuyError
        if (!activeBuy?.id) {
          setErr('Create an active Buy planner before generating a Sell ladder.')
          return
        }

        liveAvg = await getCurrentBuyPlannerAvgCost()
        if (!(liveAvg > 0)) {
          setErr('Enter your 1st buy before creating a sell planner.')
          return
        }

        const buyTopPrice = Number(activeBuy.top_price ?? 0)
        const { data: created, error: createError } = await supabaseBrowser
          .from('sell_planners')
          .insert({
            user_id: user.id,
            coingecko_id: coingeckoId,
            top_price: buyTopPrice > 0 ? buyTopPrice : liveAvg,
            avg_lock_price: null,
            is_active: true,
          })
          .select('id,avg_lock_price,created_at,is_active')
          .single()

        if (createError) {
          // If another refresh created it concurrently, use that row. Otherwise
          // preserve the real database error for diagnosis.
          sellPlanner = await mutateActiveSell()
          if (!sellPlanner?.id) throw createError
        } else {
          sellPlanner = created as Planner
          await mutateActiveSell(sellPlanner, { revalidate: false })
        }
      }

      const sellPlannerId = sellPlanner.id
      const poolTokens = await getPoolTokens(sellPlannerId)
      const locked = Number(sellPlanner.avg_lock_price || 0)
      liveAvg ??= await getCurrentBuyPlannerAvgCost()
      const avg = locked > 0 ? locked : liveAvg
      const baseAvg = avg > 0 ? avg : 0
      if (!baseAvg) {
        setErr('Enter your 1st buy before creating a sell planner.')
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
        .eq('sell_planner_id', sellPlannerId)

      // Insert with ALL required NOT-NULL columns
      const rows = plan.map((lv) => ({
        user_id: user.id,
        coingecko_id: coingeckoId,
        sell_planner_id: sellPlannerId,
        level: lv.level,
        rise_pct: lv.rise_pct,
        price: lv.price,
        sell_tokens: lv.sell_tokens,
        sell_pct_of_remaining: lv.sell_pct_of_remaining,
      }))

      const { error: eIns } = await supabaseBrowser.from('sell_levels').insert(rows)
      if (eIns) throw eIns

    setMsg('Level generation complete.')

      // Emit a browser event so ladder cards can refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sellPlannerUpdated', {
            detail: { coinId: coingeckoId, plannerId: sellPlannerId },
          })
        )
      }
          // Force immediate UI refresh (SWR) so user doesn’t need to reload
      await Promise.all([
        globalMutate(['/sell-active', user.id, coingeckoId]),
        globalMutate(['/sell-planner/active', user.id, coingeckoId]),
        globalMutate(['/sell-levels', user.id, coingeckoId, sellPlannerId]),
        globalMutate(['/sells', user.id, coingeckoId, sellPlannerId]),
      ])

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
    <div className="pl-controls">
      {/* Active plan switcher slot — the Active/History control renders here
          (portal target used by SellPlannerCombinedCard.Planner) */}
      <div className="field">
        <label>Active plan</label>
        <div id="sell-planner-header-right" className="flex items-center gap-2 min-h-[38px]" />
      </div>

      {/* Coin Volatility (step size per level) */}
      <div className="field">
        <label>Coin volatility</label>
        <SellDropdown
          value={step}
          options={stepOptions}
          onChange={setStep}
          ariaLabel="Select coin volatility"
          getMeta={sellVolatilityMeta}
        />
      </div>

      {/* Sell Intensity (% of remaining each level) */}
      <div className="field">
        <label>Sell intensity</label>
        <SellDropdown
          value={sellPct}
          options={sellPctOptions}
          onChange={setSellPct}
          ariaLabel="Select sell intensity"
          getMeta={sellIntensityMeta}
        />
      </div>

      {/* Edit Planner — top control; runs the same regenerate action as
          Generate Ladder, which now lives in the footer next to Delete */}
      <div className="field">
        <label aria-hidden="true">&nbsp;</label>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || userLoading}
          aria-busy={busy || undefined}
          className="btn disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? 'Updating…' : userLoading ? 'Loading…' : 'Edit Planner'}
        </button>
      </div>

      {/* Generate Ladder — moved to the card footer next to Delete. Portaled so it
          keeps this component's onGenerate handler and busy/disabled state. */}
      <SlotPortal slotId="sell-generate-slot">
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || userLoading}
          aria-busy={busy || undefined}
          className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? 'Generating…' : userLoading ? 'Loading…' : 'Generate Ladder'}
        </button>
      </SlotPortal>

      {(help || err || msg) && (
        <div
          className="field"
          style={{ justifyContent: 'flex-end' }}
          role={err ? 'alert' : 'status'}
          aria-live="polite"
        >
          {help && <div className="field-hint">{help}</div>}
          {err && <div className="text-xs text-red-300">{err}</div>}
          {msg && <div className="text-xs text-green-300">{msg}</div>}
        </div>
      )}
    </div>
  )
}
