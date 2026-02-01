'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { TrendingUp, TrendingDown, Search, ArrowUpDown, ChevronUp, ChevronDown, Info, Lock } from 'lucide-react'
import './portfolio-ui.css'
import CoinLogo from '@/components/common/CoinLogo'
import { useHistory } from '@/lib/dataCore' // NEW data core hooks only
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
  const CARD_BG = 'rgb(42,43,44)'
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

export default function PortfolioPage() {
  const { user } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  // Default-locked until entitlements load (prevents any Tier 0 “flash”)
  const canViewPortfolioRisk = !entLoading && (entitlements?.tier ?? 'FREE') !== 'FREE'

  const router = useRouter()

  const { data: trades } = useSWR<TradeRow[]>(
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
    }
  )

  const { data: coins } = useSWR<CoinMeta[]>(
    user ? ['/portfolio/coins'] : null,
    async () => {
      const res = await fetch('/api/coins')
      const j = await res.json()
      return (j ?? []) as CoinMeta[]
    }
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
  const frozenKey = useMemo(() => [...frozen.map(f => f.id)].sort().join(','), [frozen])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user || coinIds.length === 0) { setFrozen([]); return }
      const { data: planners } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,avg_lock_price,is_active')
        .eq('user_id', user.id)
        .in('coingecko_id', coinIds)
        .eq('is_active', false)
      const x = (planners ?? []).map(p => ({
        id: p.id,
        coingecko_id: p.coingecko_id,
        avg_lock_price: p.avg_lock_price,
      }))
      if (!cancelled) setFrozen(x)
    })()
    return () => { cancelled = true }
  }, [user, coinKey])

  const [frozenSells, setFrozenSells] = useState<TradeRow[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user || frozen.length === 0) { setFrozenSells([]); return }
      const ids = frozen.map(f => f.id)
      const { data } = await supabaseBrowser
        .from('trades')
        .select('coingecko_id,side,price,quantity,fee,trade_time,sell_planner_id')
        .eq('user_id', user.id)
        .eq('side', 'sell')
        .in('sell_planner_id', ids)
      const rows: TradeRow[] = (data ?? []).map(t => ({
        coingecko_id: t.coingecko_id,
        side: t.side,
        price: Number(t.price),
        quantity: Number(t.quantity),
        fee: t.fee ?? 0,
        trade_time: t.trade_time,
        sell_planner_id: t.sell_planner_id ?? null,
      }))
      if (!cancelled) setFrozenSells(rows)
    })()
    return () => { cancelled = true }
  }, [user, frozenKey])

  // Live snapshot pricing (new data core) for KPIs/table
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [chg24hPctMap, setChg24hPctMap] = useState<Record<string, number | null>>({})

  useEffect(() => {
    if (coinIds.length === 0) { setPrices({}); setChg24hPctMap({}); return }
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

  function coinMeta(cid: string): CoinMeta | undefined {
    return coins?.find(c => c.coingecko_id === cid)
  }

  const rows = useMemo(() => {
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

      const frozenForCoin = frozen.filter(f => f.coingecko_id === cid)
      const realizedUsd = frozenForCoin.reduce((acc, fp) => {
        const sells = frozenSells.filter(s => s.sell_planner_id === fp.id)
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

      return {
        cid,
        symbol: coinMeta(cid)?.symbol?.toUpperCase() ?? cid,
        name: coinMeta(cid)?.name ?? cid,
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
  }, [coinIds, tradesByCoin, prices, coins, frozen, frozenSells, chg24hPctMap])

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

    // ---------- StatCard ----------
  type Accent = 'pos' | 'neg' | 'neutral'
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
  const kpiAccent = (n: number | null | undefined): Accent =>
    n == null ? 'neutral' : n > 0 ? 'pos' : n < 0 ? 'neg' : 'neutral'


   // ---------------- Holdings UI state (client-side) ------------------
  type SortKey = 'name' | 'qty' | 'avg' | 'value' | 'invested' | 'unreal' | 'realized' | 'total'
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [dense, setDense] = useState(false)
  const [holdingsPctMode, setHoldingsPctMode] = useState(false)

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

  // ---------------- Exposure & Risk card ----------------
  type ViewMode = 'combined' | 'sector' | 'rank' | 'vol' | 'tail' | 'corr' | 'liq'
  const [view, setView] = useState<ViewMode>('combined')

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

  const rankMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of snapshot?.rows ?? []) {
      if (row.id && typeof row.rank === 'number') m.set(row.id, row.rank)
      if (row.id && (row.rank as any) === null) m.set(row.id, null as any)
    }
    return m
  }, [JSON.stringify(snapshot?.rows ?? [])])

  // Band aggregation + L1 structural factors
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
  }, [allocAll.total, JSON.stringify(allocAll.data), JSON.stringify([...rankMap.entries()])])

  // Shared rows / badges
  const LegendRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="tabular-nums">{value}</span>
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

  // --------- LAYER 2 & 3 helpers (BTC proxy fallback) ----------
