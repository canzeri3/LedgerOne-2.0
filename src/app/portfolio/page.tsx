'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'
import { displayCurrencySymbol, fmtCurrency, fmtPct } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TrendingUp, TrendingDown, Search, ArrowUpDown, ChevronUp, ChevronDown, Info, Lock, ShieldCheck } from 'lucide-react'
import './portfolio-ui.css'
import CoinLogo from '@/components/common/CoinLogo'
import MobileHoldingSheet, { type MobileHoldingDetail } from '@/components/portfolio/MobileHoldingSheet'
import MobileRiskMetricSheet, { type MobileRiskMetricDetail } from '@/components/portfolio/MobileRiskMetricSheet'
import AllocationDonut from '@/components/portfolio/AllocationDonut'
import { useHistory } from '@/lib/dataCore' // NEW data core hooks only
import { useIsMobile } from '@/lib/useMediaQuery'
import RoutePageSkeleton from '@/components/common/RoutePageSkeleton'
import * as React from 'react'

/* ── SortSelect: wrapper owns the card chrome so shape/color match Search input ──
   - Background: rgb(42,43,44) (same as your Search input)
   - Border: 1px rgba(255,255,255,0.06)
   - Radius: 0.375rem (Tailwind rounded-md) to exactly match your Search input shape
   - Button is transparent; wrapper defines the visible corners.
*/
function SortSelect(props: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  ariaLabel?: string
  title?: string
}) {
  const { value, onChange, options, ariaLabel, title } = props
  const [open, setOpen] = React.useState(false)
  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)

  // Close on outside click / ESC
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return
      const t = e.target as Node
      if (menuRef.current && !menuRef.current.contains(t) && btnRef.current && !btnRef.current.contains(t)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)?.label ?? 'Select'

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    btnRef.current?.focus()
  }

  // Visual constants (match Holdings toolbar controls)
  // Resolves through the --lo-search-bg-exact token (dark :root value is the
  // same rgb(42,43,44); theme-light.css overrides it for light mode).
  const CARD_BG = 'var(--lo-search-bg-exact, rgb(42,43,44))'
  const CARD_RADIUS = '0.375rem' // rounded-md

  return (
    <div
      className="lo-select relative inline-block align-middle"
      style={{
        background: CARD_BG,
        border: 'none',                     // ← wrapper border removed
        borderRadius: CARD_RADIUS,
        height: 38,                         // match other controls
        minWidth: 120,                      // align with Direction/Comfort
      }}
      data-sort-select=""
    >
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
className="lo-select-trigger inline-flex items-center justify-between gap-1 px-2 text-sm"
        style={{
          height: 38,
          width: '100%',
          background: 'transparent',
          border: 0,                        // trigger border already 0 in CSS (kept here for durability)
          borderRadius: 'inherit',
          color: 'inherit',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="truncate">{selected}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" className="shrink-0">
          <path d="M5 7l5 6 5-6H5z" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          className="lo-select-menu absolute right-0 mt-2 min-w-[12rem]"
          style={{
            background: CARD_BG,
            // Intentionally keep a subtle border on the popout menu (nice affordance)
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: CARD_RADIUS,
            zIndex: 60,
          }}
        >
          {options.map(opt => {
            const active = opt.value === value
            return (
              <div
                role="option"
                aria-selected={active}
                key={opt.value}
                tabIndex={0}
                className={`
                  lo-select-item cursor-pointer select-none
                  ${active ? 'bg-white/10 text-white' : 'hover:bg-white/5'}
                `}
                onClick={() => pick(opt.value)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(opt.value)}
              >
                {opt.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type TradeRow = {
  coingecko_id: string
  side: 'buy'|'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  sell_planner_id: string | null
}
type CoinMeta = { coingecko_id: string; symbol: string; name: string }
type FrozenPlanner = { id: string; coingecko_id: string; avg_lock_price: number | null }
type Accent = 'pos' | 'neg' | 'neutral'

// ── FIX: pure utility functions at module level — allocated once, never re-created on render ──

function kpiAccent(n: number | null | undefined): Accent {
  return n == null ? 'neutral' : n > 0 ? 'pos' : n < 0 ? 'neg' : 'neutral'
}

function signedMoney(value: number): string {
  if (value > 0) return `+${fmtCurrency(value)}`
  if (value < 0) return `−${fmtCurrency(Math.abs(value))}`
  return fmtCurrency(0)
}

function MobileMetricPill({ label, value, tone = 'neutral' }: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const valueColor = tone === 'positive'
    ? 'text-[rgb(116,170,98)]'
    : tone === 'negative'
      ? 'text-[rgb(214,66,78)]'
      : 'text-slate-100'

  return (
    <div className="min-w-0 text-center">
      <div className="flex h-[58px] flex-col items-center justify-center gap-1 rounded-[18px] border border-[rgba(137,128,213,0.28)] bg-[rgba(137,128,213,0.10)] px-3">
        <span className={`max-w-full truncate text-[14px] font-semibold tabular-nums ${valueColor}`} title={value}>
          {value}
        </span>
        <span className="max-w-full truncate text-[8.5px] font-semibold uppercase leading-none tracking-[0.055em] text-slate-400">
          {label}
        </span>
      </div>
    </div>
  )
}

function MobileRiskFactor({ name, note, level, onClick }: {
  name: string
  note: string
  level: 'Low' | 'Moderate' | 'High' | 'Very High'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`View ${name} risk details`}
      className="min-w-0 w-full px-5 py-4 text-left transition-colors active:bg-white/[0.035] focus:outline-none focus-visible:bg-white/[0.035]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-slate-200">{name}</div>
          <div className="mt-1 truncate text-[10.5px] text-slate-500" title={note}>{note}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`pf-rk-lvl text-[10.5px] font-semibold ${lvCls(level)}`}>{level}</span>
          <Info className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
        </div>
      </div>
      <div className={`pf-rk-seg ${lvCls(level)} mt-3`} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <i key={index} className={index < levelFill(level) ? 'on' : ''} />
        ))}
      </div>
    </button>
  )
}

/** P&L summary card that toggles its value between $ and % (vs invested basis). */
function PLSum({ label, usd, invested }: { label: string; usd: number; invested: number }) {
  const [showPct, setShowPct] = useState(false)
  const accent = kpiAccent(usd)
  const cls = accent === 'pos' ? 'pos' : accent === 'neg' ? 'neg' : ''
  const pct = invested > 0 ? usd / invested : null
  const currencySymbol = displayCurrencySymbol()
  return (
    <div className="pf-sum">
      <div className="pf-label">{label}</div>
      <div className={`v ${cls}`}>{showPct && pct != null ? fmtPct(pct) : fmtCurrency(usd)}</div>
      {pct != null && (
        <button
          type="button"
          className={`pf-sum-pct${showPct ? ' on' : ''}`}
          onClick={() => setShowPct((v) => !v)}
          aria-label={showPct ? 'Show currency value' : 'Show percent'}
          title={showPct ? `Show ${currencySymbol}` : 'Show %'}
        >
          {showPct ? currencySymbol : '%'}
        </button>
      )}
    </div>
  )
}

/** level → skin color class (presentational) */
function lvCls(level: string): string {
  return level === 'Low' ? 'lv-low' : level === 'Moderate' ? 'lv-mod' : 'lv-high'
}

/** Filled segment count (of 6) for the risk-factor level meter. */
function levelFill(level: string): number {
  return level === 'Low' ? 2 : level === 'Moderate' ? 3 : level === 'High' ? 5 : 6
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function annVol30dFromDaily(points: {t:number; p:number}[]): number | null {
  if (!points || points.length < 31) return null
  const rets: number[] = []
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i-1].p
    const p1 = points[i].p
    if (p0 && p1 && p0 > 0) rets.push(Math.log(p1 / p0))
  }
  if (rets.length < 20) return null
  const mean = rets.reduce((a,b)=>a+b,0) / rets.length
  const varSum = rets.reduce((a,b)=>a + (b-mean)*(b-mean), 0)
  const stdev = Math.sqrt(varSum / Math.max(1, rets.length - 1))
  return stdev * Math.sqrt(365)
}

function smaSd20(points: {t:number; p:number}[]) {
  if (!points || points.length < 20) return { sma: null as number|null, sd: null as number|null }
  const last20 = points.slice(-20)
  const prices = last20.map(x => x.p).filter(p => typeof p === 'number') as number[]
  if (prices.length < 20) return { sma: null, sd: null }
  const sma = prices.reduce((a,b)=>a+b,0) / prices.length
  const mean = sma
  const varSum = prices.reduce((a,b)=>a+(b-mean)*(b-mean),0)
  const sd = Math.sqrt(varSum / Math.max(1, prices.length - 1))
  return { sma, sd }
}

function toLogReturns(points: { t: number; p: number }[]) {
  const out: { t: number; r: number }[] = []
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]?.p
    const p1 = points[i]?.p
    if (typeof p0 === 'number' && typeof p1 === 'number' && p0 > 0 && p1 > 0) {
      const r = Math.log(p1 / p0)
      if (Number.isFinite(r)) out.push({ t: points[i].t, r })
    }
  }
  return out
}

function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  if (n === 0) return NaN
  let sa = 0, sb = 0, sqa = 0, sqb = 0, sp = 0
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i]
    sa += x; sb += y; sqa += x*x; sqb += y*y; sp += x*y
  }
  const cov = sp / n - (sa / n) * (sb / n)
  const va = sqa / n - (sa / n) * (sa / n)
  const vb = sqb / n - (sb / n) * (sb / n)
  if (va <= 0 || vb <= 0) return NaN
  return cov / Math.sqrt(va * vb)
}

// FIX: corrToBTC accepts corrMap as explicit parameter — no closure over component state
function corrToBTC(id: string, corrMap: Map<string, {t:number;p:number}[] | undefined>): number | null {
  const btcPts = corrMap.get('bitcoin')
  const tgtPts = corrMap.get(id)
  if (!btcPts || !tgtPts) return null
  const br = toLogReturns(btcPts)
  const tr = toLogReturns(tgtPts)
  if (br.length < 30 || tr.length < 30) return null
  const map = new Map<number, number>()
  for (const b of br) map.set(Math.floor(b.t / 86400000), b.r)
  const paired: number[] = []
  const pairedBTC: number[] = []
  for (const x of tr) {
    const key = Math.floor(x.t / 86400000)
    const b = map.get(key)
    if (typeof b === 'number') { paired.push(x.r); pairedBTC.push(b) }
  }
  if (paired.length < 25) return null
  const c = pearson(paired, pairedBTC)
  return Number.isFinite(c) ? c : null
}

// ── FIX: sub-components at module level — stable identity across renders, no DOM remount on price tick ──
// StatCard's useState(showPct) also no longer resets every 15s as a result.

