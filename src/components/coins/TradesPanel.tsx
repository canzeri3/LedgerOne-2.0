'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react'

// NEW: reuse existing math so the dynamic average respects ON-PLAN allocation
import {
  buildBuyLevels,
  computeBuyFills,
  type BuyLevel,
  type BuyTrade,
} from '@/lib/planner'

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
  avg_lock_price?: number | null
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

    setSelectedSellPlannerId(activeS?.id ?? '')
    setLoading(false)
  }

  useEffect(() => { loadPlanners() }, [user, id])

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

  // Compute the ON-PLAN moving average for the ACTIVE buy planner
  async function computeOnPlanAverage(): Promise<number> {
    const { data: bp, error: eBp } = await supabaseBrowser
      .from('buy_planners')
      .select('id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level')
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
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

const levels: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)


    const { data: buysRaw, error: eBuys } = await supabaseBrowser
      .from('trades')
      .select('price,quantity,fee,trade_time,side,buy_planner_id')
      .eq('user_id', user!.id)
      .eq('coingecko_id', id)
      .eq('side', 'buy')
      .eq('buy_planner_id', (bp as any).id)
      .order('trade_time', { ascending: true })
    if (eBuys) throw eBuys

    const buys: BuyTrade[] = (buysRaw ?? []).map(t => ({
      price: Number(t.price),
      quantity: Number(t.quantity),
      fee: Number((t as any).fee ?? 0),
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
      if (!activeBuy) { setErr('No active Buy Planner for this coin. Create one with Save New.'); setSaving(false); return }
      const payload = {
        user_id: user.id, coingecko_id: id, side: 'buy',
        price: p, quantity: quantityTokens, fee: feeNum, trade_time: trade_time_iso,
        buy_planner_id: activeBuy.id, sell_planner_id: activeSell?.id ?? null,
      }
      const { error } = await supabaseBrowser.from('trades').insert(payload as any)
      if (error) { setErr(error.message); setSaving(false); return }

      // NEW: Immediately regenerate ACTIVE sell ladder so rows/prices move with new average
      try { await regenerateActiveSellLadder() } catch { /* ignore soft errors */ }

      setOk('Buy recorded.')
      broadcast()
      resetAfterSubmit()
    } else {
      const chosen = selectedSellPlannerId || activeSell?.id || null
      if (!chosen) { setErr('No Sell Planner selected.'); setSaving(false); return }
      const payload = {
        user_id: user.id, coingecko_id: id, side: 'sell',
        price: p, quantity: quantityTokens, fee: feeNum, trade_time: trade_time_iso,
        sell_planner_id: chosen, buy_planner_id: null,
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
    setFee('')
    // Keep mode aligned with current side and re-lock
    setQtyMode(side === 'buy' ? 'usd' : 'tokens')
    setQtyLocked(true)
    setTime(new Date().toISOString().slice(0, 16))
  }

  const noActiveBuy = !activeBuy
  const noActiveSell = !activeSell

  // Side-colored focus helpers (thin ring + glow)
  const focusBorder = side === 'buy' ? 'focus:border-emerald-400/30' : 'focus:border-rose-400/30'
  const focusRing   = side === 'buy' ? 'focus:ring-emerald-400/40'   : 'focus:ring-rose-400/35'
  const focusGlow   = side === 'buy'
    ? 'focus:shadow-[0_0_12px_2px_rgba(16,185,129,0.25)]'
    : 'focus:shadow-[0_0_12px_2px_rgba(244,63,94,0.22)]'

  const fwBorder    = side === 'buy' ? 'focus-within:border-emerald-400/30' : 'focus-within:border-rose-400/30'
  const fwRing      = side === 'buy' ? 'focus-within:ring-emerald-400/40'   : 'focus-within:ring-rose-400/35'
  const fwGlow      = side === 'buy'
    ? 'focus-within:shadow-[0_0_12px_2px_rgba(16,185,129,0.25)]'
    : 'focus-within:shadow-[0_0_12px_2px_rgba(244,63,94,0.22)]'

  // Dynamic placeholder for Quantity
  const qtyPlaceholder = qtyMode === 'usd' ? 'Quantity USD $' : 'Quantity Tokens'

  return (
    <div className="add-trade-card text-[13px] rounded-2xl border border-slate-700/40 bg-slate-800/40 ring-1 ring-slate-600/30 p-3 space-y-3 w-full">
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

      {noActiveBuy && (
        <div className="text-[11px] rounded-md border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ring-1 ring-slate-600/30 px-2 py-1.5">
          No active Buy Planner for this coin. Go to <a className="underline" href="/planner">Planner</a> and click <span className="font-medium">Save New</span>.
        </div>
      )}
      {noActiveSell && (
        <div className="text-[11px] rounded-md border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ring-1 ring-slate-600/30 px-2 py-1.5">
          No active Sell Planner for this coin. Click <span className="font-medium">Save New</span> on the Buy Planner to create a new Sell epoch.
        </div>
      )}

      {/* Layout row */}
      <div className="grid gap-2 grid-cols-1 md:grid-cols-[10rem_1fr_1fr_10rem_1fr] min-w-0">

        {/* SIDE — thin ring + glow via :focus-within */}
        <div className={`side-equal rounded-2xl border border-slate-700/40 bg-[rgb(42,43,44)] ring-1 ring-[rgb(40,40,42)] px-3 h-[48px] min-w-0 flex items-center justify-between gap-2 transition-[box-shadow,colors] duration-150 focus-within:outline-none focus-within:ring-1 ${fwBorder} ${fwRing} ${fwGlow}`}>
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
            className={`no-spinner w-full h-[48px] min-w-0 rounded-2xl border border-slate-700/40 bg-[rgb(42,43,44)] ring-1 ring-[rgb(40,40,42)] px-3.5 py-2.5 md:text-[16px] transition-[box-shadow,colors] duration-150 focus:outline-none ${focusBorder} ${focusRing} ${focusGlow}`}
            placeholder="Price"
            inputMode="decimal"
            type="text"
            value={price}
            onChange={onPriceChange}
          />
        </div>

        {/* QUANTITY — wrapper gets thin ring + glow via :focus-within */}
        <div className="min-w-0">
          <div className={`relative h-[48px] rounded-2xl border border-slate-700/40 bg-slate-800/40 ring-1 ring-[rgb(40,40,42)] overflow-hidden transition-[box-shadow,colors] duration-150 focus-within:outline-none focus-within:ring-1 ${fwBorder} ${fwRing} ${fwGlow}`}>
            <input
              ref={qtyRef}
              className="no-spinner w-full h-full min-w-0 bg-[rgb(42,43,44)] px-3.5 py-2.5 md:text-[16px] pr-24 focus:outline-none"
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
  className="absolute inset-y-0 right-16 w-8 grid place-items-center text-[rgb(154,159,169)] hover:opacity-90"
  title={qtyLocked ? 'Quantity mode locked (click to unlock)' : 'Quantity mode unlocked (click to lock)'}
  aria-pressed={!qtyLocked}
  aria-label={qtyLocked ? 'Locked' : 'Unlocked'}
>
  {qtyLocked ? <LockKeyhole size={14} strokeWidth={2} /> : <LockKeyholeOpen size={14} strokeWidth={2} />}
</button>



            {/* Right-side selector */}
            <div
              className="absolute inset-y-0 right-0 w-16 border-l border-slate-700/40 rounded-r-[4px] overflow-hidden"
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
                  className={`flex-1 text-[11px] px-2 flex items-center justify-center select-none
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
                  className={`flex-1 text-[11px] px-2 flex items-center justify-center select-none
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
            className={`no-spinner w-full h-[48px] min-w-0 rounded-2xl border border-slate-700/40 bg-[rgb(42,43,44)] ring-1 ring-[rgb(40,40,42)] px-3.5 py-2.5 md:text-[16px] transition-[box-shadow,colors] duration-150 focus:outline-none ${focusBorder} ${focusRing} ${focusGlow}`}
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
            className={`w-full h-[48px] min-w-0 rounded-2xl border border-slate-700/40 bg-[rgb(42,43,44)] ring-1 ring-[rgb(40,40,42)] px-3.5 py-2.5 md:text-[16px] transition-[box-shadow,colors] duration-150 focus:outline-none text-[rgb(157,163,175)]`}
            placeholder="Trade time"
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      {/* SELL override (unchanged focus coloring based on side) */}
      {side === 'sell' && (
        <div className="grid gap-2 md:grid-cols-8">
          <div className="md:col-span-5 text-[11px] text-slate-400">
            Sells default to the <span className="font-medium">Active</span> Sell Planner. You can override below.
          </div>

          {/* Single dropdown with version-aligned labels */}
          <select
            value={selectedSellPlannerId}
            onChange={(e) => setSelectedSellPlannerId(e.target.value)}
            className={`md:col-span-3 text-[15px] rounded-2xl border border-slate-700/40 bg-[rgb(42,43,44)] text-[rgb(227,232,240)] ring-1 ring-[rgb(40,40,42)] px-3.5 py-2.5 transition-[box-shadow,colors] duration-150 focus:outline-none ${focusBorder} ${focusRing} ${focusGlow}`}
            title="Choose which Sell Planner this trade should belong to"
          >
            <option value="" disabled>
              {sellPlanners.length ? 'Select Sell Planner' : 'No Sell Planners yet'}
            </option>

            {/* Active first (if present) */}
            {plannerOptions.filter(p => {
              const src = sellPlanners.find(s => s.id === p.id)
              return !!src?.is_active
            }).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}

            {/* Frozen newest → oldest as Planner N..1 */}
            {plannerOptions.filter(p => {
              const src = sellPlanners.find(s => s.id === p.id)
              return src && !src.is_active
            }).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={submitTrade}
          disabled={!canSubmit || saving}
          className={`text-sm rounded-xl border border-slate-700/40 ring-1 ring-slate-600/30 px-3 py-2 ${
            !canSubmit || saving
              ? 'bg-[rgb(31,32,33)] backdrop-blur-[0px] text-slate-500 cursor-not-allowed'
              : 'bg-[rgb(42,43,44)] backdrop-blur-[0px] hover:bg-[rgb(61,61,61)] text-slate-200'
          }`}
        >
          {saving ? 'Saving…' : 'Add Trade'}
        </button>
        <button
          onClick={resetAfterSubmit}
          className="text-sm rounded-xl border border-slate-700/40 bg-[rgb(42,43,44)] backdrop-blur-[0px] ring-1 ring-slate-600/30 px-3 py-2 hover:bg-[rgb(61,61,61)] text-slate-200"
          type="button"
        >
          Reset
        </button>
      </div>

      <p className="text-[11px] text-[rgb(158,159,159)]">
        BUYs are tagged to the active Buy & Sell planners; SELLs default to the active Sell planner, but you can assign
        them to any Frozen planner for accurate ladder fills and realized P&L.
      </p>
    </div>
  )
}
