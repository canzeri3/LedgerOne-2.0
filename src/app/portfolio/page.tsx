'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import { useRouter } from 'next/navigation'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import PortfolioHistoryChartCard from '@/components/portfolio/PortfolioHistoryChartCard'
import { TrendingUp, TrendingDown, Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import './portfolio-ui.css'
import CoinLogo from '@/components/common/CoinLogo'

/** 4.10 batched price layer */
import { PricesProvider, usePrices } from '@/contexts/PricesContext'

/* Planner math (unchanged) */
import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyLevel,
  type BuyTrade,
  type SellLevel as PlannerSellLevel,
  type SellTrade as PlannerSellTrade,
} from '@/lib/planner'

/** --- Types that mirror your schema/UI needs --- */
type TradeRow = {
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number | null
  trade_time: string
  sell_planner_id: string | null
}
type CoinMeta = { coingecko_id: string; symbol: string; name: string }
type FrozenPlanner = { id: string; coingecko_id: string; avg_lock_price: number | null }
type BuyPlannerRow = {
  coingecko_id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: number | null
  growth_per_level: number | null
  is_active: boolean | null
}
type SellPlannerRow = { id: string; coingecko_id: string; is_active: boolean | null }
type SellLevelRow = { sell_planner_id: string; level: number; price: number; sell_tokens: number | null }

export default function PortfolioPage() {
  const { user } = useUser()
  const router = useRouter()

  /** --------- Core data: trades + coin metadata (unchanged) --------- */
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

  /** --------- Build tradesByCoin + base coinIds (unchanged) --------- */
  const tradesByCoin = useMemo(() => {
    const m = new Map<string, TradeRow[]>()
    ;(trades ?? []).forEach(t => {
      if (!m.has(t.coingecko_id)) m.set(t.coingecko_id, [])
      m.get(t.coingecko_id)!.push(t)
    })
    return m
  }, [trades])

  const baseCoinIds = useMemo(() => Array.from(tradesByCoin.keys()), [tradesByCoin])

  /** --------- Frozen planner context (unchanged) --------- */
  const [frozen, setFrozen] = useState<FrozenPlanner[]>([])
  const frozenKey = useMemo(() => [...frozen.map(f => f.id)].sort().join(','), [frozen])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user || baseCoinIds.length === 0) { setFrozen([]); return }
      const { data: planners } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,avg_lock_price,is_active')
        .eq('user_id', user.id)
        .in('coingecko_id', baseCoinIds)
        .eq('is_active', false)
      const x = (planners ?? []).map(p => ({
        id: p.id,
        coingecko_id: p.coingecko_id,
        avg_lock_price: p.avg_lock_price,
      }))
      if (!cancelled) setFrozen(x)
    })()
    return () => { cancelled = true }
  }, [user, baseCoinIds.join(',')])

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

  /** --------- ACTIVE planners + levels (moved here so Provider can include their ids) --------- */
  const { data: activeBuyPlanners } = useSWR<BuyPlannerRow[]>(
    user ? ['/alerts/buy-planners', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select('coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,is_active,user_id')
        .eq('user_id', user!.id)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []).map(({ coingecko_id, top_price, budget_usd, total_budget, ladder_depth, growth_per_level, is_active }) => ({
        coingecko_id, top_price, budget_usd, total_budget, ladder_depth, growth_per_level, is_active
      }))
    },
    { revalidateOnFocus: true, dedupingInterval: 10000 }
  )

  const { data: activeSellPlanners } = useSWR<SellPlannerRow[]>(
    user ? ['/alerts/sell-planners', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,is_active,user_id')
        .eq('user_id', user!.id)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []).map(({ id, coingecko_id, is_active }) => ({ id, coingecko_id, is_active }))
    },
    { revalidateOnFocus: true, dedupingInterval: 10000 }
  )

  const sellPlannerIds = useMemo(
    () => (activeSellPlanners ?? []).map(p => p.id),
    [activeSellPlanners?.map?.(p => p.id).join(',')]
  )

  const { data: sellLevels } = useSWR<SellLevelRow[]>(
    user && sellPlannerIds.length ? ['/alerts/sell-levels', sellPlannerIds.join(',')] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('sell_planner_id,level,price,sell_tokens')
        .in('sell_planner_id', sellPlannerIds)
        .order('level', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { revalidateOnFocus: true, dedupingInterval: 10000 }
  )

  /** --------- Derive all coin IDs needed on this page (for one batched price call) --------- */
  const plannerCoinIds = useMemo(() => {
    const s = new Set<string>()
    for (const p of activeBuyPlanners ?? []) s.add(p.coingecko_id)
    for (const p of activeSellPlanners ?? []) s.add(p.coingecko_id)
    return Array.from(s)
  }, [JSON.stringify(activeBuyPlanners), JSON.stringify(activeSellPlanners)])

  const allCoinIds = useMemo(() => {
    const s = new Set<string>(baseCoinIds)
    for (const id of plannerCoinIds) s.add(id)
    return Array.from(s)
  }, [baseCoinIds, plannerCoinIds])

  /** --------- Wrap the entire page with PricesProvider (one batched fetch per page) --------- */
  return (
    <PricesProvider ids={allCoinIds}>
      <PortfolioContent
        router={router}
        coins={coins}
        tradesByCoin={tradesByCoin}
        coinIds={baseCoinIds}
        frozen={frozen}
        frozenSells={frozenSells}
        activeBuyPlanners={activeBuyPlanners ?? []}
        activeSellPlanners={activeSellPlanners ?? []}
        sellLevels={sellLevels ?? []}
      />
    </PricesProvider>
  )
}

