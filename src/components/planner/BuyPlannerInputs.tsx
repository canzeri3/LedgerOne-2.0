'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import useSWR, { useSWRConfig } from 'swr'

import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'
import PlanLimitModal from '@/components/billing/PlanLimitModal'

import type { BuyPlannerRow } from '@/types/db'

/* ── numeric helpers ───────────────────────────────────────── */
const stripCommas = (v: string) => v.replace(/,/g, '')
const toNum = (v: any) => {
  if (v === '' || v == null) return NaN
  return Number(typeof v === 'string' ? stripCommas(v) : v)
}

// keep only digits and a single decimal point
function normalizeDecimalInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '')
  const parts = s.split('.')
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('')
  return s
}

function formatWithCommas(raw: string): string {
  if (!raw) return ''
  const [intPart, decPart] = raw.split('.')
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas
}

/* ── Risk depth metadata ───────────────────────────────────── */

type RiskDepth = '70' | '75' | '90'

function DepthMeta(opt: RiskDepth) {
  if (opt === '70') {
    const levels = 6
    const bars = Array.from({ length: levels })
    return {
      shortLabel: 'Moderate',
      title: 'Moderate profile',
      desc: '70% depth',
      levels,
      bars,
    }
  }

  if (opt === '75') {
    const levels = 3
    const bars = Array.from({ length: levels })
    return {
      shortLabel: 'Aggressive',
      title: 'Aggressive profile',
      desc: '75% depth',
      levels,
      bars,
    }
  }

  // 90% depth: conservative
  const levels = 8
  const bars = Array.from({ length: levels })
  return {
    shortLabel: 'Conservative',
    title: 'Conservative profile',
    desc: '90% depth',
    levels,
    bars,
  }
}


/* ── Risk profile dropdown (your preferred UI) ─────────────── */