const StatCard = ({
  label,
  value,
  accent = 'neutral',
  icon,
  sub,
  pctValue,
  enablePctToggle = false,
}: {
  label: string
  value: React.ReactNode
  accent?: Accent
  icon?: 'up' | 'down'
  sub?: string
  pctValue?: React.ReactNode
  enablePctToggle?: boolean
}) => {
  const [showPct, setShowPct] = useState(false)

  const text =
    accent === 'pos'
      ? 'text-emerald-400'
      : accent === 'neg'
        ? 'text-[rgba(189,45,50,1)]'
        : 'text-slate-200'
  const iconUpClass = 'h-4 w-4 text-emerald-400'
  const iconDownClass = 'h-4 w-4 text-[rgba(189,45,50,1)]'

  const displayValue =
    enablePctToggle && showPct && pctValue != null
      ? pctValue
      : value

  return (
    <div className="relative h-full rounded-md bg-[rgb(28,29,31)]">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
          {icon === 'up' && <TrendingUp className={iconUpClass} />}
          {icon === 'down' && <TrendingDown className={iconDownClass} />}
        </div>
        <div className={`mt-2 text-xl md:text-2xl font-semibold tabular-nums ${text}`}>
          {displayValue}
        </div>
        {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      </div>

      {enablePctToggle && pctValue != null && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowPct((prev) => !prev)
          }}
          className="absolute bottom-1.5 right-2 text-[10px] text-slate-500 hover:text-slate-200"
          aria-label="Toggle between $ and % view"
        >
          %
        </button>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null
  const p = payload[0]
  const d = p?.payload as { full: string; name: string; value: number; pct: number }
  return (
    <div className="rounded-md bg-[rgb(24,25,27)] text-slate-100 shadow-xl border border-[rgb(42,43,45)] px-3 py-2 min-w-[180px]">
      {/* Primary line: Name + % */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-semibold text-sm leading-tight truncate">{d.full ?? d.name}</div>
        <div className="font-bold tabular-nums text-base">{fmtPct(d.pct)}</div>
      </div>

      {/* Secondary info: value and symbol */}
      <div className="mt-1 text-[11px] text-slate-300 flex items-center justify-between">
        <span className="tabular-nums">{fmtCurrency(d.value)}</span>
        <span className="uppercase tracking-wide">{d.name}</span>
      </div>
    </div>
  )
}

const LegendRow = ({ label, value }: { label: React.ReactNode; value: React.ReactNode }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-300">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
)

// Plain-English opener for a drill-down: what this factor means in everyday terms.
const PlainLead = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
)

// The one number that answers the question the lead just asked.
const BigStat = ({ value, sub, tone = 'neutral' }: {
  value: React.ReactNode; sub?: React.ReactNode; tone?: 'neutral' | 'bad' | 'good'
}) => (
  <div className={`text-2xl font-semibold tabular-nums ${
    tone === 'bad' ? 'text-[rgba(189,45,50,1)]'
    : tone === 'good' ? 'text-emerald-400'
    : 'text-slate-100'
  }`}>
    {value}
    {sub != null && <span className="ml-2 text-base font-normal text-slate-400">{sub}</span>}
  </div>
)

const CardFooter = ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
  <div className="border-t border-[rgb(42,43,45)] pt-3 flex items-center justify-between">
    <div className="text-xs">{left}</div>
    <div className="text-[11px] text-slate-400">{right}</div>
  </div>
)

const LevelBadge = ({ title, level, value }: { title: string; level: 'Low'|'Moderate'|'High'|'Very High'; value: string }) => {
  const accent =
    level === 'Low' ? 'text-emerald-400'
    : level === 'Moderate' ? 'text-[rgba(207,180,45,1)]'
    : level === 'High' ? 'text-[rgba(189,120,45,1)]'
    : 'text-[rgba(189,45,50,1)]'
  return (
    <div className="text-xs">
      <span className="text-slate-400 mr-2">{title}</span>
      <span className={`font-semibold tabular-nums capitalize ${accent}`}>{level}</span>
      {value !== '' && (
        <>
          <span className="text-slate-400"> · </span>
          <span className="tabular-nums">{value}</span>
        </>
      )}
    </div>
  )
}

const RiskBadge = ({ score, label }: { score: number; label: 'Low'|'Moderate'|'High' }) => {
  const accent =
    label === 'Low' ? 'text-emerald-400'
    : label === 'Moderate' ? 'text-[rgba(207,180,45,1)]'
    : 'text-[rgba(189,45,50,1)]'
  return (
    <div className="text-xs">
      <span className="text-slate-400 mr-2">Structure</span>
      <span className={`font-semibold tabular-nums ${accent}`}>{label}</span>
      <span className="text-slate-400"> · </span>
      <span className="tabular-nums">{score}</span>
    </div>
  )
}

const Pill = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'px-2 py-1 rounded-md text-xs',
      active ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
    ].join(' ')}
  >
    {children}
  </button>
)

