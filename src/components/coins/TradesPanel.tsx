'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { usePrice } from '@/lib/dataCore'
import { fmtCurrency } from '@/lib/format'
import { buildBuyLevels, computeBuyFills, computeSellFills, type BuyLevel, type BuyTrade } from '@/lib/planner'
import { AlertTriangle, LockKeyhole, LockKeyholeOpen, X } from 'lucide-react'
import { mutate as globalMutate } from 'swr'




type PlannerId = string

type BuyPlanner = {
  id: PlannerId
  user_id: string
  coingecko_id: string
  is_active: boolean | null
  started_at: string | null

  // Settings used to build the buy ladder (same fields used by BuyPlannerLadder)
  top_price?: number | null
  budget_usd?: number | null
  total_budget?: number | null
  ladder_depth?: 70 | 75 | 90 | number | null
  growth_per_level?: number | null
}

type SellPlanner = {
  id: PlannerId
  user_id: string
  coingecko_id: string
  is_active: boolean
  created_at: string
  frozen_at: string | null
  avg_lock_price?: number | null
}
type ConfirmOffPlanCtx = {
  tradeSide: 'buy' | 'sell'
  plannerLabel: string
  allowedTokens: number
  enteredTokens: number
  allowedUsd: number
  enteredUsd: number
}

type PendingSell = {
  chosenId: PlannerId
  payload: {
    user_id: string
    coingecko_id: string
    side: 'sell'
    price: number
    quantity: number
    fee: number
    trade_time: string
    sell_planner_id: PlannerId
    buy_planner_id: null
  }
}

type PendingBuy = {
  buyPlannerId: PlannerId
  sellPlannerId: PlannerId | null
  payload: {
    user_id: string
    coingecko_id: string
    side: 'buy'
    price: number
    quantity: number
    fee: number
    trade_time: string
    buy_planner_id: PlannerId
    sell_planner_id: PlannerId | null
  }
}
/** Local "YYYY-MM-DDTHH:mm" -> ISO */
function toIso(localValue: string): string {
  try {
    const d = new Date(localValue)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch {}
  return new Date().toISOString()
}

/** Keep digits and only the first '.' */
function sanitizeKeepFirstDot(s: string): string {
  let seenDot = false
  let out = ''
  for (const ch of (s || '')) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (ch === '.') {
      if (!seenDot) { out += ch; seenDot = true }
    }
  }
  return out
}

/** Group thousands in the integer part */
function groupInt(intStr: string): string {
  if (!intStr) return ''
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Format sanitized string with grouping commas */
function formatGrouped(raw: string): string {
  if (!raw) return ''
  if (raw === '.') return '.'
  const [intPart, decPart] = raw.split('.')
  const intGrouped = groupInt(intPart || '')
  return decPart !== undefined ? `${intGrouped}.${decPart}` : intGrouped
}

/** Parse number from a formatted string with commas */
function parseNum(v: string): number {
  if (!v) return NaN
  return Number(v.replace(/,/g, ''))
}

/** Restore caret so the same count of [0-9 or .] lies to the left after formatting */
function setCaretFromLogicalCount(input: HTMLInputElement, formatted: string, logicalCount: number) {
  let count = 0
  let pos = 0
  for (; pos < formatted.length; pos++) {
    const ch = formatted[pos]
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      count++
      if (count === logicalCount) { pos += 1; break }
    }
  }
  const finalPos = logicalCount === 0 ? 0 : (pos <= formatted.length ? pos : formatted.length)
  input.setSelectionRange(finalPos, finalPos)
}

/** Create an onChange handler that formats as-you-type and preserves caret */
function makeLiveNumericChangeHandler(
  ref: React.RefObject<HTMLInputElement>,
  setValue: (v: string) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const rawCaretBefore = el.selectionStart ?? el.value.length

    // Count logical (digits + only first dot) before caret
    const before = el.value.slice(0, rawCaretBefore)
    const logicalBefore = sanitizeKeepFirstDot(before.replace(/,/g, ''))
    const logicalCount = logicalBefore.length

    // Sanitize and format full string
    const sanitized = sanitizeKeepFirstDot(el.value.replace(/,/g, ''))
    const formatted = formatGrouped(sanitized)

    setValue(formatted)
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      setCaretFromLogicalCount(node, formatted, logicalCount)
    })
  }
}

type PlannerOpt = { id: PlannerId; label: string }