/* ============================= MAIN CONTENT ============================= */
function PortfolioContent({
  router,
  coins,
  tradesByCoin,
  coinIds,
  frozen,
  frozenSells,
  activeBuyPlanners,
  activeSellPlanners,
  sellLevels,
}: {
  router: ReturnType<typeof useRouter>
  coins: CoinMeta[] | undefined
  tradesByCoin: Map<string, TradeRow[]>
  coinIds: string[]
  frozen: FrozenPlanner[]
  frozenSells: TradeRow[]
  activeBuyPlanners: BuyPlannerRow[]
  activeSellPlanners: SellPlannerRow[]
  sellLevels: SellLevelRow[]
}) {
  /** 4.10: read prices once from the Provider */
  const { getPrice } = usePrices()

  const coinMeta = (cid: string) => coins?.find(c => c.coingecko_id === cid)

  /** ---- Build per-coin rows (UI math unchanged) ---- */
  const rows = useMemo(() => {
    return coinIds.map(cid => {
      const t = tradesByCoin.get(cid) ?? []
      const pnl = computePnl(t.map(x => ({
        side: x.side, price: x.price, quantity: x.quantity, fee: x.fee ?? 0, trade_time: x.trade_time
      } as PnlTrade)))

      const qty = pnl.positionQty
      const avg = pnl.avgCost
      const last = getPrice(cid) // <<<< SINGLE SOURCE OF TRUTH
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

      // If you previously derived 24h deltas from pct: keep the UI stable by
      // computing them as unknown when we don't have pct in this page
      const delta24Usd = 0
      const delta24Pct: number | null = null

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
    }).sort((a, b) => b.value - a.value)
  }, [coinIds, tradesByCoin, coins, frozen, frozenSells, getPrice])

  /** ---- Totals (unchanged UI) ---- */
  const totals = useMemo(() => {
    const value = rows.reduce((a, r) => a + r.value, 0)
    const invested = rows.reduce((a, r) => a + r.costBasisRemaining, 0)
    const unreal = rows.reduce((a, r) => a + r.unrealUsd, 0)
    const realized = rows.reduce((a, r) => a + r.realizedUsd, 0)
    const prevTotal = rows.reduce((a, r) => {
      const prev = (r.delta24Pct != null && r.value != null)
        ? r.value / (r.delta24Pct + 1)
        : r.value
      return a + (prev ?? 0)
    }, 0)
    const delta24Usd = value - prevTotal
    const delta24Pct = prevTotal > 0 ? delta24Usd / prevTotal : null
    return { value, invested, unreal, realized, total: unreal + realized, delta24Usd, delta24Pct }
  }, [rows])

  /** ---- StatCard (unchanged visuals) ---- */
  type Accent = 'pos' | 'neg' | 'neutral'
  const StatCard = ({
    label, value, accent = 'neutral', icon, sub,
  }: {
    label: string; value: React.ReactNode; accent?: Accent; icon?: 'up' | 'down'; sub?: string
  }) => {
    const text =
      accent === 'pos' ? 'text-emerald-400'
      : accent === 'neg' ? 'text-[rgba(189, 45, 50, 1)]'
      : 'text-slate-200'
    const iconUpClass = 'h-4 w-4 text-emerald-400'
    const iconDownClass = 'h-4 w-4 text-[rgba(189, 45, 50, 1)]'

    return (
      <div className="h-full rounded-md bg-[rgb(28,29,31)]">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
            {icon === 'up' && <TrendingUp className={iconUpClass} />}
            {icon === 'down' && <TrendingDown className={iconDownClass} />}
          </div>
          <div className={`mt-2 text-xl md:text-2xl font-semibold tabular-nums ${text}`}>{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
        </div>
      </div>
    )
  }
  const kpiAccent = (n: number | null | undefined): Accent =>
    n == null ? 'neutral' : n > 0 ? 'pos' : n < 0 ? 'neg' : 'neutral'

  /** ---- Holdings table UI state (unchanged) ---- */
  type SortKey = 'name' | 'qty' | 'avg' | 'value' | 'invested' | 'unreal' | 'realized' | 'total'
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [dense, setDense] = useState(false)

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

  /** ---- Allocation card (unchanged visuals) ---- */
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
    const list = rows.map(r => ({ name: r.symbol, full: r.name, value: r.value }))
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
      <div className="rounded-md bg-slate-900/90 text-slate-100 text-xs p-2 shadow-xl">
        <div className="font-medium">{d.full}</div>
        <div className="text-[11px] text-slate-300">{d.name}</div>
        <div className="mt-0.5 tabular-nums">{fmtCurrency(d.value)} · {fmtPct(d.pct)}</div>
      </div>
    )
  }

  /** ----------------------- Alerts Tooltip ----------------------- **/
  function AlertsTooltip({
    coinIds, tradesByCoin, coins,
    activeBuyPlanners, activeSellPlanners, sellLevels
  }: {
    coinIds: string[]
    tradesByCoin: Map<string, TradeRow[]>
    coins: CoinMeta[] | undefined
    activeBuyPlanners: BuyPlannerRow[]
    activeSellPlanners: SellPlannerRow[]
    sellLevels: SellLevelRow[]
  }) {
    const { user } = useUser()
    const router = useRouter()
    const { getPrice } = usePrices() // << batched price accessor

    const symbolOf = (cid: string) =>
      coins?.find(c => c.coingecko_id === cid)?.symbol?.toUpperCase() ?? cid.toUpperCase()

    const alertItems = useMemo(() => {
      type AlertItem = { side: 'Buy' | 'Sell'; symbol: string; cid: string }
      const out: AlertItem[] = []

      // BUY alerts
      for (const p of activeBuyPlanners ?? []) {
        const cid = p.coingecko_id
        const live = getPrice(cid) ?? 0
        if (!(live > 0)) continue

        const top = Number(p.top_price ?? 0)
        const budget = Number(p.budget_usd ?? p.total_budget ?? 0)
        const depth: 70 | 90 = Number(p.ladder_depth) === 90 ? 90 : 70
        const growth = Number(p.growth_per_level ?? 0)
        if (!(top > 0) || !(budget > 0)) continue

        const plan: BuyLevel[] = buildBuyLevels(top, budget, depth, growth)
        const buys: BuyTrade[] = (tradesByCoin.get(cid) ?? [])
          .filter(t => t.side === 'buy')
          .map(t => ({ price: t.price, quantity: t.quantity, fee: t.fee ?? 0, trade_time: t.trade_time }))

        const fills = computeBuyFills(plan, buys, 0)
        const hit = plan.some((lv, i) => {
          const lvl = Number(lv.price)
          if (!(lvl > 0)) return false
          const within = live <= lvl * 1.03
          const notFilled = (fills.fillPct?.[i] ?? 0) < 0.97
          return within && notFilled
        })
        if (hit) out.push({ side: 'Buy', symbol: symbolOf(cid), cid })
      }

      // SELL alerts
      const lvlsByPlanner = new Map<string, SellLevelRow[]>()
      for (const l of sellLevels ?? []) {
        const arr = lvlsByPlanner.get(l.sell_planner_id) ?? []
        arr.push(l)
        lvlsByPlanner.set(l.sell_planner_id, arr)
      }

      for (const sp of activeSellPlanners ?? []) {
        const cid = sp.coingecko_id
        const live = getPrice(cid) ?? 0
        if (!(live > 0)) continue

        const raw = (lvlsByPlanner.get(sp.id) ?? []).sort((a,b)=>a.level-b.level)
        if (!raw.length) continue

        const levels: PlannerSellLevel[] = raw.map(l => ({
          target_price: Number(l.price),
          planned_tokens: Math.max(0, Number(l.sell_tokens ?? 0)),
        }))

        const sells = (tradesByCoin.get(cid) ?? [])
          .filter(t => t.side === 'sell')
          .map<PlannerSellTrade>(t => ({ price: t.price, quantity: t.quantity, fee: t.fee ?? 0, trade_time: t.trade_time }))

        const fill = computeSellFills(levels, sells, 0.05)
        const hit = levels.some((lv, i) => {
          const lvl = Number(lv.target_price)
          if (!(lvl > 0)) return false
          const within = live >= lvl * 0.97
          const notFilled = (fill.fillPct?.[i] ?? 0) < 0.97
          return within && notFilled
        })
        if (hit) out.push({ side: 'Sell', symbol: symbolOf(cid), cid })
      }

      const buys = out.filter(x => x.side === 'Buy').sort((a,b)=>a.symbol.localeCompare(b.symbol))
      const sells = out.filter(x => x.side === 'Sell').sort((a,b)=>a.symbol.localeCompare(b.symbol))
      return [...buys, ...sells]
    }, [
      JSON.stringify(activeBuyPlanners),
      JSON.stringify(activeSellPlanners),
      JSON.stringify(sellLevels),
      JSON.stringify([...tradesByCoin.entries()].map(([k,v])=>[k,v.length])),
      getPrice
    ])

    const totalAlerts = alertItems.length

    const Badge = ({ kind }: { kind: 'Buy'|'Sell' }) => {
      const isBuy = kind === 'Buy'
      return (
        <span
          className={[
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            isBuy
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-rose-500/15 text-rose-300',
          ].join(' ')}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 opacity-90">
            {isBuy ? <path d="M10 3l5 6h-3v8H8V9H5l5-6z" /> : <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />}
          </svg>
          {kind}
        </span>
      )
    }

    const CountPill = ({ n }: { n: number }) => {
      if (!n) return null
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide bg-indigo-500/20 text-indigo-200">
          {n}
        </span>
      )
    }

    const openCoin = (cid: string) => router.push(`/coins/${cid}`)

    return (
      <div className="alerts-tooltip relative inline-block group">
        <button
          className="relative px-4 py-2 text-xs font-semibold text-white bg-indigo-600/90 rounded-xl hover:bg-indigo-700/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 overflow-hidden inline-flex items-center gap-2"
          type="button"
          aria-haspopup="true"
          aria-expanded="false"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-xl group-hover:opacity-75 transition-opacity"></div>
          <span className="relative flex items-center gap-2">
            <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" className="w-4 h-4">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"></path>
            </svg>
            <span>Alerts</span>
            <CountPill n={totalAlerts} />
          </span>
        </button>

        <div className="absolute invisible opacity-0 group-hover:visible group-hover:opacity-100 top-full left-1/2 -translate-x-1/2 mt-3 w-80 transition-all duration-300 ease-out transform group-hover:translate-y-0 -translate-y-2 z-50">
          <div className="relative p-4 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-[0_10px_30px_rgba(2,6,23,0.6)]">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gradient-to-br from-slate-900 to-slate-800 rotate-45"></div>

            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-300">
                  <path clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" fillRule="evenodd"></path>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white/95">Alerts</h3>
              <CountPill n={totalAlerts} />
            </div>

            <div className="mt-2 space-y-1.5">
              {totalAlerts === 0 && (
                <p className="text-sm text-slate-300/90">No active alerts right now.</p>
              )}
              {alertItems.map((a, idx) => (
                <div
                  key={`${a.cid}-${a.side}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCoin(a.cid)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openCoin(a.cid)
                    }
                  }}
                  className="text-sm text-gray-200 flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5 focus:bg-white/10 focus:outline-none transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Badge kind={a.side} />
                    <span className="font-medium tracking-tight">{a.symbol}</span>
                  </div>
                  <span className={a.side === 'Buy'
                    ? 'h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]'
                    : 'h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.65)]'
                  } />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /** ---------------------------- RENDER ---------------------------- */
  return (
    <div data-portfolio-page className="relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Portfolio</h1>
        <div className="flex items-center gap-2">
          <AlertsTooltip
            coinIds={coinIds}
            tradesByCoin={tradesByCoin}
            coins={coins}
            activeBuyPlanners={activeBuyPlanners}
            activeSellPlanners={activeSellPlanners}
            sellLevels={sellLevels}
          />
          <a href="/audit" className="inline-flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 px-3 py-2 text-xs">
            Audit Log
          </a>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Portfolio Value" value={fmtCurrency(totals.value)} accent="neutral" />
        <StatCard label="Money Invested" value={fmtCurrency(totals.invested)} sub="Cost basis of current holdings" accent="neutral" />
        <StatCard label="Unrealized P&L" value={fmtCurrency(totals.unreal)} accent={kpiAccent(totals.unreal)} icon={kpiAccent(totals.unreal)==='pos'?'up':kpiAccent(totals.unreal)==='neg'?'down':undefined} />
        <StatCard label="Realized P&L" value={fmtCurrency(totals.realized)} accent={kpiAccent(totals.realized)} icon={kpiAccent(totals.realized)==='pos'?'up':kpiAccent(totals.realized)==='neg'?'down':undefined} />
        <StatCard label="Total P&L" value={fmtCurrency(totals.total)} accent={kpiAccent(totals.total)} icon={kpiAccent(totals.total)==='pos'?'up':kpiAccent(totals.total)==='neg'?'down':undefined} />
        <StatCard
          label="24h Change"
          value={totals.delta24Pct == null ? `${fmtCurrency(totals.delta24Usd)}` : `${fmtCurrency(totals.delta24Usd)} · ${fmtPct(totals.delta24Pct)}`}
          sub={totals.delta24Pct == null ? '24h % unavailable' : 'vs previous 24h value'}
          accent={kpiAccent(totals.delta24Usd)}
          icon={kpiAccent(totals.delta24Usd)==='pos'?'up':kpiAccent(totals.delta24Usd)==='neg'?'down':undefined}
        />
      </div>

      {/* History + Allocation */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 chart-wrap">
          <PortfolioHistoryChartCard trades={tradesByCoin ? Array.from(tradesByCoin.values()).flat() : []} />
        </div>

        {/* Allocation card */}
        <div className="rounded-md bg-[rgb(28,29,31)] overflow-hidden">
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
                  <Tooltip content={<CustomTooltip />} wrapperStyle={{ outline: 'none' }} />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 grid place-items-center">
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
      <div className="rounded-md bg-[rgb(28,29,31)] overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium">Holdings</div>
              <span className="hidden sm:inline text-xs text-slate-400">• {filteredSorted.length} shown</span>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search coin or symbol…"
                  className="w-full pl-8 pr-2 py-2 rounded-md border border-slate-700/40 bg-slate-900/40 text-sm outline-none focus:ring-2 focus:ring-slate-600/40"
                />
              </div>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as any)}
                className="px-2 py-2 rounded-md border border-slate-700/40 bg-slate-900/40 text-xs"
                aria-label="Sort by"
                title="Sort by"
              >
                <option value="value">Sort: Value</option>
                <option value="total">Sort: Total P&L</option>
                <option value="unreal">Sort: Unrealized</option>
                <option value="realized">Sort: Realized</option>
                <option value="invested">Sort: Money Invested</option>
                <option value="qty">Sort: Qty</option>
                <option value="avg">Sort: Avg Cost</option>
                <option value="name">Sort: Name</option>
              </select>

              <button
                type="button"
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="inline-flex items-center gap-1 px-2 py-2 rounded-md border border-slate-700/40 bg-slate-900/40 text-xs hover:bg-slate-900/60"
                title={`Direction: ${sortDir}`}
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortDir.toUpperCase()}
              </button>

              <button
                type="button"
                onClick={() => setDense(d => !d)}
                className="inline-flex items-center gap-1 px-2 py-2 rounded-md border border-slate-700/40 bg-slate-900/40 text-xs hover:bg-slate-900/60"
                title={dense ? 'Comfortable rows' : 'Compact rows'}
              >
                {dense ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                {dense ? 'Compact' : 'Comfort'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="text-slate-300 sticky top-0 bg-[rgb(28,29,31)] border-y border-[rgb(42,43,45)]">
              <tr className="text-left">
                <th className="py-2 pl-4 pr-2 font-medium">Coin</th>
                <th className="py-2 pr-2 font-medium text-right">Qty</th>
                <th className="py-2 pr-2 font-medium text-right">Avg Cost</th>
                <th className="py-2 pr-2 font-medium text-right">Value</th>
                <th className="py-2 pr-2 font-medium text-right">Money Invested</th>
                <th className="py-2 pr-2 font-medium text-right">Unrealized</th>
                <th className="py-2 pr-2 font-medium text-right">Realized</th>
                <th className="py-2 pr-4 font-medium text-right">Total P&L</th>
              </tr>
            </thead>

            <tbody>
              {filteredSorted.map(r => {
                const rowPad = dense ? 'py-1.5' : 'py-2.5'
                return (
                  <tr
                    key={r.cid}
                    onClick={() => router.push(`/coins/${r.cid}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/coins/${r.cid}`) } }}
                    tabIndex={0}
                    className="group cursor-pointer outline-none transition-colors odd:bg-[rgb(28,29,31)] even:bg-[rgb(26,27,28)] hover:bg-[rgb(19,20,21)] focus:bg-[rgb(19,20,21)]"
                  >
                    <td className={`${rowPad} pl-4 pr-2`}>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 md:h-8 md:w-8">
                          <CoinLogo symbol={r.symbol} name={r.name} className="h-5 w-5 md:h-7 md:w-7 shadow-none" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.name}</div>
                          <div className="text-[11px] text-slate-400 -mt-0.5">{r.symbol}</div>
                        </div>
                      </div>
                    </td>

                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>{r.qty.toLocaleString()}</td>
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>{fmtCurrency(r.avg)}</td>
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>{fmtCurrency(r.value)}</td>
                    <td className={`${rowPad} pr-2 text-right tabular-nums`}>{fmtCurrency(r.costBasisRemaining)}</td>

                    <td className={`${rowPad} pr-2 text-right tabular-nums ${r.unrealUsd>=0?'text-emerald-400':'text-[rgba(189, 45, 50, 1)]'}`}>
                      {fmtCurrency(r.unrealUsd)}
                    </td>
                    <td className={`${rowPad} pr-2 text-right tabular-nums ${r.realizedUsd>=0?'text-emerald-400':'text-[rgba(189, 45, 50, 1)]'}`}>
                      {fmtCurrency(r.realizedUsd)}
                    </td>
                    <td className={`${rowPad} pr-4 text-right tabular-nums ${r.totalPnl>=0?'text-emerald-400':'text-[rgba(189, 45, 50, 1)]'}`}>
                      {fmtCurrency(r.totalPnl)}
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
        “Max” spans from your first BUY across all coins. Data is batched per page for reliability and speed.
      </p>
    </div>
  )
}
