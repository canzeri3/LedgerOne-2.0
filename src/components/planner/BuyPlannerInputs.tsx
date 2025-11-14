'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import type { BuyPlannerRow } from '@/types/db'

/* ── numeric helpers ───────────────────────────────────────── */
const stripCommas = (v: string) => v.replace(/,/g, '')
const toNum = (v: any) => {
  if (v === '' || v == null) return NaN
  return Number(typeof v === 'string' ? stripCommas(v) : v)
}

// keep only digits and a single decimal point
function normalizeDecimalInput(raw: string): string {
  if (!raw) return ''
  let s = stripCommas(raw).replace(/[^\d.]/g, '')
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

/* ── Visual helpers for the dropdown option ────────────────── */
function DepthMeta(opt: '70' | '90') {
  const levels = opt === '70' ? 6 : 8
  const range = opt === '70' ? '20–70%' : '20–90%'
  const title = opt === '70' ? 'Standard ladder' : 'Extended ladder'
  const desc = `${levels} levels • ${range} drawdowns`

  // tiny “level bars” (different counts for quick visual diff)
  const bars = Array.from({ length: levels })
  return { title, desc, levels, bars }
}

/* ── Polished, accessible dropdown for Ladder Depth ──────────
   - Seamless with input: same bg, same height, borderless, attached corners
   - Shows ONLY the opposite option (70% ⇄ 90%)
   - Clear visual differentiation (title, subtext, levels pill, mini-bars)
   - Keyboard: Enter/Space open/choose, Esc closes, ArrowUp/Down toggles
*/
function LadderDepthDropdown({
  value,
  onChange,
}: {
  value: '70' | '90'
  onChange: (v: '70' | '90') => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const optionRef = useRef<HTMLButtonElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Click outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Keyboard on the control
  useEffect(() => {
    const btn = buttonRef.current
    if (!btn) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !open) {
        e.preventDefault()
        setOpen(true)
        queueMicrotask(() => optionRef.current?.focus())
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const opposite = value === '70' ? '90' : '70'
        onChange(opposite)
        setOpen(false)
      }
    }
    btn.addEventListener('keydown', onKey)
    return () => btn.removeEventListener('keydown', onKey)
  }, [open, value, onChange])

  // Keyboard on the single option
  useEffect(() => {
    const el = optionRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const opposite = value === '70' ? '90' : '70'
        onChange(opposite)
        setOpen(false)
        buttonRef.current?.focus()
      }
      if (e.key === 'Tab') setOpen(false)
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [value, onChange])

  // Visual tokens
  const baseBg = 'bg-[rgb(41,42,43)]'
  const baseText = 'text-slate-200'
  const noBorder = 'outline-none border-none focus:outline-none focus:ring-0 focus:border-transparent'
  const heightPad = 'px-3 py-2.5'
  const radiusClosed = 'rounded-lg'
  const radiusOpenBtn = 'rounded-t-lg rounded-b-none'
  const radiusOpenList = 'rounded-b-lg rounded-t-none'
  const muted = 'text-slate-400'

  const opposite: '70' | '90' = value === '70' ? '90' : '70'
  const meta = DepthMeta(opposite)

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
                    flex items-center justify-between transition-[border-radius,transform] duration-150
                    ${open ? radiusOpenBtn : radiusClosed}`}
      >
        <span className="text-sm flex items-center gap-2">
          {value === '70' ? '70%' : '90%'}
          <span className="text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300">
            {value === '70' ? '6 levels' : '8 levels'}
          </span>
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"/>
        </svg>
      </button>

      {/* Attached expanding list */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out
                    ${open ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div
          id="ladder-depth-listbox"
          role="listbox"
          aria-label="Select ladder depth"
          className={`${baseBg} ${baseText} ${noBorder} w-full grid gap-1
                      ${radiusOpenList} px-2 py-2`}
        >
          {/* Only one, highly-differentiated option */}
          <button
            ref={optionRef}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => {
              onChange(opposite)
              setOpen(false)
              buttonRef.current?.focus()
            }}
        className={`w-full text-left rounded-md ${noBorder}
            hover:bg-[rgb(47,48,49)] focus:bg-[rgb(47,48,49)]
            px-3 py-2 ring-1 ring-slate-400/30 focus:ring-slate-300/40 transition`}

          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm">{meta.title} — {opposite}%</span>
                <span className={`text-[12px] ${muted}`}>{meta.desc}</span>
              </div>
              {/* levels pill */}
              <span className="text-[11px] leading-none px-2 py-1 rounded-md bg-[rgb(54,55,56)] text-slate-300">
                {meta.levels} levels
              </span>
            </div>

            {/* mini level bars row: more bars for 90% vs 70% */}
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
        </div>
      </div>
    </div>
  )
}

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
  const [top, setTop] = useState<string>('')        // formatted with commas
  const [budget, setBudget] = useState<string>('')  // formatted with commas
  const [depth, setDepth] = useState<'70' | '90'>('70')
  const [growth, setGrowth] = useState<string>('1.25') // left unformatted (no commas)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Bridge: listen for global actions from the Card footer buttons
  useEffect(() => {
    function onAction(e: Event) {
      const ce = e as CustomEvent<{ action: 'edit' | 'save' }>
      if (!ce?.detail) return
      if (ce.detail.action === 'edit') onEdit()
      if (ce.detail.action === 'save') onSaveNew()
    }
    window.addEventListener('buyplanner:action', onAction as EventListener)
    return () => window.removeEventListener('buyplanner:action', onAction as EventListener)
  }, [top, budget, depth, growth, planner?.id, user?.id])

  // Prefill from existing planner
  useEffect(() => {
    if (!planner) return
    const t = planner.top_price ?? ''
    const b = (planner.budget_usd ?? planner.total_budget) ?? ''
    setTop((t as any) === '' ? '' : formatWithCommas(String(t)))
    setBudget(b === '' ? '' : formatWithCommas(String(b)))
    setDepth(String(planner.ladder_depth) === '90' ? '90' : '70')
    setGrowth(String(planner.growth_per_level ?? '1.25'))

  }, [planner?.id])

  const validate = () => {
    const t = toNum(top), b = toNum(budget), g = toNum(growth)
    if (!Number.isFinite(t) || t <= 0) return 'Enter a valid recent top price'
    if (!Number.isFinite(b) || b <= 0) return 'Enter a valid total budget'
    if (!Number.isFinite(g) || g < 1.0) return 'Growth per level should be ≥ 1.0'
    return null
  }

  // Edit current buy planner
  const onEdit = async () => {
    setErr(null); setMsg(null)
    const v = validate(); if (v) { setErr(v); return }
    if (!user) { setErr('Not signed in.'); return }
    if (!planner?.id) { setErr('No planner found to edit.'); return }

    const numBudget = toNum(budget)
    setBusy(true)
    try {
      const { error: e1 } = await supabaseBrowser
        .from('buy_planners')
        .update({
          top_price: toNum(top),
          budget_usd: numBudget,
          total_budget: numBudget,
          ladder_depth: Number(depth),
          growth_per_level: toNum(growth),
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
      const { error } = await supabaseBrowser.rpc('rotate_buy_sell_planners', {
        p_coingecko_id: coingeckoId,
        p_top_price: toNum(top),
        p_budget: toNum(budget),
        p_ladder_depth: Number(depth),
        p_growth: toNum(growth),
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
    'mt-1 w-full rounded-lg bg-[rgb(41,42,43)] px-3 py-2.5 text-slate-200 outline-none border-none focus:outline-none focus:ring-0 focus:border-transparent appearance-none'

  /* ── onChange formatters for auto-commas ─────────────────── */
  const onChangeTop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeDecimalInput(e.target.value)
    setTop(formatWithCommas(normalized))
  }
  const onChangeBudget = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeDecimalInput(e.target.value)
    setBudget(formatWithCommas(normalized))
  }
  // growth remains plain decimal (no commas)
  const onChangeGrowth = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeDecimalInput(e.target.value)
    setGrowth(normalized)
  }

  return (
    <div className="p-2">
      {/* Inputs only — no action buttons here */}
      <div className="grid grid-cols-1 gap-2">
        {/* Top price (USD) */}
        <label className="block">
          <span className="text-xs text-slate-300">Top price (USD)</span>
          <input
            value={top}
            onChange={onChangeTop}
            className={fieldShell}
            placeholder="e.g. 65,000"
            inputMode="decimal"
          />
        </label>

        {/* Total Budget (USD) */}
        <label className="block">
          <span className="text-xs text-slate-300">Total Budget (USD)</span>
          <input
            value={budget}
            onChange={onChangeBudget}
            className={fieldShell}
            placeholder="e.g. 1,000"
            inputMode="decimal"
          />
        </label>

        {/* Ladder depth — polished attached dropdown w/ clear differentiation */}
        <label className="block">
          <span className="text-xs text-slate-300">Ladder depth</span>
          <LadderDepthDropdown
            value={depth}
            onChange={(v) => setDepth(v)}
          />
        </label>

        {/* Growth per level */}
        <label className="block">
          <span className="text-xs text-slate-300">Growth per level</span>
          <input
            value={growth}
            onChange={onChangeGrowth}
            className={fieldShell}
            placeholder="e.g. 1.25"
            inputMode="decimal"
          />
        </label>
      </div>

      {err && <div className="mt-2 text-xs text-red-300">{err}</div>}
      {msg && <div className="mt-2 text-xs text-green-300">{msg}</div>}
    </div>
  )
}