function SellPlannerSelector({
  value,
  plannerOptions,
  sellPlanners,
  onChange,
}: {
  value: PlannerId
  plannerOptions: PlannerOpt[]
  sellPlanners: SellPlanner[]
  onChange: (id: PlannerId) => void
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const MENU_ANIM_MS = 140

  const baseBg = 'bg-[rgb(41,42,43)]'
  const baseText = 'text-slate-200'
  const noBorder = 'outline-none border-none focus:outline-none focus:ring-0 focus:border-transparent'
const heightPad = 'px-3 py-2.5'
  const radiusClosed = 'rounded-lg'
  const muted = 'text-slate-400'

  const hasOptions = plannerOptions.length > 0

  // Build ordering: Active first, then Frozen (newest -> oldest) using sellPlanners source-of-truth.
  const orderedOptions: PlannerOpt[] = (() => {
    const activeIds = new Set(sellPlanners.filter(p => p.is_active).map(p => p.id))
    const active = plannerOptions.filter(o => activeIds.has(o.id))
    const frozen = plannerOptions.filter(o => !activeIds.has(o.id))
    return [...active, ...frozen]
  })()

  const getStatus = (id: PlannerId) => {
    const p = sellPlanners.find(x => x.id === id)
    return p?.is_active ? 'Live' : 'Frozen'
  }

  const getDesc = (id: PlannerId) => {
    const p = sellPlanners.find(x => x.id === id)
    return p?.is_active ? 'Current active Sell Planner' : 'Frozen Sell Planner'
  }

  const currentLabel =
    (value && plannerOptions.find(o => o.id === value)?.label) ||
    (hasOptions ? 'Select Sell Planner' : 'No Sell Planners yet')

  const currentChip = value ? getStatus(value) : ''

  // Close on outside click (only while open)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current && wrapRef.current.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Mount/unmount with delay to animate close
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    const t = window.setTimeout(() => setMounted(false), MENU_ANIM_MS)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  return (
    <div ref={wrapRef} className="relative mt-1">
      {/* Control (matches SellPlannerInputs dropdown card look) */}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Select sell planner"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!hasOptions}
        onClick={() => {
          if (!hasOptions) return
          setOpen(o => !o)
        }}
        onKeyDown={(e) => {
          if (!hasOptions) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(o => !o)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
        className={`${baseBg} ${baseText} ${noBorder} ${heightPad} w-full text-left select-none ${radiusClosed} ${
          hasOptions ? '' : 'opacity-60 cursor-not-allowed'
        }`}
      >
        <div className="inline-flex w-full items-center gap-1">
          <span className="text-sm">{currentLabel}</span>

          {currentChip ? (
            <span
              className="ml-1 text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300"
              style={{ flexShrink: 0 }}
            >
              {currentChip}
            </span>
          ) : null}

          <span
            className="inline-flex items-center justify-center rounded-full bg-[rgb(54,55,56)] ml-auto"
            aria-hidden="true"
            style={{ width: 20, height: 20, flexShrink: 0 }}
          >
            <svg
              className={`h-3 w-3 text-slate-200 transition-transform ${open ? 'rotate-180' : 'rotate-0'}`}
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

      {/* Dropdown menu (animated, same structure as SellPlannerInputs) */}
      {mounted && (
        <div
          role="listbox"
          aria-label="Sell planner options"
          aria-hidden={!open}
          data-state={open ? 'open' : 'closed'}
          className={`${baseBg} ${baseText} ${noBorder} absolute left-0 right-0 top-full mt-2 w-full rounded-lg border border-[rgb(32,33,34)] shadow-lg z-50 origin-top transition duration-150 ease-out will-change-transform will-change-opacity
            ${open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'}`}
        >
          <div className="py-1">
            {orderedOptions.map(opt => {
              const selected = opt.id === value
              const chip = getStatus(opt.id)
              const desc = getDesc(opt.id)

              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt.id)
                    setOpen(false)
                    buttonRef.current?.focus()
                  }}
                  className={`w-full text-left px-3 py-2 transition ${
                    selected ? 'bg-[rgb(47,48,49)]' : 'hover:bg-[rgb(47,48,49)]'
                  }`}
                >
                  <div className="inline-flex w-full items-center">
                    <span className="text-sm">{opt.label}</span>
                    <span
                      className="ml-auto text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300"
                      style={{ flexShrink: 0 }}
                    >
                      {chip}
                    </span>
                  </div>

                  <div className={`mt-1 text-[12px] ${muted}`}>{desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

type Props = { id: string }

export default function TradesPanel({ id }: Props) {
  const { user } = useUser()

  // form state
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [price, setPrice] = useState<string>('')
  const [qty, setQty] = useState<string>('') // tokens or USD based on qtyMode
  const [qtyMode, setQtyMode] = useState<'tokens' | 'usd'>('tokens')
  // NEW: lock the quantity mode to side (Buy=USD, Sell=Tokens) unless user unlocks
  const [qtyLocked, setQtyLocked] = useState<boolean>(true)
  const [fee, setFee] = useState<string>('') // keep empty so placeholder shows
  const [time, setTime] = useState<string>(() => new Date().toISOString().slice(0, 16))

  // input refs (for caret restoration)
  const priceRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const feeRef = useRef<HTMLInputElement>(null)

// live-format handlers
const onPriceChange = makeLiveNumericChangeHandler(
  priceRef as React.RefObject<HTMLInputElement>,
  setPrice,
)
const onQtyChange = makeLiveNumericChangeHandler(
  qtyRef as React.RefObject<HTMLInputElement>,
  setQty,
)
const onFeeChange = makeLiveNumericChangeHandler(
  feeRef as React.RefObject<HTMLInputElement>,
  setFee,
)

  // planners
  const [activeBuy, setActiveBuy] = useState<BuyPlanner | null>(null)
  const [activeSell, setActiveSell] = useState<SellPlanner | null>(null)
  const [sellPlanners, setSellPlanners] = useState<SellPlanner[]>([])
  const [selectedSellPlannerId, setSelectedSellPlannerId] = useState<PlannerId>('')
  // Keep latest selection accessible to event handlers (prevents stale-closure bugs)
  const selectedSellPlannerIdRef = useRef<PlannerId>('')
  useEffect(() => {
    selectedSellPlannerIdRef.current = selectedSellPlannerId
  }, [selectedSellPlannerId])
  // Build planner labels aligned with the Sell Planner card version selector:
  // - "Active" for active planner
  // - "Planner N" (newest has the largest N) for frozen planners
  const plannerOptions = useMemo(() => {
    const frozen = (sellPlanners || []).filter(p => !p.is_active)
    const N = frozen.length
    const labelFor = (p: SellPlanner) => {
      if (p.is_active) return 'Active'
      const idx = frozen.findIndex(x => x.id === p.id) // 0 = newest (because of created_at desc)
      return `Planner ${N - idx}` // newest => Planner N ... oldest => Planner 1
    }
    return (sellPlanners || []).map(p => ({ id: p.id, label: labelFor(p) }))
  }, [sellPlanners])

  // ui state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // NEW: per-coin holdings safeguard (tokens)
  const [holdingsTokens, setHoldingsTokens] = useState<number>(0)
  const [holdingsLoading, setHoldingsLoading] = useState<boolean>(false)

  // NEW: selected Sell Planner planned remaining tokens (drives "Available to sell" on TradesPanel)
  const [plannerRemainingTokens, setPlannerRemainingTokens] = useState<number>(0)
  const [plannerRemainingLoading, setPlannerRemainingLoading] = useState<boolean>(false)  // NEW: live price via NEW data core (used only to evaluate “yellow/alert” sell rows)
  const { row: priceRow } = usePrice(id, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })
  const livePrice = priceRow?.price ?? null

  // NEW: confirm modal when user sells more than the currently alerted (“yellow”) allocation
  const [confirmOffPlanOpen, setConfirmOffPlanOpen] = useState(false)
  const [confirmOffPlanCtx, setConfirmOffPlanCtx] = useState<ConfirmOffPlanCtx | null>(null)
  const [pendingSell, setPendingSell] = useState<PendingSell | null>(null)
  const [pendingBuy, setPendingBuy] = useState<PendingBuy | null>(null)

  // Modal refs (Cancel is focused by default; Panel is used for focus-trap)
  const confirmOffPlanCancelRef = useRef<HTMLButtonElement>(null)
  const confirmOffPlanPanelRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!confirmOffPlanOpen) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  // Scroll-lock (prevents background scrolling while modal is open)
  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  // Focus the safe action by default
  requestAnimationFrame(() => confirmOffPlanCancelRef.current?.focus())

  const focusableSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  const getFocusable = () => {
    const root = confirmOffPlanPanelRef.current
    if (!root) return [] as HTMLElement[]
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    return nodes.filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeConfirmOffPlan()
      return
    }

    // Focus trap: keep Tab navigation inside the modal
    if (e.key === 'Tab') {
      const focusables = getFocusable()
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }

  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = prevOverflow
  }
}, [confirmOffPlanOpen])
  function fmtTokens(x: number): string {
    if (!Number.isFinite(x)) return '0'
    const s = x.toFixed(8)
    return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  }

  async function fetchHoldingsTokensNow(opts?: { sellPlannerId?: PlannerId | null }): Promise<number> {
    if (!user) return 0

    let q = supabaseBrowser
      .from('trades')
      .select('side,quantity')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)

    const spid = opts?.sellPlannerId ?? null
    if (spid) q = q.eq('sell_planner_id', spid)

    const { data, error } = await q
    if (error) throw error

    let buys = 0
    let sells = 0
    for (const r of (data ?? []) as any[]) {
      const qty = Number(r.quantity || 0)
      if (r.side === 'buy') buys += qty
      else if (r.side === 'sell') sells += qty
    }
    return Math.max(0, buys - sells)
  }

async function refreshHoldingsTokens(_opts?: { sellPlannerId?: string }) {
      if (!user) { setHoldingsTokens(0); return }
    try {
      setHoldingsLoading(true)
      const v = await fetchHoldingsTokensNow()
      setHoldingsTokens(v)
    } catch {
      // DB trigger is the hard enforcement; this is a UX hint only
    } finally {
      setHoldingsLoading(false)
    }
  }

  // Planned remaining tokens on a Sell Planner:
  // SUM(sell_levels.sell_tokens) - SUM(trades.sell quantity for that sell_planner_id)
  async function fetchSellPlannerRemainingTokensNow(sellPlannerId: PlannerId): Promise<number> {
    if (!user || !sellPlannerId) return 0

    const [{ data: lvlRaw, error: e1 }, { data: sellsRaw, error: e2 }] = await Promise.all([
      supabaseBrowser
        .from('sell_levels')
        .select('sell_tokens')
        .eq('user_id', user.id)
        .eq('coingecko_id', id)
        .eq('sell_planner_id', sellPlannerId),
      supabaseBrowser
        .from('trades')
        .select('quantity')
        .eq('user_id', user.id)
        .eq('coingecko_id', id)
        .eq('side', 'sell')
        .eq('sell_planner_id', sellPlannerId),
    ])

    if (e1) throw e1
    if (e2) throw e2

    const planned = (lvlRaw ?? []).reduce((s: number, r: any) => s + Number(r.sell_tokens || 0), 0)
    const sold = (sellsRaw ?? []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0)

    return Math.max(0, planned - sold)
  }

  async function refreshPlannerRemainingTokens(forcePlannerId?: PlannerId | null) {
    if (!user) { setPlannerRemainingTokens(0); return }
    if (side !== 'sell') { setPlannerRemainingTokens(0); return }

    const spid = (forcePlannerId ?? selectedSellPlannerId ?? activeSell?.id ?? '') as PlannerId
    if (!spid) { setPlannerRemainingTokens(0); return }

    try {
      setPlannerRemainingLoading(true)
      const v = await fetchSellPlannerRemainingTokensNow(spid)
      setPlannerRemainingTokens(v)
    } catch {
      // UX hint only; never block trading UI
    } finally {
      setPlannerRemainingLoading(false)
    }
  }

  function refreshUiAfterTrade(opts: { buyPlannerId: string | null; sellPlannerId: string | null }) {
    if (!user) return
    const uid = user.id
    const cid = id

    // Recent trades list
    void globalMutate(['coin-trades', uid, cid])

    // Buy planner + ladder
    void globalMutate(['/buy-planner/active', uid, cid])
    void globalMutate(['/buy-planner/active-ladder', uid, cid])
    if (opts.buyPlannerId) {
      void globalMutate(['/trades/buys/by-planner', uid, cid, opts.buyPlannerId])
      void globalMutate(['/trades/buys/for-ladder', uid, cid, opts.buyPlannerId])
    }

    // Sell planner + ladder
    void globalMutate(['/sell-active', uid, cid])
    if (opts.sellPlannerId) {
      void globalMutate(['/sell-levels', uid, cid, opts.sellPlannerId])
      void globalMutate(['/sells', uid, cid, opts.sellPlannerId])
    }
  }

  function broadcast() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('buyPlannerUpdated', { detail: { coinId: id } }))
      window.dispatchEvent(new CustomEvent('sellPlannerUpdated', { detail: { coinId: id } }))
    }
  }



  async function loadPlanners() {
    if (!user) {
      setActiveBuy(null)
      setActiveSell(null)
      setSellPlanners([])
      setSelectedSellPlannerId('')
      setLoading(false)
      return
    }
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
        .select('id,user_id,coingecko_id,is_active,created_at,frozen_at,avg_lock_price')
        .eq('user_id', user.id)
        .eq('coingecko_id', id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (e1 && e1.code !== 'PGRST116') setErr(e1.message)
    if (e2) setErr(e2.message)

    const activeB = (bp as any) ?? null
    setActiveBuy(activeB)

    const allSP = (spAll ?? []) as SellPlanner[]
    setSellPlanners(allSP)
    const activeS = allSP.find(p => p.is_active) ?? null
    setActiveSell(activeS)

void refreshHoldingsTokens()
setLoading(false)  }

  useEffect(() => {
    loadPlanners()
    refreshHoldingsTokens()
    refreshPlannerRemainingTokens()

    if (typeof window === 'undefined') return
    const bump = (e: any) => {
      const detailCoin = e?.detail?.coinId
      if (detailCoin && detailCoin !== id) return
      refreshHoldingsTokens()
      refreshPlannerRemainingTokens()
    }
    window.addEventListener('buyPlannerUpdated', bump)
    window.addEventListener('sellPlannerUpdated', bump)
    return () => {
      window.removeEventListener('buyPlannerUpdated', bump)
      window.removeEventListener('sellPlannerUpdated', bump)
    }
  }, [user, id])

  // When user changes side or changes selected Sell Planner, recompute planned remaining
  useEffect(() => {
    if (!user) { setPlannerRemainingTokens(0); return }
    if (side !== 'sell') { setPlannerRemainingTokens(0); return }
    const spid = selectedSellPlannerId || activeSell?.id || ''
    if (!spid) { setPlannerRemainingTokens(0); return }
    void refreshPlannerRemainingTokens(spid)
  }, [user, id, side, selectedSellPlannerId, activeSell?.id])


  // Keep "Available to sell" synced to the current Sell Planner selection
  useEffect(() => {
    if (side !== 'sell') { setHoldingsTokens(0); return }
    void refreshHoldingsTokens({ sellPlannerId: selectedSellPlannerId })
  }, [side, selectedSellPlannerId])

  // NEW: whenever side changes, force canonical mode + re-lock
  useEffect(() => {
    setQtyMode(side === 'buy' ? 'usd' : 'tokens')
    setQtyLocked(true)
  }, [side])

  const canSubmit = useMemo(() => {
    const p = parseNum(price)
    const q = parseNum(qty)
    if (!(q > 0)) return false
    if (qtyMode === 'usd' && !(p > 0)) return false
    if (!user) return false
    if (side === 'buy') return !!activeBuy
    if (side === 'sell') return !!(selectedSellPlannerId || activeSell?.id)
    return false
  }, [user, side, price, qty, qtyMode, activeBuy, activeSell?.id, selectedSellPlannerId])

  // ─────────────────────────────────────────────────────────
  // NEW: helpers to REGENERATE active sell ladder after a BUY
  // ─────────────────────────────────────────────────────────

  // Infer ladder parameters (levels count, step %, % of remaining) from existing rows
  async function readCurrentSellLadderParams(sellPlannerId: string): Promise<{ levels: number; stepPct: number; pctOfRemaining: number }> {
    const { data, error } = await supabaseBrowser
      .from('sell_levels')
      .select('level,rise_pct,sell_pct_of_remaining')
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
      .eq('sell_planner_id', sellPlannerId)
      .order('level', { ascending: true })

    if (error) throw error
    const rows = (data ?? []) as Array<{ level: number; rise_pct: number | null; sell_pct_of_remaining: number | null }>
    const levels = rows.length || 8 // sensible fallback
    const first = rows[0]
    const stepPct = Number(first?.rise_pct ?? 50) // your UI default is 50
    const pctOfRemaining = Number(first?.sell_pct_of_remaining ?? 0.10) // default 10%
    return { levels, stepPct, pctOfRemaining }
  }
  // Compute user-specific average cost for the ACTIVE buy planner (trade-weighted)
  async function computeOnPlanAverage(): Promise<number> {
    // 1) Resolve the active buy planner for this coin
    const { data: bp, error: eBp } = await supabaseBrowser
      .from('buy_planners')
      .select('id')
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (eBp) throw eBp
    if (!bp?.id) return 0

    // 2) Pull all buy trades tied to the active buy planner and compute trade-weighted avg cost
    const { data: buysRaw, error: eBuys } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,trade_time')
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
      .eq('side', 'buy')
      .eq('buy_planner_id', bp.id)
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



  // Pool tokens = buys (active buy planner) - sells (active sell planner)
  async function computePoolTokens(sellPlannerId: string): Promise<number> {
    const { data: sells, error: e1 } = await supabaseBrowser
      .from('trades').select('quantity')
      .eq('user_id', user!.id).eq('coingecko_id', id)
      .eq('side', 'sell').eq('sell_planner_id', sellPlannerId)
    if (e1) throw e1
    const sold = (sells ?? []).reduce((a, r: any) => a + Number(r.quantity || 0), 0)

    const { data: bp } = await supabaseBrowser
      .from('buy_planners').select('id')
      .eq('user_id', user!.id).eq('coingecko_id', id)
      .eq('is_active', true).maybeSingle()

    let bought = 0
    if (bp?.id) {
      const { data: buys, error: e2 } = await supabaseBrowser
        .from('trades').select('quantity')
        .eq('user_id', user!.id).eq('coingecko_id', id)
        .eq('side', 'buy').eq('buy_planner_id', bp.id)
      if (e2) throw e2
      bought = (buys ?? []).reduce((a, r: any) => a + Number(r.quantity || 0), 0)
    }
    return Math.max(0, bought - sold)
  }

  // Regenerate the ACTIVE sell planner ladder using existing ladder params (levels/step/%)
  async function regenerateActiveSellLadder() {
    // locate active sell planner (should always be unlocked by your rule)
    const { data: activeSellRow, error: eS } = await supabaseBrowser
      .from('sell_planners')
      .select('id,is_active,avg_lock_price')
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (eS) throw eS
    if (!activeSellRow?.id) return

    const spId = activeSellRow.id
    // Infer current ladder shape
    const { levels: L, stepPct, pctOfRemaining } = await readCurrentSellLadderParams(spId)

    // Compute moving on-plan avg (ignore lock for ACTIVE per your rule)
    const avg = await computeOnPlanAverage()
    if (!(avg > 0)) return // need at least one on-plan buy

    // Recompute token pool
    const poolTokens = await computePoolTokens(spId)

    // Build plan with SAME shape (only prices change with new avg)
    const stepFrac = stepPct / 100
    let remaining = poolTokens
    const plan = Array.from({ length: L }, (_, i) => {
      const level = i + 1
      const rise_pct = stepPct * level
      const price = avg * (1 + stepFrac * level)
      const sell_tokens = i === L - 1 ? remaining : Math.max(0, remaining * pctOfRemaining)
      const sell_pct_of_remaining = pctOfRemaining
      remaining = Math.max(0, remaining - sell_tokens)
      return { level, rise_pct, price, sell_tokens, sell_pct_of_remaining }
    })

    // Replace ladder rows
    await supabaseBrowser
      .from('sell_levels')
      .delete()
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
      .eq('sell_planner_id', spId)

    if (plan.length) {
      const rows = plan.map(p => ({
        user_id: user!.id,
        coingecko_id: id,
        sell_planner_id: spId,
        level: p.level,
        rise_pct: p.rise_pct,
        price: p.price,
        sell_pct_of_remaining: p.sell_pct_of_remaining,
        sell_tokens: p.sell_tokens,
      }))
      const { error: eIns } = await supabaseBrowser.from('sell_levels').insert(rows)
      if (eIns) throw eIns
    }

    // Tell the rest of the UI (ladder, etc.)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sellPlannerUpdated', { detail: { coinId: id } }))
    }
  }
  // ─────────────────────────────────────────────────────────
  // NEW: “yellow row” allowance (Sell > alerted allocation => confirm)
  // ─────────────────────────────────────────────────────────
  const SELL_ALERT_TOLERANCE = 0.0005
  const ALERT_YELLOW_MULT = 0.985
  const ALERT_GREEN_PCT = 0.97

  async function computeAlertAllowance(
    sellPlannerId: string,
    referencePrice: number
  ): Promise<{ allowedTokens: number; hasLevels: boolean }> {
    if (!user) return { allowedTokens: 0, hasLevels: false }

    const { data: lvlRaw, error: eLvls } = await supabaseBrowser
      .from('sell_levels')
      .select('level,price,sell_tokens')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .eq('sell_planner_id', sellPlannerId)
      .order('level', { ascending: true })

    if (eLvls) throw eLvls
    const lvlRows = (lvlRaw ?? []) as Array<{ level: number; price: number | null; sell_tokens: number | null }>
    if (!lvlRows.length) return { allowedTokens: 0, hasLevels: false }

    const levels = lvlRows.map(r => ({
      target_price: Number(r.price ?? 0),
      planned_tokens: Math.max(0, Number(r.sell_tokens ?? 0)),
    }))

    const { data: sellsRaw, error: eSells } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,trade_time,side')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .eq('sell_planner_id', sellPlannerId)
      .eq('side', 'sell')
      .order('trade_time', { ascending: true })

    if (eSells) throw eSells

    const sells = (sellsRaw ?? []).map((r: any) => ({
      price: Number(r.price ?? 0),
      quantity: Number(r.quantity ?? 0),
      trade_time: r.trade_time ?? undefined,
    }))

    // Allocate prior sells to planned levels so we only allow the remaining “yellow” capacity
    const fill = computeSellFills(levels, sells, SELL_ALERT_TOLERANCE)
    const allocated = Array.isArray(fill?.allocatedTokens) ? fill.allocatedTokens : levels.map(() => 0)

    let allowedTokens = 0

    for (let i = 0; i < levels.length; i++) {
      const target = Number(levels[i].target_price || 0)
      const planned = Number(levels[i].planned_tokens || 0)
      if (!(target > 0) || !(planned > 0)) continue

      const alloc = Number(allocated[i] ?? 0)
      const pct = planned > 0 ? (alloc / planned) : 0
      const green = pct >= ALERT_GREEN_PCT
      const yellow = !green && referencePrice >= target * ALERT_YELLOW_MULT

      if (!yellow) continue

      // Remaining tokens in “yellow” rows are the planned sell capacity before we warn
      const remaining = Math.max(0, planned - alloc)
      allowedTokens += remaining
    }

    return { allowedTokens: Number(allowedTokens.toFixed(8)), hasLevels: true }
  }
  // ─────────────────────────────────────────────────────────
  // NEW: “yellow row” allowance (Buy > alerted allocation => confirm)
  // Reads the same Yellow/Green rules as BuyPlannerLadder:
  // - Yellow when live price <= level price * 1.015 (and level not ~full)
  // - Green when missing <= 2% of planned
  // Allowance is the SUM of remaining (missing) USD across CURRENT yellow rows.
  // ─────────────────────────────────────────────────────────
  async function computeBuyAlertAllowance(
    buyPlanner: BuyPlanner,
    referencePrice: number
  ): Promise<{ allowedUsd: number; allowedTokens: number; hasLevels: boolean }> {
    if (!user) return { allowedUsd: 0, allowedTokens: 0, hasLevels: false }

    const top = Number(buyPlanner.top_price ?? 0)
    const budget = Number(buyPlanner.budget_usd ?? buyPlanner.total_budget ?? 0)

    const depthNum = Number(buyPlanner.ladder_depth ?? 70)
    const depth = (depthNum === 90 ? 90 : depthNum === 75 ? 75 : 70) as 70 | 75 | 90

    const growth = Number(buyPlanner.growth_per_level ?? 1.25)

    const plan: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)
    if (!plan.length) return { allowedUsd: 0, allowedTokens: 0, hasLevels: false }

    const { data: buysRaw, error: eBuys } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,fee,trade_time')
      .eq('user_id', user.id)
      .eq('coingecko_id', id)
      .eq('side', 'buy')
      .eq('buy_planner_id', buyPlanner.id)
      .order('trade_time', { ascending: true })

    if (eBuys) throw eBuys

    const buys: BuyTrade[] = (buysRaw ?? []).map((r: any) => ({
      price: Number(r.price ?? 0),
      quantity: Number(r.quantity ?? 0),
      fee: r.fee != null ? Number(r.fee) : 0,
      trade_time: r.trade_time ?? undefined,
    }))

    const fills = computeBuyFills(plan, buys, 0)
    const allocatedUsd = Array.isArray((fills as any)?.allocatedUsd)
      ? ((fills as any).allocatedUsd as number[])
      : plan.map(() => 0)

    const hasRef = Number.isFinite(referencePrice) && referencePrice > 0
    if (!hasRef) return { allowedUsd: 0, allowedTokens: 0, hasLevels: true }

    let allowedUsd = 0
    const EPS = 1e-8

    for (let i = 0; i < plan.length; i++) {
      const plannedUsd = Number(plan[i].allocation ?? 0)
      const filledUsd = Number(allocatedUsd[i] ?? 0)
      const missingUsd = Math.max(0, plannedUsd - filledUsd)

      // Green when ≥98% filled (same as ladder)
      const full = plannedUsd > 0 && (missingUsd <= (plannedUsd * 0.02 + EPS))

      // Yellow when live price <= target * 1.015 (and not full)
      const lvlPx = Number(plan[i].price ?? 0)
      const yellow = !full && (lvlPx > 0) && referencePrice <= lvlPx * 1.015

      if (!yellow) continue
      allowedUsd += missingUsd
    }

    allowedUsd = Number(allowedUsd.toFixed(2))
    const allowedTokens = allowedUsd > 0 ? Number((allowedUsd / referencePrice).toFixed(8)) : 0

    return { allowedUsd, allowedTokens, hasLevels: true }
  }
  function plannerLabelFor(plannerId: string): string {
    return plannerOptions.find(p => p.id === plannerId)?.label ?? 'Selected planner'
  }

    function closeConfirmOffPlan() {
    setConfirmOffPlanOpen(false)
    setConfirmOffPlanCtx(null)
    setPendingSell(null)
    setPendingBuy(null)
  }

  async function confirmOffPlanProceed() {
    const sell = pendingSell
    const buy = pendingBuy
    if (!sell && !buy) { closeConfirmOffPlan(); return }

    // Capture pending payload before closing (close clears pending state)
    closeConfirmOffPlan()

    setSaving(true); setErr(null); setOk(null)
    try {
      if (buy) {
        const { error } = await supabaseBrowser.from('trades').insert(buy.payload as any)
        if (error) throw error

        // Keep existing behavior: after any BUY, regenerate the ACTIVE sell ladder
        try { await regenerateActiveSellLadder() } catch { /* ignore soft errors */ }

        setOk('Buy recorded.')
        broadcast()
        refreshUiAfterTrade({ buyPlannerId: buy.buyPlannerId, sellPlannerId: buy.sellPlannerId })
        refreshHoldingsTokens()
        resetAfterSubmit()
        return
      }

      if (sell) {
        const { error } = await supabaseBrowser.from('trades').insert(sell.payload as any)
        if (error) throw error

        setOk('Sell recorded.')
        broadcast()
        refreshUiAfterTrade({ buyPlannerId: null, sellPlannerId: sell.chosenId })
        refreshHoldingsTokens()
        resetAfterSubmit()
        return
      }
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }
    async function submitTrade() {
    if (!user) return
    setSaving(true); setErr(null); setOk(null)

    const trade_time_iso = toIso(time)

    const p = parseNum(price)
    const qEntered = parseNum(qty)
    const feeNum = parseNum(fee || '0') || 0
    let quantityTokens = qEntered
    if (qtyMode === 'usd') {
      if (!(p > 0)) { setErr('Enter a valid Price to convert $ to tokens.'); setSaving(false); return }
      quantityTokens = qEntered / p
    }

    if (side === 'buy') {
if (!activeBuy) { setErr('Cannot save trade: no active plan available for this coin.'); setSaving(false); return }
      const payload: PendingBuy['payload'] = {
        user_id: user.id, coingecko_id: id, side: 'buy',
        price: p, quantity: quantityTokens, fee: feeNum, trade_time: trade_time_iso,
        buy_planner_id: activeBuy.id, sell_planner_id: activeSell?.id ?? null,
      }

      // NEW: confirm if buy exceeds the “yellow/alert” allowance of the ACTIVE Buy Planner
      const refPx =
        Number.isFinite(livePrice as number) && (livePrice as number) > 0
          ? (livePrice as number)
          : (p > 0 ? p : null)

      if (refPx) {
        try {
          const { allowedUsd, allowedTokens, hasLevels } = await computeBuyAlertAllowance(activeBuy, refPx)
if (hasLevels && quantityTokens > (allowedTokens * 1.05) + 1e-12) {            setConfirmOffPlanCtx({
              tradeSide: 'buy',
              plannerLabel: 'Buy Planner',
              allowedTokens,
              enteredTokens: quantityTokens,
              allowedUsd,
              enteredUsd: quantityTokens * refPx,
            })
            setPendingBuy({
              buyPlannerId: activeBuy.id,
              sellPlannerId: activeSell?.id ?? null,
              payload,
            })
            setConfirmOffPlanOpen(true)
            setSaving(false)
            return
          }
        } catch {
          // Soft-fail: never block trade entry if allowance computation fails.
        }
      }

      const { error } = await supabaseBrowser.from('trades').insert(payload as any)
      if (error) { setErr(error.message); setSaving(false); return }      // NEW: Immediately regenerate ACTIVE sell ladder so rows/prices move with new average
      try { await regenerateActiveSellLadder() } catch { /* ignore soft errors */ }

          setOk('Buy recorded.')
      broadcast()
      refreshUiAfterTrade({ buyPlannerId: activeBuy.id, sellPlannerId: activeSell?.id ?? null })
      refreshHoldingsTokens()
      resetAfterSubmit()


      } else {
      const chosen = selectedSellPlannerId || activeSell?.id || null
      if (!chosen) { setErr('No Sell Planner selected.'); setSaving(false); return }

      // NEW: client-side precheck (DB trigger is the hard enforcement)
      try {
const available = await fetchHoldingsTokensNow({ sellPlannerId: chosen })
        if (quantityTokens > available + 1e-12) {
          setErr(`Insufficient holdings: available ${fmtTokens(available)}, trying to sell ${fmtTokens(quantityTokens)}.`)
          setSaving(false)
          return
        }
      } catch {
        // If this fails, allow DB trigger to enforce.
      }

      const payload: PendingSell['payload'] = {
        user_id: user.id, coingecko_id: id, side: 'sell',
        price: p, quantity: quantityTokens, fee: feeNum, trade_time: trade_time_iso,
        sell_planner_id: chosen, buy_planner_id: null,
      }

      // NEW: confirm if sell exceeds the “yellow/alert” allocation of the selected Sell Planner
      const refPx =
        Number.isFinite(livePrice as number) && (livePrice as number) > 0
          ? (livePrice as number)
          : (p > 0 ? p : null)

      if (refPx) {
        try {
          const { allowedTokens, hasLevels } = await computeAlertAllowance(chosen, refPx)
if (hasLevels && quantityTokens > (allowedTokens * 1.05) + 1e-12) {            setConfirmOffPlanCtx({
              tradeSide: 'sell',
              plannerLabel: plannerLabelFor(chosen),
              allowedTokens,
              enteredTokens: quantityTokens,
              allowedUsd: allowedTokens * refPx,
              enteredUsd: quantityTokens * refPx,
            })
            setPendingSell({ chosenId: chosen, payload })
            setConfirmOffPlanOpen(true)
            setSaving(false)
            return
          }
        } catch {
          // Soft-fail: never block trade entry if allowance computation fails.
        }
      }

      const { error } = await supabaseBrowser.from('trades').insert(payload as any)
      if (error) { setErr(error.message); setSaving(false); return }

      setOk('Sell recorded.')
      broadcast()
      refreshUiAfterTrade({ buyPlannerId: null, sellPlannerId: chosen })
      refreshHoldingsTokens()
      resetAfterSubmit()

    }

    setSaving(false)
  }

  function resetAfterSubmit() {
    setPrice('')
    setQty('')
    setFee('')
    // Keep mode aligned with current side and re-lock
    setQtyMode(side === 'buy' ? 'usd' : 'tokens')
    setQtyLocked(true)
    setTime(new Date().toISOString().slice(0, 16))
  }

  const noActiveBuy = !activeBuy
  const noActiveSell = !activeSell

  // Input styling to match Planner page input cards (no rings / no blue focus)
  const tradeInput =
    'w-full h-[48px] min-w-0 rounded-lg bg-[rgb(41,42,43)] px-3.5 py-2.5 text-[15px] md:text-[16px] text-slate-100 placeholder:text-[rgb(120,121,125)] border border-[rgb(58,59,63)] focus:outline-none focus:ring-0 focus:border-transparent appearance-none'

  // Backward/forward compatibility (some fields may still use tradeField)
  const tradeField = tradeInput

  const tradeShell =
    'rounded-lg border border-[rgb(58,59,63)] bg-[rgb(41,42,43)] transition-[box-shadow,colors] duration-150 focus-within:outline-none focus-within:ring-0 focus-within:border-transparent'
        // Dynamic placeholder for Quantity
  const qtyPlaceholder = qtyMode === 'usd' ? 'Quantity USD $' : 'Quantity Tokens'
  const confirmVerb = confirmOffPlanCtx?.tradeSide === 'buy' ? 'buy' : 'sell'
  return (
    <>
{confirmOffPlanOpen && confirmOffPlanCtx ? (
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-offplan-title"
    aria-describedby="confirm-offplan-desc"
  >
    {/* Backdrop (click outside to close) */}
    <button
      type="button"
      aria-label="Close confirmation"
      onClick={closeConfirmOffPlan}
      className="absolute inset-0 lg1-modal-backdrop"
    />

    {/* Panel */}
    <div
      ref={confirmOffPlanPanelRef}
      className="relative z-10 w-full max-w-lg lg1-modal-panel"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl border border-slate-700/50 bg-[rgba(16,17,19,0.92)] backdrop-blur-xl shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="px-6 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
<AlertTriangle
  aria-hidden="true"
  className="mt-1 h-5 w-5 shrink-0 text-amber-300 drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
/>

              <div className="min-w-0">
<h2 id="confirm-offplan-title" className="text-[13px] font-semibold text-slate-50 tracking-wide">
  Confirm {confirmVerb} amount
</h2>
<p id="confirm-offplan-desc" className="mt-1 text-[13px] leading-5 text-slate-300">
  This {confirmVerb} exceeds your planned amount based on the currently <span className="font-medium text-slate-100">alerted levels</span> in{' '}
  <span className="font-medium text-slate-100">{confirmOffPlanCtx.plannerLabel}</span>.
  If you proceed, the excess will be recorded as <span className="font-medium text-amber-300">Off-Plan</span>.
</p>              </div>
            </div>

            <button
              type="button"
              aria-label="Close"
              onClick={closeConfirmOffPlan}
              className="shrink-0 rounded-xl border border-slate-700/60 bg-white/5 p-2 text-slate-200 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Summary */}
          <div className="mt-4 rounded-2xl border border-slate-700/50 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Planned (alerted) allowance</div>
              <div className="text-[12px] tabular-nums text-slate-200">
                {fmtTokens(confirmOffPlanCtx.allowedTokens)} · {fmtCurrency(confirmOffPlanCtx.allowedUsd)}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Requested</div>
              <div className="text-[12px] tabular-nums text-slate-50">
                {fmtTokens(confirmOffPlanCtx.enteredTokens)} · {fmtCurrency(confirmOffPlanCtx.enteredUsd)}
              </div>
            </div>

            <div className="my-3 h-px bg-slate-700/50" />

            <div className="flex items-center justify-between gap-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Exceeds plan</div>
              <div className="text-[12px] tabular-nums font-semibold text-amber-300">
                {fmtTokens(Math.max(0, confirmOffPlanCtx.enteredTokens - confirmOffPlanCtx.allowedTokens))} ·{' '}
                {fmtCurrency(Math.max(0, confirmOffPlanCtx.enteredUsd - confirmOffPlanCtx.allowedUsd))}
              </div>
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-5 text-slate-400">
To remain on-plan, reduce the {confirmVerb} size to the planned allowance shown above.          </p>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-700/50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            ref={confirmOffPlanCancelRef}
            type="button"
            onClick={closeConfirmOffPlan}
            className="rounded-xl border border-slate-700/60 bg-white/5 px-3.5 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/10"
          >
            No, keep on plan
          </button>

          <button
            type="button"
            onClick={confirmOffPlanProceed}
            className="lg1-confirm-primary w-full sm:w-auto"
          >
            <span className="lg1-confirm-primary__content">Yes, proceed off-plan</span>
          </button>
        </div>
      </div>
    </div>
  </div>
) : null}
<div className="add-trade-card text-[13px] rounded-2xl bg-[rgba(16,17,19,0.72)] backdrop-blur-xl p-3 space-y-3 w-full shadow-[inset_0_1px_0_rgba(255,255,255,0.06),_0_24px_70px_-35px_rgba(0,0,0,0.88)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-lg">Add Trade</h2>

        <div className="text-[11px] text-slate-400">
          {loading ? 'Loading planners…' : (
            <>
              {activeBuy ? <span>Buy Plan: <span className="text-emerald-400">Active</span></span> : <span>Buy Plan: <span className="text-rose-400">None</span></span>}
              {' · '}
              {activeSell ? <span>Sell Plan: <span className="text-emerald-400">Active</span></span> : <span>Sell Plan: <span className="text-rose-400">None</span></span>}
            </>
          )}
        </div>
      </div>

      {err && <div className="text-[12px] text-rose-400">{err}</div>}
      {ok && <div className="text-[12px] text-emerald-400">{ok}</div>}

   

      {/* Layout row */}
      <div className="grid gap-2 grid-cols-1 md:grid-cols-[10rem_1fr_1fr_10rem_1fr] min-w-0">

        {/* SIDE — thin ring + glow via :focus-within */}
<div className={`side-equal ${tradeShell} px-3 h-[48px] min-w-0 flex items-center justify-between gap-2`}>
            <span className="text-[11px] text-slate-400 shrink-0">Side</span>
          <div className="radio-buttons-container shrink-0" role="radiogroup" aria-label="Trade side">
            <label className="radio-button">
              <input
                className="radio-button__input"
                type="radio"
                name="side"
                checked={side === 'buy'}
                onChange={() => setSide('buy')}
              />
              <span className="radio-button__label">
                <span className="radio-button__custom"></span>
                Buy
              </span>
            </label>
            <label className="radio-button">
              <input
                className="radio-button__input"
                type="radio"
                name="side"
                checked={side === 'sell'}
                onChange={() => setSide('sell')}
              />
              <span className="radio-button__label">
                <span className="radio-button__custom"></span>
                Sell
              </span>
            </label>
          </div>
        </div>

        {/* PRICE — thin ring + glow */}
        <div className="min-w-0">
          <input
            ref={priceRef}
className={`no-spinner ${tradeField}`}
            placeholder="Price"
            inputMode="decimal"
            type="text"
            value={price}
            onChange={onPriceChange}
          />
        </div>

        {/* QUANTITY — wrapper gets thin ring + glow via :focus-within */}
        <div className="min-w-0">
<div className={`relative h-[48px] min-w-0 overflow-hidden ${tradeShell}`}>
              <input
              ref={qtyRef}
className="no-spinner w-full h-full min-w-0 bg-transparent px-3.5 py-2.5 text-[15px] md:text-[16px] text-slate-100 placeholder:text-[120,121,125] pr-24 focus:outline-none focus:ring-0"
              placeholder={qtyMode === 'usd' ? 'Quantity USD $' : 'Quantity Tokens'}
              inputMode="decimal"
              type="text"
              value={qty}
              onChange={onQtyChange}
            />
            {/* NEW: small lock/unlock button controlling mode switching */}
<button
  type="button"
  onClick={() => setQtyLocked(l => !l)}
className="absolute inset-y-0 right-16 w-8 grid place-items-center text-[rgb(154,159,169)] hover:opacity-90 focus:outline-none"
  title={qtyLocked ? 'Quantity mode locked (click to unlock)' : 'Quantity mode unlocked (click to lock)'}
  aria-pressed={!qtyLocked}
  aria-label={qtyLocked ? 'Locked' : 'Unlocked'}
>
  {qtyLocked ? <LockKeyhole size={14} strokeWidth={2} /> : <LockKeyholeOpen size={14} strokeWidth={2} />}
</button>



            {/* Right-side selector */}
            <div
className="absolute inset-y-0 right-0 w-16 border-l border-[rgb(58,59,63)] overflow-hidden"
              role="group"
              aria-label="Quantity mode"
            >
              {/* sliding highlight: FILL selected half; no rounded edges (flush) */}
              <div
                className={`absolute left-0 right-0 top-0 h-1/2 bg-slate-700/70 transition-transform duration-200 ease-out ${qtyMode === 'usd' ? 'translate-y-full' : 'translate-y-0'}`}
                aria-hidden="true"
              />
              <div
                className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-slate-600/50 z-10"
                aria-hidden="true"
              />
              <div className="absolute inset-0 flex flex-col z-20">
                <button
                  type="button"
                  onClick={() => setQtyMode('tokens')}
                  disabled={qtyLocked}
className={`flex-1 text-[11px] px-2 flex items-center justify-center select-none focus:outline-none
            ${qtyMode === 'tokens' ? 'text-slate-100' : 'text-slate-300 hover:text-slate-100'}
            ${qtyLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                              aria-pressed={qtyMode === 'tokens'}
                >
                  Tokens
                </button>
                <button
                  type="button"
                  onClick={() => setQtyMode('usd')}
                  disabled={qtyLocked}
className={`flex-1 text-[11px] px-2 flex items-center justify-center select-none focus:outline-none
            ${qtyMode === 'usd' ? 'text-slate-100' : 'text-slate-300 hover:text-slate-100'}
            ${qtyLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                              aria-pressed={qtyMode === 'usd'}
                >
                  USD $
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* FEE — thin ring + glow */}
        <div className="min-w-0">
          <input
            ref={feeRef}
className={`no-spinner ${tradeField}`}
            placeholder="Fee (optional)"
            inputMode="decimal"
            type="text"
            value={fee}
            onChange={onFeeChange}
          />
        </div>

        {/* DATE/TIME — thin ring + glow */}
        <div className="min-w-0">
          <input
className={`${tradeInput} text-[rgb(157,163,175)]`}
            placeholder="Trade time"
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

{/* Actions row: (Sell) planner selector LEFT, helper text RIGHT of it, buttons FAR RIGHT */}
<div className="flex flex-col gap-2 md:flex-row md:items-center min-w-0">
  {/* Left: sell planner selector */}
  {side === 'sell' ? (
    <div className="w-full md:w-[240px] md:shrink-0">
      <SellPlannerSelector
        value={selectedSellPlannerId}
        plannerOptions={plannerOptions}
        sellPlanners={sellPlanners}
        onChange={setSelectedSellPlannerId}
      />
    </div>
  ) : null}

  {/* Middle: helper text */}
  {side === 'sell' ? (
    <div className="text-[11px] text-slate-400 leading-snug min-w-0 md:flex-1">
      <div>
        Sells default to the <span className="font-medium">Active</span> Sell Planner. Select the appropriate planner to log this sell.
      </div>

      {user && (
        <div>
          Available to sell:{' '}
          <span className="text-slate-200">
{plannerRemainingLoading ? '…' : fmtTokens(plannerRemainingTokens)}
          </span>{' '}
          tokens
        </div>
      )}
    </div>
  ) : (
    // Spacer keeps buttons right-aligned on desktop when not selling
    <div className="hidden md:block md:flex-1" />
  )}

  {/* Right: buttons */}
  <div className="flex gap-2 md:shrink-0 md:justify-end">
    <button
      onClick={submitTrade}
      disabled={!canSubmit || saving}
      className={`text-sm rounded-xl border border-slate-700/40 px-3 py-2 ${
        !canSubmit || saving
          ? 'bg-[rgb(31,32,33)] backdrop-blur-[0px] text-slate-500 cursor-not-allowed'
          : 'bg-[rgb(42,43,44)] backdrop-blur-[0px] hover:bg-[rgb(61,61,61)] text-slate-200'
      }`}
    >
      {saving ? 'Saving…' : 'Add Trade'}
    </button>

    <button
      onClick={resetAfterSubmit}
      className="text-sm rounded-xl border border-slate-700/40 bg-[rgb(42,43,44)] backdrop-blur-[0px] px-3 py-2 hover:bg-[rgb(61,61,61)] text-slate-200"
      type="button"
    >
      Reset
    </button>
  </div>
</div>
  
      </div>
      <style jsx>{`
  /* Matches Planner page "Save New" hover behavior (gradient reveal on hover) */
  .lg1-confirm-primary {
    position: relative;
    overflow: hidden;
    height: 2.5rem;
    padding: 0 1.25rem;
    border-radius: 0.75rem;
    background: #39364fff;
    background-size: 400%;
    color: #fff;
    font-size: 13px;
    line-height: 1.25rem;
    font-weight: 600;
    border: 1px solid rgb(58, 59, 63);
    cursor: pointer;
  }

  .lg1-confirm-primary__content {
    position: relative;
    z-index: 1;
  }

  .lg1-confirm-primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    transform: scaleX(0);
    transform-origin: 0 50%;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      82.3deg,
      rgba(109, 93, 186) 10.8%,
      rgba(109, 93, 186) 94.3%
    );
    transition: all 0.4s;
  }

  .lg1-confirm-primary:hover::before,
  .lg1-confirm-primary:focus-visible::before {
    transform: scaleX(1);
  }
  /* Modern modal: blur + soft fade + panel pop */
  .lg1-modal-backdrop {
    background: rgba(0, 0, 0, 0.62);
    backdrop-filter: blur(2px);
    animation: lg1BackdropIn 160ms ease-out both;
  }

  .lg1-modal-panel {
    animation: lg1PanelIn 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes lg1BackdropIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes lg1PanelIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lg1-modal-backdrop,
    .lg1-modal-panel {
      animation: none;
    }
  }
  `}</style>
    </>
  )
}