const { points: btcDailyPts } = useHistory(canViewPortfolioRisk ? 'bitcoin' : null, 45, 'daily', 'USD')

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
  const corrIds = useMemo(() => {
    const sorted = [...allocAll.data]
      .filter(r => r.cid !== 'bitcoin')
      .sort((a, b) => b.value - a.value)
      .map(r => r.cid)
    const picked: string[] = sorted.slice(0, 8)
    while (picked.length < 8) picked.push('bitcoin')
    return picked
  }, [JSON.stringify(allocAll.data)])

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

  function corrToBTC(id: string): number | null {
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

  const corrAgg = useMemo(() => {
    const total = allocAll.total || 1
    const weights = allocAll.data.reduce<Record<string, number>>((m, r) => {
      m[r.cid] = r.value / total
      return m
    }, {})
    let wsum = 0, acc = 0
    for (const id of corrIds) {
      if (id === 'bitcoin') continue
      const c = corrToBTC(id)
      const w = weights[id] ?? 0
      if (c != null && w > 0) { acc += c * w; wsum += w }
    }
    const avg = wsum > 0 ? (acc / wsum) : null
    let factor = 1.00
    let level: 'Diversifier' | 'Neutral' | 'BTC-beta' | 'Ultra-beta'
    if (avg == null) { factor = 1.00; level = 'Neutral' }
    else if (avg < 0.40) { factor = 0.85; level = 'Diversifier' }
    else if (avg < 0.65) { factor = 1.00; level = 'Neutral' }
    else if (avg < 0.85) { factor = 1.15; level = 'BTC-beta' }
    else { factor = 1.30; level = 'Ultra-beta' }
    return { avg, factor, level }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allocAll.data), ...corrIds, hBTC.points, hC0.points, hC1.points, hC2.points, hC3.points, hC4.points, hC5.points, hC6.points, hC7.points])

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
      factor <= 1.05 ? ('High' as const)
      : factor <= 1.25 ? ('Moderate' as const)
      : factor <= 1.55 ? ('High' as const)
      : ('Very High' as const)
    return { factor, bands: { blue, large, medium, small, unranked }, level }
  }, [JSON.stringify(allocAll.data), JSON.stringify(Array.from(rankMap.entries()))])

  // ---- Helpers for levels/visuals (no logic change to calculations) ----
  const structuralLevel: 'Low'|'Moderate'|'High' =
    sectorAgg.score <= 120 ? 'Low' : sectorAgg.score <= 180 ? 'Moderate' : 'High'

  const volatilityLevel: 'Low'|'Moderate'|'High'|'Very High' =
    L2_annVol == null ? 'Moderate'
    : (L2_annVol < 0.55 ? 'Low' : (L2_annVol < 0.80 ? 'Moderate' : (L2_annVol <= 1.10 ? 'High' : 'Very High')))

  const tailLevel: 'Low'|'Moderate'|'High'|'Very High' = L3_active ? 'High' : 'Low'

  // Map correlation to standard Low/Moderate/High/Very High buckets
  const corrRiskLevel: 'Low'|'Moderate'|'High'|'Very High' =
    corrAgg.avg == null ? 'Moderate'
    : corrAgg.avg < 0.40 ? 'Low'
    : corrAgg.avg < 0.65 ? 'Moderate'
    : corrAgg.avg < 0.85 ? 'High'
    : 'Very High'

  // Liquidity → risk level (higher factor = worse liquidity ⇒ higher risk)
  const liquidityRiskLevel: 'Low'|'Moderate'|'High'|'Very High' =
    liquidityAgg.factor <= 1.05 ? 'Low'
    : liquidityAgg.factor <= 1.25 ? 'Moderate'
    : liquidityAgg.factor <= 1.55 ? 'High'
    : 'Very High'

  // Combined score (includes Corr & Liquidity)
  const L4_mult = corrAgg.factor
  const L5_mult = liquidityAgg.factor
  const combinedScore = sectorAgg.structuralSum * L2_mult * L3_factor * L4_mult * L5_mult
  const combinedLevel: 'Low'|'Moderate'|'High'|'Very High' =
    combinedScore <= 1.30 ? 'Low'
    : combinedScore <= 2.00 ? 'Moderate'
    : combinedScore <= 2.80 ? 'High'
    : 'Very High'

  // Visual meter (presentational)
  const clamp = (n:number, min:number, max:number) => Math.max(min, Math.min(max, n))
  const meterMin = 0.90, meterMax = 3.20
  const meterPct = ((clamp(combinedScore, meterMin, meterMax) - meterMin) / (meterMax - meterMin)) * 100

  // Pills (tabs)
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

  // ────────────────────────────────────────────────────────────────────────────────
  // Compact stat tile for bottom 5 boxes in Combined view — now with footer slot
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
  // ────────────────────────────────────────────────────────────────────────────────

  return (
    <div data-portfolio-page className="relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Portfolio</h1>
        <div className="flex items-center gap-2">
          <a href="/audit" className="inline-flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 px-3 py-2 text-xs">
            Audit Log
          </a>
        </div>
      </div>

            {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {/* No toggle on these two – always show $ */}
        <StatCard
          label="Portfolio Value"
          value={fmtCurrency(totals.value)}
          accent="neutral"
        />
        <StatCard
          label="Money Invested"
          value={fmtCurrency(totals.invested)}
          sub="Cost basis of current holdings"
          accent="neutral"
        />

        {/* Unrealized P&L – $ / % of invested */}
        <StatCard
          label="Unrealized P&L"
          value={fmtCurrency(totals.unreal)}
          pctValue={totals.invested > 0 ? fmtPct(totals.unreal / totals.invested) : '—'}
          accent={kpiAccent(totals.unreal)}
          icon={
            kpiAccent(totals.unreal) === 'pos'
              ? 'up'
              : kpiAccent(totals.unreal) === 'neg'
                ? 'down'
                : undefined
          }
          enablePctToggle
        />

        {/* Realized P&L – $ / % of invested */}
        <StatCard
          label="Realized P&L"
          value={fmtCurrency(totals.realized)}
          pctValue={totals.invested > 0 ? fmtPct(totals.realized / totals.invested) : '—'}
          accent={kpiAccent(totals.realized)}
          icon={
            kpiAccent(totals.realized) === 'pos'
              ? 'up'
              : kpiAccent(totals.realized) === 'neg'
                ? 'down'
                : undefined
          }
          enablePctToggle
        />

        {/* Total P&L – $ / % of invested */}
        <StatCard
          label="Total P&L"
          value={fmtCurrency(totals.total)}
          pctValue={totals.invested > 0 ? fmtPct(totals.total / totals.invested) : '—'}
          accent={kpiAccent(totals.total)}
          icon={
            kpiAccent(totals.total) === 'pos'
              ? 'up'
              : kpiAccent(totals.total) === 'neg'
                ? 'down'
                : undefined
          }
          enablePctToggle
        />

        {/* 24h Change – $ / % over previous 24h value */}
        <StatCard
          label="24h Change"
          value={
            totals.delta24Pct == null
              ? `${fmtCurrency(totals.delta24Usd)}`
              : `${fmtCurrency(totals.delta24Usd)} (${fmtPct(totals.delta24Pct)})`
          }
          pctValue={totals.delta24Pct != null ? fmtPct(totals.delta24Pct) : '—'}
          sub={totals.delta24Pct == null ? '24h % unavailable' : 'vs previous 24h value'}
          accent={kpiAccent(totals.delta24Usd)}
          icon={
            kpiAccent(totals.delta24Usd) === 'pos'
              ? 'up'
              : kpiAccent(totals.delta24Usd) === 'neg'
                ? 'down'
                : undefined
          }
          enablePctToggle
        />
      </div>


      {/* Exposure & Risk (left) + Allocation donut (right) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT: Exposure & Risk card */}
        <div className="lg:col-span-2">
<div className="relative rounded-md bg-[rgb(28,29,31)] overflow-hidden min-h-[380px] md:min-h-[460px]">
  {!canViewPortfolioRisk && (
<div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(15,16,18,0.82)] backdrop-blur-md rounded-md ring-1 ring-inset ring-[rgba(114,108,172,0.40)]">
      <div className="mx-6 max-w-[520px] text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgb(24,25,27)] px-3 py-1 text-[11px] font-medium text-slate-200">
          <Lock className="h-4 w-4 text-slate-300" />
          <span>Tier 1+ required</span>
        </div>

        <div className="mt-3 text-base font-semibold text-slate-50">Portfolio Risk Metrics are Locked</div>
        <div className="mt-2 text-sm leading-6 text-slate-300">
          Upgrade your plan to unlock Complete Exposure &amp; Risk Metrics (structural, volatility, tail risk, correlation, liquidity).
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
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-medium">Exposure & Risk Metric</div>
              <div className="flex items-center gap-2">
                <Pill active={view==='combined'} onClick={()=>setView('combined')}>Portfolio Risk</Pill>
                <Pill active={view==='sector'} onClick={()=>setView('sector')}>Structural</Pill>
                <Pill active={view==='vol'} onClick={()=>setView('vol')}>Volatility</Pill>
                <Pill active={view==='tail'} onClick={()=>setView('tail')}>Tail Risk</Pill>
                <Pill active={view==='corr'} onClick={()=>setView('corr')}>Correlation</Pill>
                <Pill active={view==='liq'} onClick={()=>setView('liq')}>Liquidity</Pill>
                <Pill active={view==='rank'} onClick={()=>setView('rank')}>Rank</Pill>
              </div>
            </div>

            {/* Global info tooltip — bottom-right of the whole Exposure & Risk Metric card (LARGER) */}
            <div className="group/ermtip pointer-events-auto absolute bottom-2 right-2">
              <Info className="h-5 w-5 text-slate-400 hover:text-slate-200" aria-label="Exposure & Risk info" />
              <div className="pointer-events-none absolute bottom-7 right-0 z-10 max-w-[85vw] w-[26rem] md:w-[28rem] rounded-md border border-[rgb(42,43,45)] bg-[rgb(24,25,27)] px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-xl opacity-0 transition-opacity group-hover/ermtip:opacity-100">
                A professional-grade crypto risk score based on market structure, volatility, correlation, tail-events, and liquidity — benchmarked against real Bitcoin regimes and crypto liquidity tiers.
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* SECTOR (Layer 1) */}
              {view === 'sector' && (
                <>
                  <LegendRow label="BlueChip (Ranks 1–2)" value={fmtPct(sectorAgg.blue)} />
                  <LegendRow label="Large Cap (Ranks 3–10)" value={fmtPct(sectorAgg.large)} />
                  <LegendRow label="Medium Cap (Ranks 11–20)" value={fmtPct(sectorAgg.medium)} />
                  <LegendRow label="Small Cap (Ranks 21–50)" value={fmtPct(sectorAgg.small)} />
                  <LegendRow label="Unranked / >50" value={fmtPct(sectorAgg.unranked)} />
                  <CardFooter
                    left={<RiskBadge score={sectorAgg.score} label={sectorAgg.label} />}
                    right={<>Score = Σ(weight × structural multiplier) × 100</>}
                  />
                </>
              )}

              {/* RANK */}
              {view === 'rank' && (
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
              {view === 'vol' && (
                <>
                  <LegendRow label="30d Annualized Volatility" value={L2_annVol != null ? `${(L2_annVol*100).toFixed(1)}%` : '—'} />
                  <LegendRow label="Regime" value={<span className="font-medium capitalize">{L2_regime}</span>} />
                  <LegendRow label="Multiplier" value={<span className="font-medium">×{L2_mult.toFixed(2)}</span>} />
                  <LegendRow label="Window" value="45 days · daily" />
                  <LegendRow label="Endpoint" value={prisk ? '/api/portfolio-risk' : '/api/price-history'} />
                  <CardFooter
                    left={
                      <LevelBadge
                        title="Volatility"
                        level={volatilityLevel}
                        value={`×${L2_mult.toFixed(2)}`}
                      />
                    }
                    right={<>Mapping: &lt;55% → 0.90 · 55–80% → 1.00 · 80–110% → 1.25 · &gt;110% → 1.60 {priskErr && <span className="ml-1 text-[rgba(189,45,50,1)]">(fallback)</span>}</>}
                  />
                </>
              )}

              {/* TAIL RISK */}
              {view === 'tail' && (
                <>
                  <LegendRow
                    label="Tail Status"
                    value={L3_active ? <span className="text-rose-400 font-medium">Active</span> : <span className="text-emerald-400 font-medium">Inactive</span>}
                  />
                  <LegendRow label="Tail Factor" value={<span className="font-medium">×{L3_factor.toFixed(2)}</span>} />
                  <LegendRow label="Activation Share (value-weighted)" value={<span className="font-medium">{fmtPct(L3_share)}</span>} />
                  <LegendRow label="Endpoint" value={prisk ? '/api/portfolio-risk' : '/api/price-history'} />
                  <CardFooter
                    left={
                      <LevelBadge
                        title="Tail"
                        level={tailLevel}
                        value={`×${L3_factor.toFixed(2)}`}
                      />
                    }
                    right={<>{prisk ? 'Weighted by portfolio' : 'Rule: price < (SMA20 − 2×SD20) ⇒ 1.35; else 1.00'} {priskErr && <span className="ml-1 text-[rgba(189,45,50,1)]">(fallback)</span>}</>}
                  />
                </>
              )}

              {/* CORRELATION */}
              {view === 'corr' && (
                <>
                  <LegendRow
                    label="Average 90d correlation vs BTC (value-weighted)"
                    value={corrAgg.avg == null ? '—' : corrAgg.avg.toFixed(2)}
                  />
                  <LegendRow label="Correlation Factor" value={<span className="font-medium">×{L4_mult.toFixed(2)}</span>} />
                  <LegendRow label="Profile" value={<span className="font-medium">{corrAgg.avg == null ? 'Neutral' : corrAgg.level}</span>} />
                  <LegendRow label="Window" value="90 days · daily (useHistory)" />
                  <CardFooter
                    left={
                      <LevelBadge
                        title="Correlation"
                        level={corrRiskLevel}
                        value={`×${L4_mult.toFixed(2)}`}
                      />
                    }
                    right={<span className="text-slate-400 text-[11px]">Source: new data core /api/price-history via useHistory</span>}
                  />
                </>
              )}

              {/* LIQUIDITY */}
              {view === 'liq' && (
                <>
                  <LegendRow label="Liquidity Factor (rank-proxy)" value={<span className="font-medium">×{L5_mult.toFixed(2)}</span>} />
                  <LegendRow label="BlueChip (1–2)" value={fmtPct(liquidityAgg.bands.blue)} />
                  <LegendRow label="Large (3–10)" value={fmtPct(liquidityAgg.bands.large)} />
                  <LegendRow label="Medium (11–20)" value={fmtPct(liquidityAgg.bands.medium)} />
                  <LegendRow label="Small (21–50)" value={fmtPct(liquidityAgg.bands.small)} />
                  <LegendRow label="Unranked / >50" value={fmtPct(liquidityAgg.bands.unranked)} />
                  <CardFooter
                    left={
                      <LevelBadge
                        title="Liquidity"
                        level={liquidityRiskLevel}
                        value={`×${L5_mult.toFixed(2)}`}
                      />
                    }
                    right={<span className="text-slate-400 text-[11px]">Proxy for exit depth by cap tier · No extra API; uses snapshot ranks</span>}
                  />
                </>
              )}

              {/* COMBINED */}
              {view === 'combined' && (
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
                        <div className="text-xs text-slate-300">Σ(weight × structural) × vol × tail × corr × liq</div>
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
                      label="Correlation"
                      value={`×${L4_mult.toFixed(2)}`}
                      rightHint="ρ"
                      footer={<LevelBadge title="Level" level={corrRiskLevel} value={corrAgg.avg == null ? '—' : `ρ=${corrAgg.avg.toFixed(2)}`} />}
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

        {/* RIGHT: Allocation donut */}
<div className="rounded-md bg-[rgb(28,29,31)] overflow-visible">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium">Allocation by Asset</div>
            <span className="text-[11px] text-slate-400">All assets</span>
          </div>

          {allocAll.data.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">No holdings yet to display allocation.</div>
          ) : (
            <div className="relative h-[18rem] sm:h-[20rem] md:h-[22rem] lg:h-[22rem] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocAll.data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="86%"
                    stroke="rgba(15,23,42,0.4)"
                    strokeWidth={1}
                    isAnimationActive
                  >
                    {allocAll.data.map((d, i) => (
                      <Cell key={d.name + i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} wrapperStyle={{ outline: 'none', zIndex: 60 }} />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 grid place-items-center z-0">
                <div className="text-center">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Total</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-100">{fmtCurrency(allocAll.total)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

            {/* HOLDINGS */}
      <div className="rounded-md bg-[rgb(28,29,31)] overflow-visible">
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="text-lg font-medium">Holdings</div>
              <span className="hidden sm:inline text-xs text-slate-400">
                • {filteredSorted.length} shown
              </span>
            </div>

            <div className="relative z-[70] flex items-center gap-2 w-full md:w-auto lo-dropdown-layer">
              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search coin or symbol…"
                  className="w-full pl-8 pr-2 py-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgb(42,43,44)] text-sm outline-none focus:ring-2 focus:ring-slate-600/40"
                  style={{ height: 38 }}
                />
              </div>

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
                className="inline-flex items-center gap-1 px-2 rounded-md border border-[rgb(42,43,45)] bg-[rgb(42,43,44)] text-sm hover:bg-[rgb(42,43,44)]/90"
                title={`Direction: ${sortDir}`}
                style={{ height: 38, minWidth: 120 }}
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortDir.toUpperCase()}
              </button>

              {/* Density: Compact / Comfort */}
              <button
                type="button"
                onClick={() => setDense((d) => !d)}
                className="inline-flex items-center gap-1 px-2 rounded-md border border-[rgb(42,43,45)] bg-[rgb(42,43,44)] text-sm hover:bg-[rgb(42,43,44)]/90"
                title={dense ? 'Comfortable rows' : 'Compact rows'}
                style={{ height: 38, minWidth: 120 }}
              >
                {dense ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
                {dense ? 'Compact' : 'Comfort'}
              </button>

                 {/* Holdings P&L mode: uses same card style as Compact/Comfort */}
              <button
                type="button"
                onClick={() => setHoldingsPctMode((v) => !v)}
                className="inline-flex items-center gap-1 px-2 rounded-md border border-[rgb(42,43,45)] bg-[rgb(42,43,44)] text-sm hover:bg-[rgb(42,43,44)]/90"
                title={holdingsPctMode ? 'Show values and P&L in $' : 'Show values and P&L as %'}
                style={{ height: 38 }}
              >
                <span
                  className={
                    holdingsPctMode ? 'font-semibold text-slate-400' : 'font-semibold text-slate-100'
                  }
                >
                  $
                </span>
                <span className="text-slate-500">/</span>
                <span
                  className={
                    holdingsPctMode ? 'font-semibold text-slate-100' : 'font-semibold text-slate-400'
                  }
                >
                  %
                </span>
                <span className="ml-1 text-slate-400">P&amp;L</span>
              </button>


            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-t border-[rgb(42,43,45)] bg-[rgb(24,25,27)] text-xs text-slate-400">
                <th className="py-2.5 pl-4 pr-2 text-left font-normal">Asset</th>
                <th className="py-2.5 pr-2 text-right font-normal">Qty</th>
                <th className="py-2.5 pr-2 text-right font-normal">Avg Cost</th>
                <th className="py-2.5 pr-2 text-right font-normal">Value</th>
                <th className="py-2.5 pr-2 text-right font-normal">Money Invested</th>
                <th className="py-2.5 pr-2 text-right font-normal">Unrealized P&amp;L</th>
                <th className="py-2.5 pr-2 text-right font-normal">Realized P&amp;L</th>
                <th className="py-2.5 pr-4 text-right font-normal">Total P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => {
                const rowPad = dense ? 'py-1.5' : 'py-2.5'
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
                    className="group cursor-pointer outline-none border-t border-[rgb(42,43,45)] bg-[rgb(28,29,31)] hover:bg-[rgb(26,27,28)] focus:bg-[rgb(19,20,21)]"
                  >
                    {/* Coin */}
                    <td className={`${rowPad} pl-4 pr-2`}>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 md:h-8 md:w-8">
                          <CoinLogo
                            symbol={r.symbol}
                            name={r.name}
                            className="h-5 w-5 md:h-7 md:w-7 shadow-none"
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.name}</div>
                          <div className="text-[11px] text-slate-400 -mt-0.5">{r.symbol}</div>
                        </div>
                      </div>
                    </td>

                    {/* Qty */}
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>
                      {r.qty.toLocaleString()}
                    </td>

                    {/* Avg Cost */}
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>
                      {fmtCurrency(r.avg)}
                    </td>

                    {/* Value – $ or % of portfolio */}
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>
                      {holdingsPctMode && totals.value > 0 && r.value > 0
                        ? fmtPct(r.value / totals.value)
                        : fmtCurrency(r.value)}
                    </td>

                    {/* Money Invested (always $) */}
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>
                      {fmtCurrency(r.costBasisRemaining)}
                    </td>

                    {/* Unrealized – $ or % vs basis */}
                    <td
                      className={`${rowPad} pr-2 text-right tabular-nums ${
                        r.unrealUsd >= 0 ? 'text-emerald-400' : 'text-[rgba(189,45,50,1)]'
                      }`}
                    >
                      {holdingsPctMode && basis > 0
                        ? fmtPct(r.unrealUsd / basis)
                        : fmtCurrency(r.unrealUsd)}
                    </td>

                    {/* Realized – $ or % vs basis */}
                    <td
                      className={`${rowPad} pr-2 text-right tabular-nums ${
                        r.realizedUsd >= 0 ? 'text-emerald-400' : 'text-[rgba(189,45,50,1)]'
                      }`}
                    >
                      {holdingsPctMode && basis > 0
                        ? fmtPct(r.realizedUsd / basis)
                        : fmtCurrency(r.realizedUsd)}
                    </td>

                    {/* Total P&L – $ or % vs basis */}
                    <td
                      className={`${rowPad} pr-4 text-right tabular-nums ${
                        r.totalPnl >= 0 ? 'text-emerald-400' : 'text-[rgba(189,45,50,1)]'
                      }`}
                    >
                      {holdingsPctMode && basis > 0
                        ? fmtPct(r.totalPnl / basis)
                        : fmtCurrency(r.totalPnl)}
                    </td>
                  </tr>
                )
              })}

              {filteredSorted.length === 0 && (
                <tr>
                  <td className="py-6 px-4 text-slate-400 text-sm" colSpan={8}>
                    No results. Try adjusting your search or sort.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      <p className="text-xs text-slate-500">
      </p>
    </div>
  )
}