function StatTile({
  label,
  value,
  rightHint,
  footer,
  className = '',
}: {
  label: string
  value: React.ReactNode
  rightHint?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={
        "rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgb(28,29,31)]/60 p-3 sm:p-4 shadow-sm " +
        "flex flex-col gap-2 min-h-[108px] " + className
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[rgba(255,255,255,0.55)]">
          {label}
        </div>
        {rightHint ? (
          <div className="text-[11px] text-[rgba(255,255,255,0.45)] whitespace-nowrap">
            {rightHint}
          </div>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div className="text-lg sm:text-xl font-semibold tabular-nums">
          {value}
        </div>
      </div>

      {footer ? (
        <div className="pt-1">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export default function PortfolioPage() {
  const isMobile = useIsMobile()
  const currencySymbol = displayCurrencySymbol()
  const { user, loading: userLoading } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  // Default-locked until entitlements load (prevents any Tier 0 "flash")
  const canViewPortfolioRisk = !entLoading && (entitlements?.tier ?? 'FREE') !== 'FREE'

  const router = useRouter()

  const { data: trades, isLoading: tradesLoading } = useSWR<TradeRow[]>(
    user ? ['/portfolio/trades', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('coingecko_id,side,price,quantity,fee,trade_time,sell_planner_id')
        .eq('user_id', user!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map(t => ({
        coingecko_id: t.coingecko_id,
        side: t.side,
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: t.fee ?? 0,
        trade_time: t.trade_time,
        sell_planner_id: t.sell_planner_id ?? null,
      }))
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  const { data: coins, isLoading: coinsLoading } = useSWR<CoinMeta[]>(
    user ? ['/portfolio/coins'] : null,
    async () => {
      const res = await fetch('/api/coins')
      const j = await res.json()
      return (j ?? []) as CoinMeta[]
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  const tradesByCoin = useMemo(() => {
    const m = new Map<string, TradeRow[]>()
    ;(trades ?? []).forEach(t => {
      if (!m.has(t.coingecko_id)) m.set(t.coingecko_id, [])
      m.get(t.coingecko_id)!.push(t)
    })
    return m
  }, [trades])

  const coinIds = useMemo(() => Array.from(tradesByCoin.keys()), [tradesByCoin])
  const coinKey = useMemo(() => [...coinIds].sort().join(','), [coinIds])

  const [frozen, setFrozen] = useState<FrozenPlanner[]>([])
  const [frozenSells, setFrozenSells] = useState<TradeRow[]>([])

  // Single combined effect: eliminates the serial waterfall (2 effects → 1 effect, 2 DB round-trips
  // remain sequential by necessity but we save one full React render cycle between them)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user || coinIds.length === 0) { setFrozen([]); setFrozenSells([]); return }

      const { data: planners } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,avg_lock_price,is_active')
        .eq('user_id', user.id)
        .in('coingecko_id', coinIds)
        .eq('is_active', false)
      if (cancelled) return

      const x = (planners ?? []).map(p => ({
        id: p.id,
        coingecko_id: p.coingecko_id,
        avg_lock_price: p.avg_lock_price,
      }))
      setFrozen(x)

      if (x.length === 0) { setFrozenSells([]); return }

      const { data } = await supabaseBrowser
        .from('trades')
        .select('coingecko_id,side,price,quantity,fee,trade_time,sell_planner_id')
        .eq('user_id', user.id)
        .eq('side', 'sell')
        .in('sell_planner_id', x.map(f => f.id))
      if (cancelled) return

      setFrozenSells((data ?? []).map(t => ({
        coingecko_id: t.coingecko_id,
        side: t.side,
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: t.fee ?? 0,
        trade_time: t.trade_time,
        sell_planner_id: t.sell_planner_id ?? null,
      })))
    })()
    return () => { cancelled = true }
  }, [user, coinKey])

  // Live snapshot pricing (new data core) for KPIs/table
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [chg24hPctMap, setChg24hPctMap] = useState<Record<string, number | null>>({})
  const [pricesReady, setPricesReady] = useState(false)

  useEffect(() => {
    if (coinIds.length === 0) { setPrices({}); setChg24hPctMap({}); setPricesReady(false); return }
    let cancelled = false

    async function fetchAll() {
      try {
        const url = `/api/prices?ids=${encodeURIComponent(coinIds.join(','))}`
        const res = await fetch(url, { cache: 'no-store' })
        const j = await res.json() as {
          rows?: Array<{ id: string; price?: number | null; pct24h?: number | null }>
          updatedAt?: string
        }

        const priceMap: Record<string, number> = {}
        const pctMap: Record<string, number | null> = {}

               for (const r of j.rows ?? []) {
          const id = r.id
          if (!id) continue

          // Live price (straight from data core)
          if (r.price != null && Number.isFinite(Number(r.price))) {
            priceMap[id] = Number(r.price)
          }

          // 24h pct from NEW data core:
          // - /api/prices returns pct24h as a PERCENT number (×100),
          //   e.g.  3.2   => 3.2%   move
          //         0.21  => 0.21%  move
          //         0.005 => 0.005% move (very small)
          //
          // Our downstream math (prev = last / (1 + chgPct)) expects a FRACTION of 1.0:
          //   0.032  => 3.2%
          //   0.0021 => 0.21%
          //   0.00005 => 0.005%
          if (r.pct24h != null && Number.isFinite(Number(r.pct24h))) {
            const raw = Number(r.pct24h)
            pctMap[id] = raw / 100
          }
        }


        if (!cancelled) {
          setPrices(priceMap)
          setChg24hPctMap(pctMap)
          setPricesReady(true)
        }
      } catch {
        if (!cancelled) {
          setPrices({})
          setChg24hPctMap({})
        }
      }
    }

    fetchAll()
    const id = setInterval(fetchAll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [coinKey])

  // FIX: O(1) coin metadata lookup — Map built once when coins loads, not O(N) find per coin per tick
  const coinMetaMap = useMemo(
    () => new Map((coins ?? []).map(c => [c.coingecko_id, c])),
    [coins]
  )

  const rows = useMemo(() => {
    // FIX: pre-build lookup maps for frozen data — O(1) access replaces nested .filter() O(N²)
    const frozenByCoin = new Map<string, FrozenPlanner[]>()
    for (const f of frozen) {
      if (!frozenByCoin.has(f.coingecko_id)) frozenByCoin.set(f.coingecko_id, [])
      frozenByCoin.get(f.coingecko_id)!.push(f)
    }
    const frozenSellsById = new Map<string, TradeRow[]>()
    for (const s of frozenSells) {
      if (s.sell_planner_id) {
        if (!frozenSellsById.has(s.sell_planner_id)) frozenSellsById.set(s.sell_planner_id, [])
        frozenSellsById.get(s.sell_planner_id)!.push(s)
      }
    }

    return coinIds.map(cid => {
      const t = tradesByCoin.get(cid) ?? []
      const pnl = computePnl(t.map(x => ({
        side: x.side, price: x.price, quantity: x.quantity, fee: x.fee ?? 0, trade_time: x.trade_time
      } as PnlTrade)))
      const qty = pnl.positionQty
      const avg = pnl.avgCost
      const last = prices[cid] ?? null
      const value = last != null ? qty * last : 0
      const costBasisRemaining = qty * avg
      const unrealUsd = value - costBasisRemaining

      const frozenForCoin = frozenByCoin.get(cid) ?? []
      const realizedUsd = frozenForCoin.reduce((acc, fp) => {
        const sells = frozenSellsById.get(fp.id) ?? []
        const locked = fp.avg_lock_price ?? 0
        const got = sells.reduce((a, s) => a + (s.quantity * s.price - (s.fee ?? 0)), 0)
        const spent = sells.reduce((a, s) => a + (s.quantity * locked), 0)
        return acc + (got - spent)
      }, 0)

      const chgPct = chg24hPctMap[cid] ?? null
      let delta24Usd = 0
      let delta24Pct: number | null = null
      if (last != null && chgPct != null) {
        const prev = last / (1 + chgPct)
        const prevVal = prev * qty
        delta24Usd = value - prevVal
        delta24Pct = prevVal > 0 ? (delta24Usd / prevVal) : null
      }

      const meta = coinMetaMap.get(cid)
      return {
        cid,
        symbol: meta?.symbol?.toUpperCase() ?? cid,
        name: meta?.name ?? cid,
        qty,
        avg,
        last,
        value,
        costBasisRemaining,
        unrealUsd,
        realizedUsd,
        totalPnl: unrealUsd + realizedUsd,
        delta24Usd,
        delta24Pct,
      }
    }).sort((a,b) => b.value - a.value)
  }, [coinIds, tradesByCoin, prices, coinMetaMap, frozen, frozenSells, chg24hPctMap])

  const totals = useMemo(() => {
    const value = rows.reduce((a, r) => a + r.value, 0)
    const invested = rows.reduce((a, r) => a + r.costBasisRemaining, 0)
    const unreal = rows.reduce((a, r) => a + r.unrealUsd, 0)
    const realized = rows.reduce((a, r) => a + r.realizedUsd, 0)
    const prevTotal = rows.reduce((a, r) => {
      const prev = (r.delta24Pct != null && r.value != null) ? (r.value / (r.delta24Pct + 1)) : r.value
      return a + (prev ?? 0)
    }, 0)
    const delta24Usd = value - prevTotal
    const delta24Pct = prevTotal > 0 ? (delta24Usd / prevTotal) : null
    return { value, invested, unreal, realized, total: unreal + realized, delta24Usd, delta24Pct }
  }, [rows])

  // ---- Portfolio-aware L2/L3 from server (/api/portfolio-risk), with safe fallback ----
 const riskKey = useMemo(() => {
  if (!canViewPortfolioRisk) return null
  if (!rows.length) return null
  const ids = rows.map(r => r.cid).join(',')
  const vals = rows.map(r => Math.max(0, r.value)).join(',')
  return [`/api/portfolio-risk`, coinKey, vals] as const
}, [rows, coinKey, canViewPortfolioRisk])


  const { data: prisk, error: priskErr } = useSWR(
    riskKey,
    async ([, _keyCoin, _vals]) => {
      const ids = rows.map(r => r.cid).join(',')
      const values = rows.map(r => Math.max(0, r.value)).join(',')
      const url = `/api/portfolio-risk?ids=${encodeURIComponent(ids)}&values=${encodeURIComponent(values)}&days=45&interval=daily&currency=USD`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`portfolio-risk HTTP ${res.status}`)
      return res.json()
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 10 * 60 * 1000, // 10m; server caches ~12h by allocHash
      keepPreviousData: true,
    }
  )

  // --- NEW: MCR (risk share) map from /api/portfolio-risk (non-breaking) ---
  const mcrById = useMemo<Record<string, number>>(
    () => (prisk?.l2?.riskContrib ?? {}) as Record<string, number>,
    [prisk]
  )

   // ---------------- Holdings UI state (client-side) ------------------
  type SortKey = 'name' | 'qty' | 'avg' | 'value' | 'invested' | 'unreal' | 'realized' | 'total'
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [dense, setDense] = useState(false)
  const [holdingsPctMode, setHoldingsPctMode] = useState(false)
  const [mobileHolding, setMobileHolding] = useState<MobileHoldingDetail | null>(null)
  const [mobileRiskMetric, setMobileRiskMetric] = useState<MobileRiskMetricDetail | null>(null)
  const closeMobileHolding = useCallback(() => setMobileHolding(null), [])
  const closeMobileRiskMetric = useCallback(() => setMobileRiskMetric(null), [])

  const filteredSorted = useMemo(() => {


    const q = query.trim().toLowerCase()
    let list = rows
    if (q.length) {
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q)
      )
    }
    const keyMap: Record<SortKey, (r: typeof rows[number]) => number | string> = {
      name: r => r.name,
      qty: r => r.qty,
      avg: r => r.avg,
      value: r => r.value,
      invested: r => r.costBasisRemaining,
      unreal: r => r.unrealUsd,
      realized: r => r.realizedUsd,
      total: r => r.totalPnl,
    }
    const get = keyMap[sortKey]
    const sorted = [...list].sort((a,b) => {
      const va = get(a)
      const vb = get(b)
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const na = Number(va)
      const nb = Number(vb)
      return sortDir === 'asc' ? na - nb : nb - na
    })
    return sorted
  }, [rows, query, sortKey, sortDir])

  // ---------------- Allocation (donut) ----------------------------
  const coinColor = useCallback((sym: string): string => {
    const s = sym.toUpperCase()
    const map: Record<string,string> = {
      BTC: '#F7931A', ETH: '#8A63D2', NEAR: '#00C08B', SOL: '#14F195', ADA: '#2A6AFF',
      XRP: '#23292F', BNB: '#F3BA2F', DOGE: '#C2A633', MATIC: '#8247E5', AVAX: '#E84142',
      DOT: '#E6007A', LTC: '#B8B8B8', LINK: '#2A5ADA', ATOM: '#6F7FFF', OP: '#FF0420',
      ARB: '#28A0F0', APT: '#1F1F1F', SUI: '#6CD3FF', TON: '#0098EA', TRX: '#C5001F',
    }
    if (map[s]) return map[s]
    const palette = ['#60A5FA','#F472B6','#34D399','#FBBF24','#C084FC','#38BDF8','#FB7185','#A3E635','#22D3EE','#F59E0B']
    const code = s.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    return palette[code % palette.length]
  }, [])

  const allocAll = useMemo(() => {
    const list = rows.map(r => ({ name: r.symbol, full: r.name, value: r.value, cid: r.cid }))
    const total = list.reduce((a, x) => a + x.value, 0)
    const withMeta = list
      .sort((a,b) => b.value - a.value)
      .map(x => ({
        ...x,
        pct: total > 0 ? x.value / total : 0,
        color: coinColor(x.name),
      }))
    return { total, data: withMeta }
  }, [rows, coinColor])

  // ---------------- Exposure & Risk card ----------------
  type ViewMode = 'combined' | 'sector' | 'rank' | 'vol' | 'tail' | 'div' | 'liq' | 'loss'
  // Drill-down overlay: null = closed; otherwise the factor tab being inspected (UI-only)
  const [riskDetail, setRiskDetail] = useState<ViewMode | null>(null)

  // Close the risk drill-down with Escape (presentation only)
  useEffect(() => {
    if (!riskDetail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRiskDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [riskDetail])

  const { data: snapshot } = useSWR<{ rows?: { id: string; rank?: number | null }[] }>(
    coinIds.length ? ['/portfolio/snapshot', coinKey] : null,
    async () => {
      const url = `/api/snapshot?ids=${encodeURIComponent(coinIds.join(','))}`
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) throw new Error('snapshot unavailable')
      return r.json()
    },
    { revalidateOnFocus: true, dedupingInterval: 60_000 }
  )

  // FIX: use snapshot?.rows directly as dep — no JSON.stringify serialization on every render
  const rankMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of snapshot?.rows ?? []) {
      if (row.id && typeof row.rank === 'number') m.set(row.id, row.rank)
      if (row.id && (row.rank as any) === null) m.set(row.id, null as any)
    }
    return m
  }, [snapshot?.rows])

  // Band aggregation + L1 structural factors
  // FIX: use allocAll.data and rankMap directly as deps — no JSON.stringify
  const sectorAgg = useMemo(() => {
    const total = allocAll.total
    const weights = allocAll.data.map(d => ({
      id: d.cid,
      pct: total > 0 ? d.value / total : 0,
      rank: rankMap.get(d.cid) ?? null,
    }))

    let blue = 0, large = 0, medium = 0, small = 0, unranked = 0
    for (const w of weights) {
      const r = w.rank
      if (r == null) { unranked += w.pct; continue }
      if (r >= 1 && r <= 2) blue += w.pct
      else if (r >= 3 && r <= 10) large += w.pct
      else if (r >= 11 && r <= 20) medium += w.pct
      else if (r >= 21 && r <= 50) small += w.pct
      else unranked += w.pct
    }

    const L1_blue   = 1.00
    const L1_large  = 1.25
    const L1_medium = 1.55
    const L1_small  = 1.85
    const L1_unrank = 1.85

    const structuralSum =
      blue    * L1_blue +
      large   * L1_large +
      medium  * L1_medium +
      small   * L1_small +
      unranked* L1_unrank

    const score = Math.round(structuralSum * 100)
    let label: 'Low' | 'Moderate' | 'High' =
      score <= 120 ? 'Low' : score <= 180 ? 'Moderate' : 'High'

    return { blue, large, medium, small, unranked, score, label, structuralSum }
  }, [allocAll.total, allocAll.data, rankMap])

  // --------- LAYER 2 & 3 helpers (BTC proxy fallback) ----------
const { points: btcDailyPts } = useHistory(canViewPortfolioRisk ? 'bitcoin' : null, 45, 'daily', 'USD')

  // Fallback proxy values
  const volAnn_proxy = annVol30dFromDaily(btcDailyPts)
  let volRegime_proxy: 'calm'|'normal'|'high'|'stress' = 'normal'
  let volMult_proxy = 1.00
  if (volAnn_proxy != null) {
    if (volAnn_proxy < 0.55) { volRegime_proxy = 'calm';   volMult_proxy = 0.90 }
    else if (volAnn_proxy < 0.80) { volRegime_proxy = 'normal'; volMult_proxy = 1.00 }
    else if (volAnn_proxy <= 1.10) { volRegime_proxy = 'high';   volMult_proxy = 1.25 }
    else { volRegime_proxy = 'stress'; volMult_proxy = 1.60 }
  }

  const { sma: sma20, sd: sd20 } = smaSd20(btcDailyPts)
  const lastPrice = btcDailyPts?.length ? btcDailyPts[btcDailyPts.length-1].p : null
  const bbLower = (sma20 != null && sd20 != null) ? (sma20 - 2*sd20) : null
  const tailActive_proxy = (lastPrice != null && bbLower != null && lastPrice < bbLower)
  const tailFactor_proxy = tailActive_proxy ? 1.35 : 1.00

  // --- Choose portfolio-aware values when available; else fallback to proxy ---
  const L2_regime = (prisk?.l2?.regime ?? volRegime_proxy) as 'calm'|'normal'|'high'|'stress'
  const L2_mult   = typeof prisk?.l2?.multiplier === 'number' ? prisk!.l2.multiplier : volMult_proxy
  const L2_annVol = typeof prisk?.l2?.annVol30d === 'number' ? prisk!.l2.annVol30d : volAnn_proxy

  const L3_share  = typeof prisk?.l3?.activationShare === 'number' ? prisk!.l3.activationShare : (tailActive_proxy ? 1 : 0)
  const L3_active = typeof prisk?.l3?.weightedTailActive === 'boolean' ? prisk!.l3.weightedTailActive : tailActive_proxy
  const L3_factor = typeof prisk?.l3?.factor === 'number' ? prisk!.l3.factor : tailFactor_proxy

  // ---- LAYER 4: Correlation (90d vs BTC) & LAYER 5: Liquidity (rank-proxy) ----
  // FIX: use allocAll.data directly as dep — no JSON.stringify
  const corrIds = useMemo(() => {
    const sorted = [...allocAll.data]
      .filter(r => r.cid !== 'bitcoin')
      .sort((a, b) => b.value - a.value)
      .map(r => r.cid)
    const picked: string[] = sorted.slice(0, 8)
    while (picked.length < 8) picked.push('bitcoin')
    return picked
  }, [allocAll.data])

  // CONSTANT number of hooks (9): one for BTC anchor + 8 slots
const hBTC = useHistory(canViewPortfolioRisk ? 'bitcoin' : null, 95, 'daily', 'USD')
const hC0  = useHistory(canViewPortfolioRisk ? corrIds[0] : null, 95, 'daily', 'USD')
const hC1  = useHistory(canViewPortfolioRisk ? corrIds[1] : null, 95, 'daily', 'USD')
const hC2  = useHistory(canViewPortfolioRisk ? corrIds[2] : null, 95, 'daily', 'USD')
const hC3  = useHistory(canViewPortfolioRisk ? corrIds[3] : null, 95, 'daily', 'USD')
const hC4  = useHistory(canViewPortfolioRisk ? corrIds[4] : null, 95, 'daily', 'USD')
const hC5  = useHistory(canViewPortfolioRisk ? corrIds[5] : null, 95, 'daily', 'USD')
const hC6  = useHistory(canViewPortfolioRisk ? corrIds[6] : null, 95, 'daily', 'USD')
const hC7  = useHistory(canViewPortfolioRisk ? corrIds[7] : null, 95, 'daily', 'USD')


  type Pts = { t:number; p:number }[] | undefined
  const corrMap = useMemo(() => {
    const m = new Map<string, Pts>()
    m.set('bitcoin', hBTC.points)
    m.set(corrIds[0], hC0.points)
    m.set(corrIds[1], hC1.points)
    m.set(corrIds[2], hC2.points)
    m.set(corrIds[3], hC3.points)
    m.set(corrIds[4], hC4.points)
    m.set(corrIds[5], hC5.points)
    m.set(corrIds[6], hC6.points)
    m.set(corrIds[7], hC7.points)
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hBTC.points,
    hC0.points, hC1.points, hC2.points, hC3.points,
    hC4.points, hC5.points, hC6.points, hC7.points,
    ...corrIds
  ])

  // FIX: corrToBTC now takes corrMap as argument (module-level pure fn); use allocAll.data and
  // corrIds as direct deps — no JSON.stringify, no ...spread in deps array
  const corrAgg = useMemo(() => {
    // Prefer the server's value-weighted correlation: it counts BTC at its own ρ=1.00 and
    // weights every holding by position size, so a 90% BTC / 10% XRP portfolio correctly
    // reads as "almost one bet on BTC" rather than as XRP's correlation alone.
    const serverAvg = typeof prisk?.l4?.avgCorrVsBtc === 'number' ? prisk.l4.avgCorrVsBtc : null

    let avg = serverAvg
    if (avg == null) {
      // Fallback: same weighting rules, computed client-side from the 8 largest non-BTC slots.
      const total = allocAll.total || 1
      let wsum = 0, acc = 0
      for (const r of allocAll.data) {
        const w = r.value / total
        if (!(w > 0)) continue
        const c = r.cid === 'bitcoin' ? 1 : corrToBTC(r.cid, corrMap)
        if (c == null) continue
        acc += c * w
        wsum += w
      }
      avg = wsum > 0 ? (acc / wsum) : null
    }

    // Bands are set for a BTC-inclusive average, which runs higher than the old
    // non-BTC-only figure: most real crypto portfolios land between 0.75 and 1.00.
    let factor = 1.00
    let level: 'Diversifier' | 'Neutral' | 'BTC-beta' | 'Ultra-beta'
    if (avg == null) { factor = 1.00; level = 'Neutral' }
    else if (avg < 0.70) { factor = 0.90; level = 'Diversifier' }
    else if (avg < 0.85) { factor = 1.00; level = 'Neutral' }
    else if (avg < 0.95) { factor = 1.10; level = 'BTC-beta' }
    else { factor = 1.20; level = 'Ultra-beta' }
    return { avg, factor, level, source: serverAvg != null ? 'server' as const : 'fallback' as const }
  }, [prisk, allocAll.data, allocAll.total, corrMap])

  // FIX: use allocAll.data and rankMap directly as deps — no JSON.stringify
  const liquidityAgg = useMemo(() => {
    const total = allocAll.total || 1
    let blue = 0, large = 0, medium = 0, small = 0, unranked = 0
    for (const r of allocAll.data) {
      const pct = r.value / total
      const rank = rankMap.get(r.cid) ?? null
      if (rank == null) { unranked += pct; continue }
      if (rank >= 1 && rank <= 2) blue += pct
      else if (rank >= 3 && rank <= 10) large += pct
      else if (rank >= 11 && rank <= 20) medium += pct
      else if (rank >= 21 && rank <= 50) small += pct
      else unranked += pct
    }
    const factor = (blue * 1.00) + (large * 1.20) + (medium * 1.40) + ((small + unranked) * 1.80)
    const level =
      factor <= 1.05 ? ('Low' as const)
      : factor <= 1.25 ? ('Moderate' as const)
      : factor <= 1.55 ? ('High' as const)
      : ('Very High' as const)
    return { factor, bands: { blue, large, medium, small, unranked }, level }
  }, [allocAll.data, rankMap])

  // ---- Helpers for levels/visuals (no logic change to calculations) ----
  const structuralLevel: 'Low'|'Moderate'|'High' =
    sectorAgg.score <= 120 ? 'Low' : sectorAgg.score <= 180 ? 'Moderate' : 'High'

  const volatilityLevel: 'Low'|'Moderate'|'High'|'Very High' =
    L2_annVol == null ? 'Moderate'
    : (L2_annVol < 0.55 ? 'Low' : (L2_annVol < 0.80 ? 'Moderate' : (L2_annVol <= 1.10 ? 'High' : 'Very High')))

  const tailLevel: 'Low'|'Moderate'|'High'|'Very High' = L3_active ? 'High' : 'Low'

  // ---- Diversification: does mixing these coins actually reduce risk? ----
  // Ratio = Σ(weight × each coin's own swing) ÷ portfolio swing.
  // 1.00 means mixing bought you nothing; above 1.00 means the mix smooths the ride.
  // This replaces Correlation as a *multiplier*: correlation is already inside the
  // covariance matrix behind L2's portfolio volatility, so charging for it again
  // double-counted the same risk.
  const L2_divRatio = typeof prisk?.l2?.diversificationRatio === 'number' && prisk.l2.diversificationRatio > 0
    ? prisk.l2.diversificationRatio
    : null
  // Share of volatility removed by holding a mix rather than a single asset.
  const divBenefit = L2_divRatio != null ? (1 - 1 / L2_divRatio) : null

  // Crypto diversification is genuinely weak — even a 5-way altcoin spread only reaches
  // ~1.07 — so the bands are tuned to that reality, not to equity-portfolio ratios.
  const divLevel: 'Low'|'Moderate'|'High'|'Very High' =
    L2_divRatio == null ? 'Moderate'
    : L2_divRatio >= 1.10 ? 'Low'
    : L2_divRatio >= 1.05 ? 'Moderate'
    : L2_divRatio >= 1.02 ? 'High'
    : 'Very High'

  // ---- Liquidity (server L5): days to exit at 20% of daily volume ----
  // Prefer the server figure: it blends the rank tier with days-to-liquidate, which depends on
  // how much you actually hold. The client-side tier-only value is the fallback.
  const L5_serverFactor = typeof prisk?.l5?.factor === 'number' ? prisk.l5.factor : null
  const L5_days     = typeof prisk?.l5?.daysToLiquidate === 'number' ? prisk.l5.daysToLiquidate : null
  const L5_coverage = typeof prisk?.l5?.volumeCoverage === 'number' ? prisk.l5.volumeCoverage : null
  const L5_partic   = typeof prisk?.l5?.participationRate === 'number' ? prisk.l5.participationRate : 0.20
  const L5_perAsset = (prisk?.l5?.perAsset ?? {}) as Record<string, { valueUsd: number; volume24h: number | null; days: number | null }>

  const liquidityRiskLevel: 'Low'|'Moderate'|'High'|'Very High' = (() => {
    const f = L5_serverFactor ?? liquidityAgg.factor
    return f <= 1.05 ? 'Low' : f <= 1.25 ? 'Moderate' : f <= 1.55 ? 'High' : 'Very High'
  })()

  // ---- Loss risk (server L6): average loss on the worst 5% of days ----
  const L6_es    = typeof prisk?.l6?.es95 === 'number' ? prisk.l6.es95 : null
  const L6_var   = typeof prisk?.l6?.var95 === 'number' ? prisk.l6.var95 : null
  const L6_obs   = typeof prisk?.l6?.observations === 'number' ? prisk.l6.observations : null
  const L6_worst = Array.isArray(prisk?.l6?.worstDays) ? prisk.l6.worstDays as { t: number; r: number }[] : []
  const L6_usd   = L6_es != null ? Math.abs(L6_es) * totals.value : null

  const lossLevel: 'Low'|'Moderate'|'High'|'Very High' =
    L6_es == null ? 'Moderate'
    : Math.abs(L6_es) < 0.03 ? 'Low'
    : Math.abs(L6_es) < 0.05 ? 'Moderate'
    : Math.abs(L6_es) < 0.08 ? 'High'
    : 'Very High'

  // Combined score (Structural × Volatility × Tail × Liquidity)
  // Correlation is deliberately NOT a term. L2_mult derives from covariance-based portfolio
  // volatility, which already prices in how much the holdings move together — a separate
  // correlation multiplier charged for that same risk a second time, and it cancelled out
  // the genuine risk reduction from shifting weight into BTC.
  const L5_mult = L5_serverFactor ?? liquidityAgg.factor
  const combinedScore = sectorAgg.structuralSum * L2_mult * L3_factor * L5_mult
  // ---- Bands anchored to an absolute reference, not to a score distribution ----
  // The formula has a natural unit. A portfolio of only BTC/ETH, in normal volatility, with no
  // tail signal and positions that exit inside a day, multiplies out to exactly:
  //   structural 1.00 x volatility 1.00 x tail 1.00 x liquidity 1.00 = 1.00
  // So the score reads as "how many times riskier than blue-chip crypto in normal conditions",
  // and the thresholds are round multiples of that baseline rather than percentile cutoffs.
  const RISK_BASELINE = 1.00
  const BAND_LOW  = 1.25  // within a quarter of baseline
  const BAND_MOD  = 2.00  // up to twice baseline
  const BAND_HIGH = 3.00  // up to three times baseline
  const BAND_TOP  = 5.00  // meter saturation; realistic worst case is ~7

  const combinedLevel: 'Low'|'Moderate'|'High'|'Very High' =
    combinedScore <= BAND_LOW ? 'Low'
    : combinedScore <= BAND_MOD ? 'Moderate'
    : combinedScore <= BAND_HIGH ? 'High'
    : 'Very High'

  // Visual meter (presentational). Piecewise so each band owns exactly one quarter of the track
  // and the marker always sits under its own label. A single linear 0.90–3.20 scale put the
  // boundaries at 15% / 48% / 91%, so the Low/Moderate/High/Very High ticks misreported where
  // the levels actually began.
  const meterPct = (() => {
    const s = combinedScore
    const seg = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo)
    if (!Number.isFinite(s) || s <= RISK_BASELINE * 0.9) return 0
    if (s <= BAND_LOW)  return seg(s, RISK_BASELINE * 0.9, BAND_LOW) * 25
    if (s <= BAND_MOD)  return 25 + seg(s, BAND_LOW, BAND_MOD) * 25
    if (s <= BAND_HIGH) return 50 + seg(s, BAND_MOD, BAND_HIGH) * 25
    return 75 + clamp(seg(s, BAND_HIGH, BAND_TOP), 0, 1) * 25
  })()

  // Page readiness for the first local skeleton:
  //  - user auth confirmed (not still checking session)
  //  - trades + coins SWR calls settled
  //  - first price tick received (or portfolio is empty)
  const pageReady =
    !userLoading &&
    !tradesLoading &&
    !coinsLoading &&
    (coinIds.length === 0 || pricesReady)

  // Once the first load resolves, never blank the page again on background
  // revalidation — that flicker is what caused the loader to reappear.
  const [hasBootstrapped, setHasBootstrapped] = useState(false)
  useEffect(() => {
    if (pageReady) setHasBootstrapped(true)
  }, [pageReady])

  if (!hasBootstrapped && !pageReady) {
    return <RoutePageSkeleton label="portfolio" />
  }

  if (isMobile) {
    const riskFactors: MobileRiskMetricDetail[] = [
      {
        id: 'structural',
        name: 'Structural',
        note: `${sectorAgg.score} structure score`,
        level: structuralLevel,
        valueLabel: 'Structural score',
        value: String(sectorAgg.score),
        summary: 'Shows the underlying quality and concentration of what you own. Larger, established coins receive less structural risk than smaller or unranked assets.',
        details: [
          { label: 'Risk multiplier', value: `×${sectorAgg.structuralSum.toFixed(2)}` },
          { label: 'Top-10 exposure', value: fmtPct(sectorAgg.blue + sectorAgg.large) },
          { label: 'Top-2 exposure', value: fmtPct(sectorAgg.blue) },
          { label: 'Outside top 50', value: fmtPct(sectorAgg.unranked) },
        ],
        methodology: 'Each holding is weighted by portfolio size and its market-cap tier. The weighted tier multipliers are combined into the structural score.',
      },
      {
        id: 'volatility',
        name: 'Volatility',
        note: L2_annVol != null ? `σ ${(L2_annVol * 100).toFixed(1)}% annualized` : 'Waiting for history',
        level: volatilityLevel,
        valueLabel: 'Annualized volatility',
        value: L2_annVol != null ? `${(L2_annVol * 100).toFixed(1)}%` : 'Pending',
        summary: 'Measures how widely the full portfolio moves in either direction. Large up days and large down days both increase this metric.',
        details: [
          { label: 'Risk multiplier', value: `×${L2_mult.toFixed(2)}` },
          { label: 'Current conditions', value: L2_regime === 'calm' ? 'Calm' : L2_regime === 'normal' ? 'Normal' : L2_regime === 'high' ? 'Choppy' : 'Stressed' },
          { label: 'Measurement window', value: '45 days' },
          { label: 'Portfolio baseline', value: '15–20% stocks' },
        ],
        methodology: 'Annualized realized volatility is calculated from daily portfolio returns. Covariance between holdings is already included in this measurement.',
      },
      {
        id: 'tail-risk',
        name: 'Tail risk',
        note: L3_active ? 'Breakdown signal active' : 'No active signal',
        level: tailLevel,
        valueLabel: 'Current signal',
        value: L3_active ? 'Breaking down' : 'Normal range',
        summary: 'A live warning light that checks whether your holdings are trading below their normal range. It identifies current stress; it is not a price forecast.',
        details: [
          { label: 'Risk multiplier', value: `×${L3_factor.toFixed(2)}` },
          { label: 'Capital affected', value: fmtPct(L3_share) },
          { label: 'Reference window', value: '20 days' },
          { label: 'Signal state', value: L3_active ? 'Active' : 'Inactive' },
        ],
        methodology: 'The signal activates when price falls below its 20-day normal range: the 20-day average minus two standard deviations, weighted by position size.',
      },
      {
        id: 'diversification',
        name: 'Diversification',
        note: divBenefit != null ? `${Math.max(0, divBenefit * 100).toFixed(0)}% smoother mix` : 'Mix benefit pending',
        level: divLevel,
        valueLabel: 'Portfolio smoothing',
        value: divBenefit != null ? `${Math.max(0, divBenefit * 100).toFixed(0)}%` : 'Pending',
        summary: 'Shows whether combining your coins genuinely makes the portfolio smoother than holding the assets individually.',
        details: [
          { label: 'Diversification ratio', value: L2_divRatio != null ? L2_divRatio.toFixed(2) : '—' },
          { label: 'Average BTC relation', value: corrAgg.avg != null ? corrAgg.avg.toFixed(2) : '—' },
          { label: 'Measurement window', value: corrAgg.source === 'server' ? '45 days' : '95 days' },
          { label: 'Score impact', value: 'Information only' },
        ],
        methodology: 'The diversification ratio compares the weighted volatility of each asset with the volatility of the combined portfolio. It is informational because covariance is already counted in Volatility.',
      },
      {
        id: 'liquidity',
        name: 'Liquidity',
        note: L5_days != null ? (L5_days < 1 ? 'Under 1 day to exit' : `About ${L5_days.toFixed(1)} days to exit`) : 'Based on coin size',
        level: liquidityRiskLevel,
        valueLabel: 'Estimated exit time',
        value: L5_days != null ? (L5_days < 1 ? 'Under 1 day' : `${L5_days < 10 ? L5_days.toFixed(1) : Math.round(L5_days)} days`) : 'Tier estimate',
        summary: 'Estimates how easily the portfolio could be sold without requiring an unrealistic share of normal market volume.',
        details: [
          { label: 'Risk multiplier', value: `×${L5_mult.toFixed(2)}` },
          { label: 'Selling pace', value: fmtPct(L5_partic) },
          { label: 'Volume coverage', value: L5_coverage != null ? fmtPct(L5_coverage) : 'Unavailable' },
          { label: 'Easy-exit exposure', value: fmtPct(liquidityAgg.bands.blue + liquidityAgg.bands.large) },
        ],
        methodology: 'Exit time uses each holding’s value and 24-hour trading volume at the assumed participation rate, then blends the result with the coin’s market-cap tier.',
      },
      {
        id: 'expected-shortfall',
        name: 'Expected shortfall',
        note: L6_usd != null ? `About ${fmtCurrency(L6_usd)} on a bad day` : 'Waiting for history',
        level: lossLevel,
        valueLabel: 'Average bad-day loss',
        value: L6_usd != null ? `−${fmtCurrency(L6_usd)}` : 'Pending',
        summary: 'Estimates the average portfolio loss on the worst 5% of historical days—roughly the difficult one day in twenty.',
        details: [
          { label: 'Portfolio loss', value: L6_es != null ? `−${(Math.abs(L6_es) * 100).toFixed(1)}%` : '—' },
          { label: 'Bad day begins at', value: L6_var != null ? `−${fmtPct(Math.abs(L6_var))}` : '—' },
          { label: 'Days observed', value: L6_obs != null ? String(L6_obs) : '—' },
          { label: 'Method', value: 'Historical ES 95%' },
        ],
        methodology: 'Expected Shortfall 95% averages the losses from the worst 5% of observed portfolio days. It describes historical downside and is not a forecast or guaranteed maximum loss.',
      },
    ]

    return (
      <div
        data-portfolio-page
        data-portfolio-mobile
        className="pf -mx-4 -my-4 bg-[var(--pf-bg)] text-slate-100"
        /* The shared mobile shell supplies bottom-tab and safe-area clearance.
           A nested 100dvh plus another 7.5rem made the page scroll past Risk. */
        style={{ paddingBottom: 0 }}
      >
        <div data-mobile-portfolio-hero className="border-0 bg-transparent px-5 pb-6 pt-6 shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-medium tracking-wide text-slate-400">Portfolio value</div>
              <div className="mt-2 truncate font-display text-[38px] font-bold leading-none tracking-tight text-slate-100 tabular-nums">
                {fmtCurrency(totals.value)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium tabular-nums">
                <span className={totals.delta24Usd >= 0 ? 'text-[rgb(116,170,98)]' : 'text-[rgb(214,66,78)]'}>
                  {signedMoney(totals.delta24Usd)}
                </span>
                <span className={totals.delta24Usd >= 0 ? 'text-[rgb(116,170,98)]' : 'text-[rgb(214,66,78)]'}>
                  {totals.delta24Pct != null ? `(${fmtPct(totals.delta24Pct)})` : '(—)'}
                </span>
                <span className="text-slate-500">24H</span>
              </div>
            </div>
            <Link
              href="/audit"
              className="mt-1 inline-flex shrink-0 items-center rounded-full border border-[rgb(58,59,63)] px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors active:bg-white/5"
            >
              Audit log
            </Link>
          </div>
        </div>

        <div
          data-mobile-portfolio-totals
          aria-label="Portfolio totals"
          className="grid grid-cols-2 gap-x-2 gap-y-2 border-0 bg-transparent px-5 pb-5 pt-1 shadow-none"
        >
          <MobileMetricPill label="Capital invested" value={fmtCurrency(totals.invested)} />
          <MobileMetricPill
            label="Total P&amp;L"
            value={signedMoney(totals.total)}
            tone={totals.total > 0 ? 'positive' : totals.total < 0 ? 'negative' : 'neutral'}
          />
          <MobileMetricPill
            label="Unrealized P&amp;L"
            value={signedMoney(totals.unreal)}
            tone={totals.unreal > 0 ? 'positive' : totals.unreal < 0 ? 'negative' : 'neutral'}
          />
          <MobileMetricPill
            label="Realized P&amp;L"
            value={signedMoney(totals.realized)}
            tone={totals.realized > 0 ? 'positive' : totals.realized < 0 ? 'negative' : 'neutral'}
          />
        </div>

        <div
          data-mobile-portfolio-holdings
          role="region"
          aria-label="Holdings"
          className="w-full overflow-hidden rounded-none border-x-0 border-y border-[rgb(41,42,45)] bg-transparent p-0 shadow-none"
        >
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h1 className="font-display text-[21px] font-semibold tracking-tight text-slate-100">Holdings</h1>
              <p className="mt-0.5 text-[11px] text-slate-500">Your live portfolio positions</p>
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {rows.length} {rows.length === 1 ? 'asset' : 'assets'}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="border-t border-[rgb(41,42,45)] px-5 py-8 text-center text-[13px] text-slate-400">
              No holdings yet. Add a trade to build your portfolio.
            </div>
          ) : (
            <ul>
              {rows.map((holding) => {
                const change = holding.delta24Pct
                const positive = (change ?? 0) >= 0
                return (
                  <li key={holding.cid} className="border-t border-[rgb(41,42,45)]">
                    <button
                      type="button"
                      onClick={() => setMobileHolding(holding)}
                      className="flex min-h-[76px] w-full items-center gap-3 px-5 py-3.5 text-left transition-colors active:bg-[rgb(28,29,31)]"
                      aria-label={`View ${holding.name} holding details`}
                    >
                      <CoinLogo symbol={holding.symbol} name={holding.name} className="h-10 w-10 shrink-0 shadow-none" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-slate-100">{holding.name}</div>
                        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {holding.symbol} · {holding.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </div>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <div className="text-[15px] font-medium text-slate-100">{fmtCurrency(holding.value)}</div>
                        <div className={`mt-0.5 text-[12.5px] font-medium ${positive ? 'text-[rgb(116,170,98)]' : 'text-[rgb(214,66,78)]'}`}>
                          {change == null ? '—' : fmtPct(change)}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div
          data-mobile-portfolio-risk
          role="region"
          aria-label="Portfolio Risk"
          className="relative mt-7 w-full overflow-hidden rounded-none border-x-0 border-y border-[rgb(41,42,45)] bg-transparent p-0 shadow-none"
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-[rgb(137,128,213)]" aria-hidden="true" />
              <div>
                <h2 className="font-display text-[20px] font-semibold tracking-tight text-slate-100">Portfolio Risk</h2>
                <p className="mt-0.5 text-[10.5px] text-slate-500">
                  {priskErr ? 'Fallback risk model' : 'Live portfolio model'} · Tap a metric
                </p>
              </div>
            </div>
            {canViewPortfolioRisk && (
              <span className={`lvl-pill ${lvCls(combinedLevel)}`}>{combinedLevel}</span>
            )}
          </div>

          {!canViewPortfolioRisk ? (
            <div className="border-t border-[rgb(41,42,45)] px-5 py-8 text-center">
              <Lock className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
              <div className="mt-3 text-[15px] font-semibold text-slate-100">Portfolio Risk is locked</div>
              <p className="mx-auto mt-2 max-w-[320px] text-[12.5px] leading-5 text-slate-400">
                Upgrade to unlock your combined risk score, market exposure, volatility, liquidity, and expected shortfall.
              </p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[rgb(101,87,207)] px-5 py-2.5 text-[12px] font-semibold text-white"
              >
                View plans
              </Link>
            </div>
          ) : (
            <>
              <div className="border-t border-[rgb(41,42,45)] px-5 py-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Combined risk index</div>
                    <div className="mt-1 font-display text-[34px] font-bold leading-none text-slate-100 tabular-nums">
                      {combinedScore.toFixed(3)}
                    </div>
                  </div>
                  <div className="pb-0.5 text-right text-[11px] leading-4 text-slate-500">
                    1.00 is the major-coin<br />baseline
                  </div>
                </div>

                <div className="mt-5">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--pf-surface-2)]">
                    <div className="h-full w-full bg-[linear-gradient(90deg,rgba(116,170,98,0.82),rgba(207,180,45,0.82)_45%,rgba(189,120,45,0.88)_70%,rgba(214,66,78,0.90))]" />
                  </div>
                  <div className="relative -mt-2 h-2" aria-hidden="true">
                    <span
                      className="absolute top-0 h-4 w-4 -translate-x-1/2 -translate-y-[3px] rounded-full border-2 border-[var(--pf-bg)] bg-slate-100 shadow"
                      style={{ left: `${meterPct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[9.5px] text-slate-500">
                    <span>Low</span><span>Moderate</span><span>High</span><span>Very high</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2">
                {riskFactors.map((factor) => (
                  <div key={factor.name} className="border-t border-[rgb(41,42,45)] even:border-l even:border-[rgb(41,42,45)]">
                    <MobileRiskFactor
                      name={factor.name}
                      note={factor.note}
                      level={factor.level}
                      onClick={() => setMobileRiskMetric(factor)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <MobileHoldingSheet holding={mobileHolding} onClose={closeMobileHolding} />
        <MobileRiskMetricSheet metric={mobileRiskMetric} onClose={closeMobileRiskMetric} />
      </div>
    )
  }

  return (
    <div data-portfolio-page className="pf relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto">
      {/* ── Hero value band ── */}
      <div className="pf-hero flex items-start justify-between gap-4">
        <div>
          <div className="pf-label">Portfolio Value</div>
          <div className="v">{fmtCurrency(totals.value)}</div>
          <div className="pf-perf-delta">
            <span className={`chip ${totals.delta24Usd >= 0 ? 'pos' : 'neg'}`}>
              {totals.delta24Usd >= 0 ? '▲' : '▼'}{' '}
              {totals.delta24Pct != null ? fmtPct(totals.delta24Pct) : '—'}
            </span>
            <span className={totals.delta24Usd >= 0 ? 'pos' : 'neg'}>
              {totals.delta24Usd >= 0 ? '+' : '−'}
              {fmtCurrency(Math.abs(totals.delta24Usd))}
            </span>
            <span className="ctx">· past 24 hours</span>
          </div>
        </div>
        <a href="/audit" className="inline-flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 px-3 py-2 text-xs">
          Audit Log
        </a>
      </div>

      {/* ── Summary ledger strip ── */}
      <div className="pf-summary">
        <PLSum label="Total P&L" usd={totals.total} invested={totals.invested} />
        <PLSum label="Unrealized P&L" usd={totals.unreal} invested={totals.invested} />
        <PLSum label="Realized P&L" usd={totals.realized} invested={totals.invested} />
        <div className="pf-sum">
          <div className="pf-label">Money Invested</div>
          <div className="v">{fmtCurrency(totals.invested)}</div>
        </div>
        <div className="pf-sum pf-sum-sq">
          <div className="pf-label">Positions</div>
          <div className="v">
            {allocAll.data.length}
            <span className="sub">assets</span>
          </div>
        </div>
      </div>


      {/* Portfolio Risk (left) + Allocation donut (right) */}
      <div className="pf-cols">
        {/* LEFT: Portfolio Risk card */}
        <section className="pf-card relative overflow-hidden min-h-[380px]">
  {!canViewPortfolioRisk && (
<div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(15,16,18,0.82)] backdrop-blur-md rounded-md ring-1 ring-inset ring-[rgba(114,108,172,0.40)]">
      <div className="mx-6 max-w-[520px] text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgb(24,25,27)] px-3 py-1 text-[11px] font-medium text-slate-200">
          <Lock className="h-4 w-4 text-slate-300" />
          <span>Tier 1+ required</span>
        </div>

        <div className="mt-3 text-base font-semibold text-slate-50">Portfolio Risk Metrics are Locked</div>
        <div className="mt-2 text-sm leading-6 text-slate-300">
          Upgrade your plan to unlock Complete Exposure &amp; Risk Metrics (structural, volatility, tail risk, liquidity, diversification, expected shortfall).
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full bg-indigo-500/90 px-4 py-2 text-xs font-medium text-slate-50 shadow shadow-indigo-500/30 transition hover:bg-indigo-400"
          >
            Upgrade plan
          </Link>
          <div className="text-[11px] text-slate-400">
            {entLoading && user ? 'Checking plan…' : `Current: ${(entitlements?.tier ?? 'FREE')}`}
          </div>
        </div>
      </div>
    </div>
  )}
            <div className="pf-card-h">
              <span className="ttl">Portfolio Risk</span>
              <span className="meta">
                {prisk?.updatedAt
                  ? `as of ${new Date(prisk.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                  : priskErr ? 'fallback (BTC proxy)' : 'initializing…'}
              </span>
            </div>

            {/* Combined index + meter + clickable factor table (values computed above) */}
            <div className="pf-risk-body">
              <div className="pf-risk-score">
                <div>
                  <div className="pf-label">Combined Risk Index</div>
                  <div className="big" style={{ marginTop: 8 }}>{combinedScore.toFixed(3)}</div>
                </div>
                <span className={`lvl-pill ${lvCls(combinedLevel)}`}>{combinedLevel}</span>
              </div>

              <div className="pf-meter">
                <div className="pf-meter-bar">
                  <span className="pf-meter-knob" style={{ left: `${meterPct}%` }} />
                </div>
                <div className="pf-meter-ticks">
                  <span>Low</span><span>Moderate</span><span>High</span><span>Very High</span>
                </div>
              </div>

              <div className="pf-rk-table">
                <div className="pf-rk-eyebrow">Risk Factors</div>
                <div className="pf-rk-grid">
                  {([
                    { f: 'Structural', note: `${sectorAgg.score} score`, level: structuralLevel, tab: 'sector' as ViewMode },
                    { f: 'Volatility', note: L2_annVol != null ? `σ ${(L2_annVol * 100).toFixed(1)}%` : 'σ —', level: volatilityLevel, tab: 'vol' as ViewMode },
                    { f: 'Tail', note: L3_active ? 'active' : 'inactive', level: tailLevel, tab: 'tail' as ViewMode },
                    { f: 'Diversification', note: divBenefit != null ? 'smoother ride' : 'mix benefit', level: divLevel, tab: 'div' as ViewMode },
                    { f: 'Liquidity', note: L5_days != null ? (L5_days < 1 ? '< 1 day to exit' : `~${L5_days < 10 ? L5_days.toFixed(1) : Math.round(L5_days)} days to exit`) : 'by coin size', level: liquidityRiskLevel, tab: 'liq' as ViewMode },
                    { f: 'Expected Shortfall', note: L6_usd != null ? `≈ ${fmtCurrency(L6_usd)} on a bad day` : 'worst 5% of days', level: lossLevel, tab: 'loss' as ViewMode },
                  ]).map((r) => (
                    <div
                      key={r.f}
                      className="pf-rk-cell"
                      role="button"
                      tabIndex={0}
                      title={r.note}
                      onClick={() => setRiskDetail(r.tab)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRiskDetail(r.tab) } }}
                    >
                      <span className="nm">{r.f}</span>
                      <span className="note">{r.note}</span>
                      <div className="foot">
                        <span className={`pf-rk-seg ${lvCls(r.level)}`} aria-hidden="true">
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <i key={i} className={i < levelFill(r.level) ? 'on' : ''} />
                          ))}
                        </span>
                        <span className={`pf-rk-lvl ${lvCls(r.level)}`}>{r.level}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Global info tooltip — bottom-right of the whole Exposure & Risk Metric card (LARGER) */}
            <div className="group/ermtip pointer-events-auto absolute bottom-2 right-2">
              <Info className="h-5 w-5 text-slate-400 hover:text-slate-200" aria-label="Exposure & Risk info" />
              <div className="pointer-events-none absolute bottom-7 right-0 z-10 max-w-[85vw] w-[26rem] md:w-[28rem] rounded-md border border-[rgb(42,43,45)] bg-[rgb(24,25,27)] px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-xl opacity-0 transition-opacity group-hover/ermtip:opacity-100">
                A professional-grade crypto risk score based on market structure, volatility, tail-events, and liquidity — benchmarked against real Bitcoin regimes and crypto liquidity tiers. Diversification and expected shortfall are shown alongside it for context.
              </div>
            </div>

            {/* Drill-down overlay: Exposure & Risk Metric detail (same data blocks as before) */}
            {riskDetail && (
              <div className="rk-overlay" onClick={() => setRiskDetail(null)}>
                <div className="rk-panel" onClick={(e) => e.stopPropagation()}>
                  <button className="rk-close" onClick={() => setRiskDetail(null)} aria-label="Close">×</button>
                  <div className="rk-panel-h">
                    <span className="ttl">Exposure &amp; Risk Metric</span>
                    <div className="rk-tabs">
                      {([
                        { id: 'combined' as ViewMode, label: 'Portfolio Risk' },
                        { id: 'sector' as ViewMode, label: 'Structural' },
                        { id: 'vol' as ViewMode, label: 'Volatility' },
                        { id: 'tail' as ViewMode, label: 'Tail Risk' },
                        { id: 'div' as ViewMode, label: 'Diversification' },
                        { id: 'liq' as ViewMode, label: 'Liquidity' },
                        { id: 'loss' as ViewMode, label: 'Expected Shortfall' },
                        { id: 'rank' as ViewMode, label: 'Rank' },
                      ]).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`rk-tab${t.id === riskDetail ? ' active' : ''}`}
                          onClick={() => setRiskDetail(t.id)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rk-body space-y-4">
              {/* SECTOR (Layer 1) */}
              {riskDetail === 'sector' && (
                <>
                  <PlainLead>
                    This is about <span className="text-slate-100 font-medium">what you own</span>, not
                    how it&apos;s moving. Large, established coins tend to survive rough markets. Smaller
                    ones fall harder and some never recover.
                  </PlainLead>

                  <BigStat
                    value={fmtPct(sectorAgg.blue + sectorAgg.large)}
                    sub="of your money is in top-10 coins"
                  />

                  <div className="text-xs text-slate-400 pt-1">Where your money sits by coin size:</div>
                  <LegendRow label="Biggest 2 coins" value={fmtPct(sectorAgg.blue)} />
                  <LegendRow label="Top 10" value={fmtPct(sectorAgg.large)} />
                  <LegendRow label="Ranked 11–20" value={fmtPct(sectorAgg.medium)} />
                  <LegendRow label="Ranked 21–50" value={fmtPct(sectorAgg.small)} />
                  <LegendRow
                    label="Outside the top 50"
                    value={
                      <span className={sectorAgg.unranked > 0.2 ? 'text-[rgba(189,120,45,1)]' : undefined}>
                        {fmtPct(sectorAgg.unranked)}
                      </span>
                    }
                  />

                  <CardFooter
                    left={<RiskBadge score={sectorAgg.score} label={sectorAgg.label} />}
                    right={<>Structural score = Σ(weight × size multiplier) × 100</>}
                  />
                </>
              )}

              {/* BAD DAY LOSS (Layer 6) */}
              {riskDetail === 'loss' && (
                <>
                  {L6_es == null ? (
                    <div className="text-sm text-slate-400">
                      Not enough price history yet to measure this. It needs about 20 days of
                      overlapping history across your holdings.
                    </div>
                  ) : (
                    <>
                      <PlainLead>
                        Roughly one day in twenty is a <span className="text-slate-100 font-medium">bad
                        day</span> — a drop of {fmtPct(Math.abs(L6_var ?? 0))} or worse. This is what
                        those days have actually cost you on average.
                      </PlainLead>

                      <BigStat
                        tone="bad"
                        value={`−${fmtCurrency(L6_usd ?? 0)}`}
                        sub={`${(Math.abs(L6_es) * 100).toFixed(1)}% of ${fmtCurrency(totals.value)}`}
                      />

                      <LegendRow
                        label="A bad day starts at"
                        value={<span className="font-medium">−{fmtPct(Math.abs(L6_var ?? 0))}</span>}
                      />
                      <LegendRow
                        label="Days of history measured"
                        value={<span className="font-medium">{L6_obs ?? '—'}</span>}
                      />

                      {L6_worst.length > 0 && (
                        <>
                          <div className="text-xs text-slate-400 pt-1">
                            Your worst days in that window — actual history, not a forecast:
                          </div>
                          {L6_worst.map((d) => (
                            <LegendRow
                              key={d.t}
                              label={new Date(d.t).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                              value={
                                <span className="text-[rgba(189,45,50,1)]">
                                  −{fmtCurrency(Math.abs(d.r) * totals.value)}
                                  <span className="ml-2 text-slate-400">
                                    {(Math.abs(d.r) * 100).toFixed(1)}%
                                  </span>
                                </span>
                              }
                            />
                          ))}
                        </>
                      )}

                      <CardFooter
                        left={
                          <LevelBadge
                            title="Expected Shortfall"
                            level={lossLevel}
                            value={`−${(Math.abs(L6_es) * 100).toFixed(1)}%`}
                          />
                        }
                        right={<>ES 95%, historical simulation · the Basel-standard successor to VaR</>}
                      />
                    </>
                  )}
                </>
              )}

              {/* RANK */}
              {riskDetail === 'rank' && (
                <>
                  {allocAll.data.length === 0 ? (
                    <div className="text-sm text-slate-400">No holdings to display.</div>
                  ) : (
                    allocAll.data
                      .map(d => ({
                        id: d.cid,
                        symbol: d.name,
                        pct: allocAll.total > 0 ? d.value / allocAll.total : 0,
                        rank: rankMap.get(d.cid) ?? null
                      }))
                      .sort((a,b) => {
                        const ra = a.rank ?? Number.POSITIVE_INFINITY
                        const rb = b.rank ?? Number.POSITIVE_INFINITY
                        if (ra !== rb) return ra - rb
                        return (b.pct - a.pct)
                      })
                      .map(h => (
                        <LegendRow
                          key={h.id}
                          label={`${h.symbol}  ·  Rank ${h.rank ?? '—'}`}
                          value={
                            <span>
                              {fmtPct(h.pct)}
                              <span className="text-slate-400"> · </span>
                              <span title="Marginal Contribution to Risk">MCR {fmtPct(mcrById[h.id] ?? NaN)}</span>
                            </span>
                          }
                        />
                      ))
                  )}
                  <CardFooter
                    left={<span className="text-slate-400">Ranked by market cap</span>}
                    right={<>Data source: /api/snapshot · MCR from /api/portfolio-risk</>}
                  />
                </>
              )}

              {/* VOLATILITY */}
              {riskDetail === 'vol' && (
                <>
                  <PlainLead>
                    How much your portfolio <span className="text-slate-100 font-medium">swings</span>.
                    This counts moves in both directions — big up days and big down days are the same
                    thing here.
                  </PlainLead>

                  <BigStat
                    value={L2_annVol != null ? `${(L2_annVol * 100).toFixed(1)}%` : '—'}
                    sub="typical swing over a year"
                  />

                  <LegendRow
                    label="Current conditions"
                    value={
                      <span className="font-medium">
                        {L2_regime === 'calm' ? 'Calm'
                          : L2_regime === 'normal' ? 'Normal for crypto'
                          : L2_regime === 'high' ? 'Choppy'
                          : 'Stressed'}
                      </span>
                    }
                  />
                  <LegendRow
                    label="For comparison"
                    value={<span className="text-slate-400">US stocks sit near 15–20%</span>}
                  />
                  <LegendRow label="Measured over" value="Last 45 days of daily prices" />
                  <CardFooter
                    left={
                      <LevelBadge
                        title="Volatility"
                        level={volatilityLevel}
                        value={`×${L2_mult.toFixed(2)}`}
                      />
                    }
                    right={<>Annualized realized volatility · &lt;55% → 0.90 · 55–80% → 1.00 · 80–110% → 1.25 · &gt;110% → 1.60 {priskErr && <span className="ml-1 text-[rgba(189,45,50,1)]">(fallback)</span>}</>}
                  />
                </>
              )}

              {/* TAIL RISK */}
              {riskDetail === 'tail' && (
                <>
                  <PlainLead>
                    A warning light, not a forecast. It checks whether your coins are
                    <span className="text-slate-100 font-medium"> breaking down right now</span> —
                    trading below their normal range. This is the one factor that reacts today.
                  </PlainLead>

                  <BigStat
                    value={L3_active ? 'Breaking down' : 'Holding normal range'}
                    tone={L3_active ? 'bad' : 'good'}
                  />

                  <LegendRow
                    label="Share of your money affected"
                    value={<span className="font-medium">{fmtPct(L3_share)}</span>}
                  />
                  <LegendRow
                    label="What counts as breaking down"
                    value={<span className="text-slate-400">Price below its 20-day normal range</span>}
                  />
                  <CardFooter
                    left={
                      <LevelBadge
                        title="Tail"
                        level={tailLevel}
                        value={`×${L3_factor.toFixed(2)}`}
                      />
                    }
                    right={<>Bollinger breakdown · price &lt; (SMA20 − 2×SD20), weighted by position {priskErr && <span className="ml-1 text-[rgba(189,45,50,1)]">(fallback)</span>}</>}
                  />
                </>
              )}

              {/* DIVERSIFICATION */}
              {riskDetail === 'div' && (
                <>
                  <PlainLead>
                    Does owning several coins actually make your ride
                    <span className="text-slate-100 font-medium"> smoother</span> than owning just
                    one? This compares your portfolio&apos;s swings against the swings of the coins
                    inside it.
                  </PlainLead>

                  {divBenefit == null ? (
                    <div className="text-sm text-slate-400">
                      Not enough overlapping price history yet to measure this.
                    </div>
                  ) : (
                    <>
                      <BigStat
                        tone={divBenefit >= 0.05 ? 'good' : 'neutral'}
                        value={`${(divBenefit * 100).toFixed(0)}% smoother`}
                        sub={
                          divBenefit >= 0.10 ? 'your mix is doing real work'
                          : divBenefit >= 0.05 ? 'your mix helps a little'
                          : 'your mix barely helps'
                        }
                      />

                      <LegendRow
                        label="What that means"
                        value={
                          <span className="text-slate-400">
                            Your swings are {(divBenefit * 100).toFixed(0)}% smaller than your coins&apos; own
                          </span>
                        }
                      />
                      <LegendRow
                        label="How your coins move together"
                        value={
                          <span className="text-slate-400">
                            {corrAgg.avg == null ? '—'
                              : corrAgg.avg >= 0.95 ? `${corrAgg.avg.toFixed(2)} — effectively one bet`
                              : corrAgg.avg >= 0.85 ? `${corrAgg.avg.toFixed(2)} — mostly one bet`
                              : corrAgg.avg >= 0.70 ? `${corrAgg.avg.toFixed(2)} — partly spread out`
                              : `${corrAgg.avg.toFixed(2)} — genuinely spread out`}
                          </span>
                        }
                      />
                      <LegendRow
                        label="Measured over"
                        value={corrAgg.source === 'server' ? 'Last 45 days of daily prices' : 'Last 95 days of daily prices'}
                      />

                      <div className="text-xs text-slate-400 leading-relaxed pt-1">
                        This row is <span className="text-slate-300">information only</span> — it
                        doesn&apos;t add to your risk score. How much your coins move together is
                        already built into the Volatility figure, so counting it again would charge
                        you twice for the same thing. In crypto almost everything follows Bitcoin, so
                        even a well-spread portfolio rarely gets more than about 10% smoother.
                      </div>
                    </>
                  )}

                  <CardFooter
                    left={
                      <LevelBadge
                        title="Diversification"
                        level={divLevel}
                        value={L2_divRatio != null ? L2_divRatio.toFixed(2) : '—'}
                      />
                    }
                    right={<span className="text-slate-400 text-[11px]">Diversification ratio = Σ(weight × asset vol) ÷ portfolio vol</span>}
                  />
                </>
              )}

              {/* LIQUIDITY */}
              {riskDetail === 'liq' && (
                <>
                  <PlainLead>
                    How easily you could <span className="text-slate-100 font-medium">actually sell</span>.
                    Big coins have deep, steady buyers. Small ones can be hard to exit in a panic —
                    the price moves against you on the way out.
                  </PlainLead>

                  {L5_days != null ? (
                    <>
                      <BigStat
                        tone={L5_days > 2 ? 'bad' : 'neutral'}
                        value={
                          L5_days < 1
                            ? 'Under a day'
                            : `${L5_days < 10 ? L5_days.toFixed(1) : Math.round(L5_days)} days`
                        }
                        sub="to sell out at a normal pace"
                      />

                      <LegendRow
                        label="Assumed selling pace"
                        value={
                          <span className="text-slate-400">
                            {fmtPct(L5_partic)} of each coin&apos;s daily volume
                          </span>
                        }
                      />
                      {L5_coverage != null && L5_coverage < 0.999 && (
                        <LegendRow
                          label="Volume data covers"
                          value={
                            <span className={L5_coverage < 0.8 ? 'text-[rgba(189,120,45,1)]' : 'text-slate-400'}>
                              {fmtPct(L5_coverage)} of your holdings
                            </span>
                          }
                        />
                      )}

                      {Object.keys(L5_perAsset).length > 0 && (
                        <>
                          <div className="text-xs text-slate-400 pt-1">How long each position would take:</div>
                          {Object.entries(L5_perAsset)
                            .sort((a, b) => (b[1].days ?? -1) - (a[1].days ?? -1))
                            .slice(0, 6)
                            .map(([id, d]) => (
                              <LegendRow
                                key={id}
                                label={id}
                                value={
                                  d.days == null ? <span className="text-slate-500">no volume data</span> : (
                                    <span className={d.days > 2 ? 'text-[rgba(189,120,45,1)]' : undefined}>
                                      {d.days < 1 ? '< 1 day' : `${d.days < 10 ? d.days.toFixed(1) : Math.round(d.days)} days`}
                                    </span>
                                  )
                                }
                              />
                            ))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <BigStat
                        value={fmtPct(liquidityAgg.bands.blue + liquidityAgg.bands.large)}
                        sub="of your money is in easy-to-exit coins"
                      />
                      <div className="text-xs text-slate-400 pt-1">
                        Trading-volume data unavailable — falling back to coin size:
                      </div>
                      <LegendRow label="Very easy — biggest 2 coins" value={fmtPct(liquidityAgg.bands.blue)} />
                      <LegendRow label="Easy — top 10" value={fmtPct(liquidityAgg.bands.large)} />
                      <LegendRow label="Moderate — ranked 11–20" value={fmtPct(liquidityAgg.bands.medium)} />
                      <LegendRow label="Harder — ranked 21–50" value={fmtPct(liquidityAgg.bands.small)} />
                      <LegendRow label="Hardest — outside the top 50" value={fmtPct(liquidityAgg.bands.unranked)} />
                    </>
                  )}

                  <CardFooter
                    left={
                      <LevelBadge
                        title="Liquidity"
                        level={liquidityRiskLevel}
                        value={`×${L5_mult.toFixed(2)}`}
                      />
                    }
                    right={<span className="text-slate-400 text-[11px]">Days to liquidate at {fmtPct(L5_partic)} participation, blended with cap tier</span>}
                  />
                </>
              )}

              {/* COMBINED */}
              {riskDetail === 'combined' && (
                <div className="space-y-4">
                  <div className="relative rounded-lg bg-[rgb(24,25,27)] border border-[rgb(42,43,45)] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Combined Risk</div>
                        <div className="mt-1 flex items-baseline gap-3">
                          <div className="text-3xl md:text-4xl font-bold tabular-nums text-slate-100">
                            {combinedScore.toFixed(3)}
                          </div>
                          <LevelBadge title="Level" level={combinedLevel} value={''} />
                        </div>
                      </div>
                      <div className="hidden sm:block text-right">
                        <div className="text-[11px] text-slate-400">Formula</div>
                        <div className="text-xs text-slate-300">Σ(weight × structural) × vol × tail × liq</div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {prisk?.updatedAt
                            ? `as of ${new Date(prisk.updatedAt).toLocaleString()}`
                            : priskErr ? 'fallback (BTC proxy)' : 'initializing…'}
                        </div>
                      </div>
                    </div>

                    {/* Smooth meter */}
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-[rgb(36,37,39)] overflow-hidden">
                        <div
                          className="h-2 w-full"
                          style={{
                            background: 'linear-gradient(90deg, rgba(16,185,129,0.3) 0%, rgba(234,179,8,0.35) 45%, rgba(245,158,11,0.45) 70%, rgba(244,63,94,0.6) 100%)'
                          }}
                        />
                      </div>
                      <div className="relative -mt-2 h-0" aria-hidden="true">
                        <div
                          className="absolute top-0 -translate-y-1/2 h-3 w-3 rounded-full border border-white/40 shadow"
                          style={{ left: `calc(${meterPct}% - 6px)`, backgroundColor: 'rgba(255,255,255,0.9)' }}
                          title={`Position: ${(meterPct).toFixed(0)}%`}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Low</span><span>Moderate</span><span>High</span><span>Very High</span>
                      </div>
                    </div>
                  </div>

                  {/* What the number is measured against */}
                  <div className="rounded-lg border border-[rgb(42,43,45)] p-4 space-y-3">
                    <PlainLead>
                      <span className="text-slate-100 font-medium">1.00</span> is the yardstick: a
                      portfolio of only Bitcoin and Ethereum, in normal market conditions, that you
                      could sell within a day. Your score says how many times riskier than that you are.
                    </PlainLead>
                    <LegendRow
                      label={<span className="text-emerald-400">Low</span>}
                      value={<span className="text-slate-400">up to {BAND_LOW.toFixed(2)} — about the same as holding major coins</span>}
                    />
                    <LegendRow
                      label={<span className="text-[rgba(207,180,45,1)]">Moderate</span>}
                      value={<span className="text-slate-400">{BAND_LOW.toFixed(2)}–{BAND_MOD.toFixed(2)} — up to twice the baseline</span>}
                    />
                    <LegendRow
                      label={<span className="text-[rgba(189,120,45,1)]">High</span>}
                      value={<span className="text-slate-400">{BAND_MOD.toFixed(2)}–{BAND_HIGH.toFixed(2)} — two to three times the baseline</span>}
                    />
                    <LegendRow
                      label={<span className="text-[rgba(189,45,50,1)]">Very High</span>}
                      value={<span className="text-slate-400">above {BAND_HIGH.toFixed(2)} — several risks compounding</span>}
                    />
                  </div>

                  {/* Bottom 5 tiles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                    <StatTile
                      label="Structural"
                      value={sectorAgg.structuralSum.toFixed(3)}
                      footer={<LevelBadge title="Level" level={structuralLevel} value={`${sectorAgg.score}`} />}
                    />
                    <StatTile
                      label="Volatility"
                      value={`×${L2_mult.toFixed(2)}`}
                      rightHint="σ"
                      footer={
                        <LevelBadge title="Level" level={volatilityLevel} value={L2_annVol != null ? `${(L2_annVol*100).toFixed(1)}%` : '—'} />
                      }
                    />
                    <StatTile
                      label="Tail Factor"
                      value={`×${L3_factor.toFixed(2)}`}
                      footer={<LevelBadge title="Level" level={tailLevel} value={L3_active ? 'Active' : 'Inactive'} />}
                    />
                    <StatTile
                      label="Diversification"
                      value={divBenefit != null ? `−${(divBenefit * 100).toFixed(0)}%` : '—'}
                      rightHint="info"
                      footer={<LevelBadge title="Level" level={divLevel} value={corrAgg.avg == null ? '—' : `ρ=${corrAgg.avg.toFixed(2)}`} />}
                    />
                    <StatTile
                      label="Liquidity"
                      value={`×${L5_mult.toFixed(2)}`}
                      footer={<LevelBadge title="Level" level={liquidityRiskLevel} value={''} />}
                    />
                  </div>

                  <CardFooter
                    left={<span className="text-slate-400 text-xs">Combined = L1 × L2 × L3 × L4 × L5</span>}
                    right={
                      <span className="text-slate-400 text-[11px]">
                        {prisk ? 'Source: /api/portfolio-risk + new data core histories' : 'Source: BTC proxy + new data core histories'}
                      </span>
                    }
                  />
                </div>
              )}
                  </div>
                </div>
              </div>
            )}
          </section>

        {/* RIGHT: Allocation donut */}
        <section className="pf-card pf-allocation-card">
          {allocAll.data.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">No holdings yet to display allocation.</div>
          ) : (
            <div className="pf-alloc-body">
              <div className="pf-allocation-donut" aria-label="Portfolio allocation donut chart">
                <AllocationDonut
                  data={allocAll.data.map((asset) => ({
                    name: asset.name,
                    value: asset.value,
                    color: asset.color,
                  }))}
                />
              </div>
            </div>
          )}
        </section>
      </div>

            {/* HOLDINGS */}
      <div className="pf-hold">
        <div className="pf-hold-h">
            <div className="title-wrap">
              <h2>Holdings</h2>
              <span className="count">{filteredSorted.length} shown</span>
            </div>

            <div className="pf-hold-tools relative z-[70] lo-dropdown-layer">
              {/* Search */}
              <label className="pf-search">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search coin or symbol…"
                />
              </label>

              {/* Sort select */}
              <SortSelect
                value={sortKey}
                onChange={(v) => setSortKey(v as any)}
                ariaLabel="Sort by"
                title="Sort by"
                options={[
                  { value: 'value', label: 'Sort: Value' },
                  { value: 'total', label: 'Sort: Total P&L' },
                  { value: 'unreal', label: 'Sort: Unrealized' },
                  { value: 'realized', label: 'Sort: Realized' },
                  { value: 'invested', label: 'Sort: Money Invested' },
                  { value: 'qty', label: 'Sort: Qty' },
                  { value: 'avg', label: 'Sort: Avg Cost' },
                  { value: 'name', label: 'Sort: Name' },
                ]}
              />

              {/* Sort direction */}
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="pf-ctrl"
                title={`Direction: ${sortDir}`}
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortDir.toUpperCase()}
              </button>

              {/* Density: Compact / Comfort */}
              <button
                type="button"
                onClick={() => setDense((d) => !d)}
                className="pf-ctrl"
                title={dense ? 'Comfortable rows' : 'Compact rows'}
              >
                {dense ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
                {dense ? 'Compact' : 'Comfort'}
              </button>

              {/* Holdings P&L mode */}
              <button
                type="button"
                onClick={() => setHoldingsPctMode((v) => !v)}
                className="pf-ctrl"
                title={holdingsPctMode ? `Show values and P&L in ${currencySymbol}` : 'Show values and P&L as %'}
              >
                <span className="seg-mini">
                  <span className={!holdingsPctMode ? 'a' : ''}>{currencySymbol}</span>
                  <span className="k">/</span>
                  <span className={holdingsPctMode ? 'a' : ''}>%</span>
                </span>
                <span className="k">P&amp;L</span>
              </button>
            </div>
        </div>

        <div className="pf-hold-card">
          <table className={`tbl ${dense ? 'is-compact' : 'is-comfort'}`}>
            <thead>
              <tr>
                <th>Asset</th>
                <th className="num">Qty</th>
                <th className="num">Avg Cost</th>
                <th className="num">Value</th>
                <th className="num">Money Invested</th>
                <th className="num">Unrealized P&amp;L</th>
                <th className="num">Realized P&amp;L</th>
                <th className="num">Total P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => {
                const rowPad = dense ? 'py-1.5' : 'py-3.5'
                const basis = r.costBasisRemaining || 0

                return (
                  <tr
                    key={r.cid}
                    onClick={() => router.push(`/coins/${r.cid}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/coins/${r.cid}`)
                      }
                    }}
                    tabIndex={0}
                    className="outline-none"
                  >
                    {/* Coin */}
                    <td className={rowPad}>
                      <div className="asset-cell">
                        <CoinLogo
                          symbol={r.symbol}
                          name={r.name}
                          className="h-6 w-6 md:h-7 md:w-7 shadow-none"
                        />
                        <div className="min-w-0">
                          <div className="an truncate">{r.name}</div>
                          <div className="at">{r.symbol}</div>
                        </div>
                      </div>
                    </td>

                    {/* Qty */}
                    <td className={`num ${rowPad}`}>
                      {r.qty.toLocaleString()}
                    </td>

                    {/* Avg Cost */}
                    <td className={`num muted ${rowPad}`}>
                      {fmtCurrency(r.avg)}
                    </td>

                    {/* Value – $ or % of portfolio */}
                    <td className={`num ${rowPad}`}>
                      {holdingsPctMode && totals.value > 0 && r.value > 0
                        ? fmtPct(r.value / totals.value)
                        : fmtCurrency(r.value)}
                    </td>

                    {/* Money Invested (always $) */}
                    <td className={`num ${rowPad}`}>
                      {fmtCurrency(r.costBasisRemaining)}
                    </td>

                    {/* Unrealized – $ or % vs basis */}
                    <td className={`num ${rowPad} ${r.unrealUsd >= 0 ? 'pos' : 'neg'}`}>
                      {holdingsPctMode && basis > 0
                        ? fmtPct(r.unrealUsd / basis)
                        : fmtCurrency(r.unrealUsd)}
                    </td>

                    {/* Realized – $ or % vs basis */}
                    <td className={`num ${rowPad} ${r.realizedUsd >= 0 ? 'pos' : 'neg'}`}>
                      {holdingsPctMode && basis > 0
                        ? fmtPct(r.realizedUsd / basis)
                        : fmtCurrency(r.realizedUsd)}
                    </td>

                    {/* Total P&L – $ or % vs basis */}
                    <td className={`num ${rowPad} ${r.totalPnl >= 0 ? 'pos' : 'neg'}`}>
                      {holdingsPctMode && basis > 0
                        ? fmtPct(r.totalPnl / basis)
                        : fmtCurrency(r.totalPnl)}
                    </td>
                  </tr>
                )
              })}

              {filteredSorted.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="pf-empty">
                      No results. Try adjusting your search or sort.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {filteredSorted.length > 0 && (
              <tfoot>
                <tr>
                  <td><span className="lbl">Total</span></td>
                  <td className="num muted">—</td>
                  <td className="num muted">—</td>
                  <td className="num">{fmtCurrency(totals.value)}</td>
                  <td className="num">{fmtCurrency(totals.invested)}</td>
                  <td className={`num ${totals.unreal >= 0 ? 'pos' : 'neg'}`}>{fmtCurrency(totals.unreal)}</td>
                  <td className={`num ${totals.realized >= 0 ? 'pos' : 'neg'}`}>{fmtCurrency(totals.realized)}</td>
                  <td className={`num ${totals.total >= 0 ? 'pos' : 'neg'}`}>{fmtCurrency(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>


      <p className="text-xs text-slate-500">
      </p>
    </div>
  )
}