function LadderDepthDropdown({
  value,
  onChange,
}: {
  value: RiskDepth
  onChange: (v: RiskDepth) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // Order in UI: Conservative (90), Moderate (70), Aggressive (75)
  const OPTIONS: RiskDepth[] = ['90', '70', '75']


  // Close when clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Keyboard: basic open/close
  useEffect(() => {
    const btn = buttonRef.current
    if (!btn) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !open) {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        return
      }
    }
    btn.addEventListener('keydown', onKey)
    return () => btn.removeEventListener('keydown', onKey)
  }, [open])

  const baseBg = 'bg-[rgb(41,42,43)]'
  const baseText = 'text-slate-200'
  const noBorder =
    'outline-none border-none focus:outline-none focus:ring-0 focus:border-transparent'
  const heightPad = 'px-3 py-2.5'
  const radiusClosed = 'rounded-lg'
  const muted = 'text-slate-400'

  const currentMeta = DepthMeta(value)

  return (
    <div ref={wrapRef} className="relative">
      {/* Control */}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="ladder-depth-listbox"
        onClick={() => setOpen(o => !o)}
        className={`${baseBg} ${baseText} ${noBorder} ${heightPad} w-full text-left select-none
                    flex items-center justify-between ${radiusClosed}`}
      >
        <span className="text-sm flex items-center gap-2">
          {currentMeta.shortLabel}
          <span className="text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300">
            {currentMeta.desc}
          </span>
        </span>
        <span
          className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(54,55,56)]"
          aria-hidden="true"
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
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.24 4.4a.75.75 0 01-1.08 0l-4.24-4.4a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>

      {/* Inline dropdown menu (no absolute positioning outside container) */}
      {open && (
        <div
          id="ladder-depth-listbox"
          role="listbox"
          aria-label="Select risk profile"
          className={`${baseBg} ${baseText} ${noBorder} mt-2 w-full rounded-lg border border-[rgb(32,33,34)] shadow-lg`}
        >
          <div className="py-1">
            {OPTIONS.map(opt => {
              const meta = DepthMeta(opt)
              const selected = opt === value
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
                  className={`w-full text-left px-3 py-2 transition
                              ${selected ? 'bg-[rgb(47,48,49)]' : 'hover:bg-[rgb(47,48,49)]'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm">{meta.title}</span>
                      <span className={`text-[12px] ${muted}`}>{meta.desc}</span>
                    </div>
                    <span className="text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300">
                      {meta.levels} levels
                    </span>
                  </div>

                  {/* mini level bars */}
                  <div className="mt-2 flex items-center gap-1">
                    {meta.bars.map((_, i) => (
                      <span
                        key={i}
                        className="h-1.5 rounded-sm bg-[rgb(75,76,78)]"
                        style={{ width: 12 + (i % 3) * 2 }}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Anchor type for admin-defined tops
type CoinAnchor = {
  coingecko_id: string
  anchor_top_price: number | null
}

export default function BuyPlannerInputs({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()
  const { mutate: mutateGlobal } = useSWRConfig()

  // Load latest (current) buy planner for this coin
  const { data: planner, mutate } = useSWR<BuyPlannerRow | null>(
    user && coingeckoId ? ['/buy-planner/latest', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select(
          'id,user_id,coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,started_at,is_active'
        )
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
  // Active sell planner (if present) — used to determine whether this coin is already a "planned asset"
  const { data: sellActive } = useSWR<{ id: string } | null>(
    user && coingeckoId ? ['/sell-planner/active', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error && (error as any).code !== 'PGRST116') throw error
      return (data as any) ?? null
    },
    { refreshInterval: 60_000 }
  )

  // Entitlements (planned asset limits)
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  const plannedLimit = entitlements?.plannedAssetsLimit ?? 0
  const plannedUsed = entitlements?.plannedAssetsUsed ?? 0

  const limitApplies = user && !entLoading && plannedLimit !== null && plannedLimit > 0
  const limitReached = Boolean(limitApplies && plannedUsed >= (plannedLimit as number))

  const hasActiveBuy = Boolean(planner?.is_active)
  const hasActiveSell = Boolean(sellActive)
  const coinAlreadyPlanned = hasActiveBuy || hasActiveSell

  // New planned coin = this coin currently has no active buy/sell planner
  const addingNewPlannedCoin = user && !coinAlreadyPlanned
  const blockNewPlannedCoin = Boolean(limitReached && addingNewPlannedCoin)

  // Admin anchor for this coin (used only for display / admin override, resolved server-side)
  const { data: anchor } = useSWR<CoinAnchor | null>(
    coingeckoId ? ['/coin-anchors', coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('coin_anchors')
        .select('coingecko_id,anchor_top_price')
        .eq('coingecko_id', coingeckoId)
        .maybeSingle()
      if (error) throw error
      return (data as CoinAnchor) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  )

  // Form state
  const [budget, setBudget] = useState<string>('') // formatted with commas
  const [depth, setDepth] = useState<RiskDepth>('70')
  const [growth, setGrowth] = useState<string>('1.25') // internal only (no UI field)
  const [isDepthOpen, setIsDepthOpen] = useState(false)

  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalMsg, setLimitModalMsg] = useState<string>('')

  // Bridge: listen for global actions from the Card footer buttons
  useEffect(() => {
    function onAction(e: Event) {
      const ce = e as CustomEvent<{ action: 'edit' | 'save' | 'remove' }>
      if (!ce?.detail) return
      if (ce.detail.action === 'edit') onEdit()
      if (ce.detail.action === 'save') onSaveNew()
      if (ce.detail.action === 'remove') onClearPlanner()
    }
    window.addEventListener('buyplanner:action', onAction as EventListener)
    return () =>
      window.removeEventListener('buyplanner:action', onAction as EventListener)
  }, [budget, depth, growth, planner?.id, user?.id, anchor?.anchor_top_price])


 // Prefill from existing planner (top price stays in DB, no longer user-editable)
useEffect(() => {
  if (!planner) return
  const b = (planner.budget_usd ?? planner.total_budget) ?? ''
  setBudget(b === '' ? '' : formatWithCommas(String(b)))

  const rawDepth = String(planner.ladder_depth)
  if (rawDepth === '90') {
    setDepth('90')
  } else if (rawDepth === '75') {
    setDepth('75')
  } else {
    // default / legacy rows
    setDepth('70')
  }

  setGrowth(String(planner.growth_per_level ?? '1.25'))
}, [planner?.id])


  const validate = () => {
    const b = toNum(budget)
    if (!Number.isFinite(b) || b <= 0) return 'Enter a valid total budget'
    return null
  }

  // Growth is now an internal parameter (default 1.25), not user-facing
  const getGrowthOrDefault = () => {
    const raw = toNum(growth)
    if (!Number.isFinite(raw) || raw < 1.0) return 1.25
    return raw
  }

    // Edit current buy planner
  const onEdit = async () => {
    setErr(null)
    setMsg(null)
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    if (!user) {
      setErr('Not signed in.')
      return
    }
    if (!planner?.id) {
      setErr('No planner found to edit.')
      return
    }

    const numBudget = toNum(budget)
    const growthNum = getGrowthOrDefault()

    setBusy(true)
    try {
      const { error: e1 } = await supabaseBrowser
        .from('buy_planners')
        .update({
          // top_price is intentionally NOT updated here; existing top stays as-is
          budget_usd: numBudget,
          total_budget: numBudget,
          ladder_depth: Number(depth),
          growth_per_level: growthNum,
        })
        .eq('id', planner.id)
        .eq('user_id', user.id)

      if (e1) throw e1

      setMsg('Updated current Buy planner settings.')
      await mutate()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to update Buy planner.')
    } finally {
      setBusy(false)
    }
  }

  // Remove current planner (soft delete: mark as inactive)
  const onClearPlanner = async () => {
    setErr(null)
    setMsg(null)

    if (!user) {
      setErr('Not signed in.')
      return
    }
    if (!planner?.id) {
      setErr('No active Buy planner to remove.')
      return
    }

    const confirmed = window.confirm(
      'Remove the current Buy planner for this asset? This will stop alerts and the ladder for this coin, but keeps your past trades and history intact.'
    )
    if (!confirmed) return

    setBusy(true)
    try {
      const { error } = await supabaseBrowser
        .from('buy_planners')
        .update({ is_active: false })
        .eq('id', planner.id)
        .eq('user_id', user.id)

      if (error) throw error

      setMsg('Removed current Buy planner for this coin.')
      await mutate()

      // Kick other planner-related SWR caches so UI updates immediately
      mutateGlobal(['/buy-planner/active', user.id, coingeckoId])
      mutateGlobal(['/buy-planner/active-ladder', user.id, coingeckoId])
      mutateGlobal(['/alerts/buy-planners', user.id])
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to remove Buy planner.')
    } finally {
      setBusy(false)
    }
  }

  // Save New via atomic RPC (uses per-user top price from price-cycle logic)
  const onSaveNew = async () => {
    setErr(null)
    setMsg(null)
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    if (!user) {
      setErr('Not signed in.')
      return
    }
    // Tier limit enforcement (basic): unlimited planners per coin, but cap distinct planned coins.
    // If this save would introduce a NEW planned coin while at cap, block with a clear message.
    if (blockNewPlannedCoin) {
      setLimitModalMsg(
        `Your current plan supports up to ${plannedLimit} planned assets. You are currently at ${plannedUsed}/${plannedLimit}. ` +
          `To plan additional assets, upgrade your plan.`
      )
      setLimitModalOpen(true)
      return
    }


    const growthNum = getGrowthOrDefault()
    const budgetNum = toNum(budget)

    // Resolve the effective top price for this user/asset using the price-cycle engine.
    // This endpoint applies:
    //   - per-coin pump threshold (e.g., 50% vs 70%)
    //   - admin overrides (anchor_top_price) when configured
    //   - safe fallbacks when no pump cycle is found
    let topForNew: number | null = null

    try {
      const res = await fetch(
        `/api/planner/user-top-price?id=${encodeURIComponent(coingeckoId)}&currency=USD`,
        { method: 'GET' }
      )
      if (!res.ok) {
        throw new Error(
          `Unable to resolve price cycle (status ${res.status}). Please try again later.`
        )
      }
      const data = await res.json()
      const tp = typeof data?.topPrice === 'number' ? data.topPrice : NaN
      if (!Number.isFinite(tp) || tp <= 0) {
        throw new Error(
          'Top price for this asset could not be determined yet. Please try again later.'
        )
      }
      topForNew = tp
    } catch (e: any) {
      setErr(
        e?.message ??
          'Unable to resolve the current price cycle. Please try again later.'
      )
      return
    }

    setBusy(true)
    try {
      const { error } = await supabaseBrowser.rpc('rotate_buy_sell_planners', {
        p_coingecko_id: coingeckoId,
        p_top_price: topForNew,
        p_budget: budgetNum,
        p_ladder_depth: Number(depth),
        p_growth: growthNum,
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

  /* ── styles for text inputs (match dropdown) ─────────────── */
  const fieldShell =
    'mt-1 w-full rounded-lg bg-[rgb(41,42,43)] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-[120,121,125] border border-[rgb(58,59,63)] focus:outline-none focus:ring-0 focus:border-transparent appearance-none'

  /* ── onChange formatters ─────────────────────────────────── */
  const onChangeBudget = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeDecimalInput(e.target.value)
    setBudget(formatWithCommas(normalized))
  }

  return (
  <div className="p-2">
    <PlanLimitModal
      open={limitModalOpen}
      message={limitModalMsg}
      onClose={() => setLimitModalOpen(false)}
      upgradeHref="/pricing"
    />


      {/* Inputs only — no action buttons here */}
      <div className="space-y-4">
        {/* Total budget */}
        <label className="block">
          <span className="text-xs text-slate-300">Total budget (USD)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={busy}
            value={budget}
            onChange={onChangeBudget}
            className={fieldShell}
            placeholder="e.g. 10,000"
          />
        </label>

        {/* Risk profile — maps to ladder depth & levels under the hood */}
        <label className="block">
          <span className="text-xs text-slate-300">Risk profile</span>
          <LadderDepthDropdown value={depth} onChange={v => setDepth(v)} />
        </label>
      </div>

      {err && <div className="mt-2 text-xs text-red-300">{err}</div>}
      {msg && <div className="mt-2 text-xs text-green-300">{msg}</div>}
    </div>
  )
}
