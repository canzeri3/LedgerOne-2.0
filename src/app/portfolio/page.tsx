'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import { useRouter } from 'next/navigation'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { TrendingUp, TrendingDown, Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import './portfolio-ui.css'
import CoinLogo from '@/components/common/CoinLogo'

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
type SnapshotRow = { id: string; rank?: number | null; market_cap?: number | null }

export default function PortfolioPage() {
  const { user } = useUser()
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
          if (typeof r.price === 'number') priceMap[id] = r.price
          if (r.pct24h == null) {
            pctMap[id] = null
          } else {
            const raw = Number(r.pct24h)
            pctMap[id] = Math.abs(raw) > 1 ? raw / 100 : raw
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

  // ---------- StatCard ----------
  type Accent = 'pos' | 'neg' | 'neutral'
  const StatCard = ({
    label, value, accent = 'neutral', icon, sub,
  }: {
    label: string; value: React.ReactNode; accent?: Accent; icon?: 'up' | 'down'; sub?: string
  }) => {
    const text =
      accent === 'pos' ? 'text-emerald-400'
      : accent === 'neg' ? 'text-[rgba(189,45,50,1)]'
      : 'text-slate-200'
    const iconUpClass = 'h-4 w-4 text-emerald-400'
    const iconDownClass = 'h-4 w-4 text-[rgba(189,45,50,1)]'

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

  // ---------------- Holdings UI state (client-side) ------------------
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
      <div className="rounded-md bg-slate-900/90 text-slate-100 text-xs p-2 shadow-xl">
        <div className="font-medium">{d.full}</div>
        <div className="text-[11px] text-slate-300">{d.name}</div>
        <div className="mt-0.5 tabular-nums">{fmtCurrency(d.value)} · {fmtPct(d.pct)}</div>
      </div>
    )
  }

  // ---------------- Exposure & Risk card (updated sector bands) ----------------
  type ViewMode = 'sector' | 'rank'

  const { data: snapshot } = useSWR<{ rows?: { id: string; rank?: number | null }[] }>(
    coinIds.length ? ['/portfolio/snapshot', coinKey] : null,
    async () => {
      // IMPORTANT: request ranks for *exact* holdings to ensure alias mapping and coverage
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

  const [view, setView] = useState<ViewMode>('sector')

  const sectorAgg = useMemo(() => {
    // weights from current holdings
    const total = allocAll.total
    const weights = allocAll.data.map(d => ({
      id: d.cid,
      symbol: d.name,
      pct: total > 0 ? d.value / total : 0,
      rank: rankMap.get(d.cid) ?? null,
    }))

    let blue = 0, large = 0, medium = 0, small = 0, unranked = 0
    for (const w of weights) {
      const r = w.rank
      if (r == null) { unranked += w.pct; continue }
      if (r >= 1 && r <= 2) blue += w.pct            // BlueChip 1–2
      else if (r >= 3 && r <= 10) large += w.pct      // Large Cap 3–10
      else if (r >= 11 && r <= 20) medium += w.pct    // Medium Cap 11–20
      else if (r >= 21 && r <= 50) small += w.pct     // Small Cap 21–50
      else unranked += w.pct                           // >50 treated as unranked
    }

    // Risk scoring tuned to new bands (transparent weights):
    // BlueChip 0.8, Large 1.0, Medium 2.0, Small 3.0, Unranked 2.0
    const score = (blue * 0.8 + large * 1.0 + medium * 2.0 + small * 3.0 + unranked * 2.0) * 100
    let label: 'Low' | 'Moderate' | 'High' =
      score <= 120 ? 'Low' : score <= 180 ? 'Moderate' : 'High'

    return { blue, large, medium, small, unranked, score: Math.round(score), label }
  }, [allocAll.total, JSON.stringify(allocAll.data), JSON.stringify([...rankMap.entries()])])

  const rankedHoldings = useMemo(() => {
    const total = allocAll.total
    const list = allocAll.data.map(d => ({
      id: d.cid,
      symbol: d.name,
      pct: total > 0 ? d.value / total : 0,
      rank: rankMap.get(d.cid) ?? null,
      value: d.value,
    }))
    return list
      .sort((a, b) => {
        const ra = a.rank ?? Number.POSITIVE_INFINITY
        const rb = b.rank ?? Number.POSITIVE_INFINITY
        if (ra !== rb) return ra - rb
        return b.pct - a.pct
      })
  }, [allocAll.total, JSON.stringify(allocAll.data), JSON.stringify([...rankMap.entries()])])

  const LegendRow = ({ label, pct }: { label: string; pct: number }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="tabular-nums">{fmtPct(pct)}</span>
    </div>
  )

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

  const RiskBadge = ({ score, label }: { score: number; label: string }) => {
    const accent =
      label === 'Low' ? 'text-emerald-400'
      : label === 'Moderate' ? 'text-[rgba(207,180,45,1)]'
      : 'text-[rgba(189,45,50,1)]'
    return (
      <div className="text-xs">
        <span className="text-slate-400 mr-2">Risk</span>
        <span className={`font-semibold tabular-nums ${accent}`}>{label}</span>
        <span className="text-slate-400"> · </span>
        <span className="tabular-nums">{score}</span>
      </div>
    )
  }

  return (
    <div data-portfolio-page className="relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Portfolio</h1>
        <div className="flex items-center gap-2">
          {/* Alerts tooltip removed */}
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
          value={
            totals.delta24Pct == null
              ? `${fmtCurrency(totals.delta24Usd)}`
              : `${fmtCurrency(totals.delta24Usd)} (${fmtPct(totals.delta24Pct)})`
          }
          sub={totals.delta24Pct == null ? '24h % unavailable' : 'vs previous 24h value'}
          accent={kpiAccent(totals.delta24Usd)}
          icon={kpiAccent(totals.delta24Usd)==='pos'?'up':kpiAccent(totals.delta24Usd)==='neg'?'down':undefined}
        />
      </div>

      {/* Exposure & Risk (left) + Allocation donut (right) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT: Exposure & Risk card */}
        <div className="lg:col-span-2">
          <div className="rounded-md bg-[rgb(28,29,31)] overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
             <div className="text-sm font-medium">Exposure & Risk Metric</div>
              <div className="flex items-center gap-2">
                <Pill active={view==='sector'} onClick={()=>setView('sector')}>Risk</Pill>
                <Pill active={view==='rank'} onClick={()=>setView('rank')}>Rank</Pill>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {(!snapshot || (snapshot.rows ?? []).length === 0) && (
                <div className="text-sm text-slate-400">
                  Market cap ranks unavailable. This card uses <code className="text-slate-300">/api/snapshot</code> when present.
                </div>
              )}

              {view === 'sector' ? (
                <div className="space-y-3">
                  <LegendRow label="BlueChip (Ranks 1–2)" pct={sectorAgg.blue} />
                  <LegendRow label="Large Cap (Ranks 3–10)" pct={sectorAgg.large} />
                  <LegendRow label="Medium Cap (Ranks 11–20)" pct={sectorAgg.medium} />
                  <LegendRow label="Small Cap (Ranks 21–50)" pct={sectorAgg.small} />
                  <LegendRow label="Unranked / >50" pct={sectorAgg.unranked} />

                  <div className="border-t border-[rgb(42,43,45)] pt-3 flex items-center justify-between">
                    <RiskBadge score={sectorAgg.score} label={sectorAgg.label} />
                    <div className="text-[11px] text-slate-400">
                      Score = Σ(weight × sector multiplier) × 100
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {rankedHoldings.length === 0 ? (
                    <div className="text-sm text-slate-400">No holdings to display.</div>
                  ) : (
                    rankedHoldings.map((h) => (
                      <div key={h.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300">{h.symbol}</span>
                          <span className="text-[11px] text-slate-400">Rank {h.rank ?? '—'}</span>
                        </div>
                        <span className="tabular-nums">{fmtPct(h.pct)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Allocation donut */}
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

                    {/* NEGATIVE = rgba(189,45,50,1) */}
                    <td className={`${rowPad} pr-2 text-right tabular-nums ${r.unrealUsd>=0?'text-emerald-400':'text-[rgba(189,45,50,1)]'}`}>
                      {fmtCurrency(r.unrealUsd)}
                    </td>
                    <td className={`${rowPad} pr-2 text-right tabular-nums ${r.realizedUsd>=0?'text-emerald-400':'text-[rgba(189,45,50,1)]'}`}>
                      {fmtCurrency(r.realizedUsd)}
                    </td>
                    <td className={`${rowPad} pr-4 text-right tabular-nums ${r.totalPnl>=0?'text-emerald-400':'text-[rgba(189,45,50,1)]'}`}>
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
        “Max” spans from your first BUY across all coins. Data is cached per-coin and aggregated client-side for smooth, real-time feel without changing your backend.
      </p>
    </div>
  )
}
