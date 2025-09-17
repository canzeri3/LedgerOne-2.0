'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import { useRouter } from 'next/navigation'
import AllocationDonut from '@/components/portfolio/AllocationDonut'
import PortfolioHistoryChartCard from '@/components/portfolio/PortfolioHistoryChartCard'

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
type PriceResp = { price: number | null, change_24h?: number | null }

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
  const frozenKey = useMemo(
    () => [...frozen.map(f => f.id)].sort().join(','),
    [frozen]
  )

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

  // Live snapshot pricing (for KPIs/table) — unchanged
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [chg24hPctMap, setChg24hPctMap] = useState<Record<string, number | null>>({})

  useEffect(() => {
    if (coinIds.length === 0) { setPrices({}); setChg24hPctMap({}); return }
    let cancelled = false

    async function fetchAll() {
      const pairs = await Promise.all(coinIds.map(async (cid) => {
        try {
          const res = await fetch(`/api/price/${cid}`)
          const j: PriceResp = await res.json()
          const price = (j && typeof j.price === 'number') ? j.price : null
          let pct: number | null = null
          if (j && j.change_24h != null) {
            const raw = Number(j.change_24h)
            pct = Math.abs(raw) > 1 ? raw / 100 : raw
          }
          return [cid, price, pct] as const
        } catch {
          return [cid, null, null] as const
        }
      }))

      if (cancelled) return
      const priceMap: Record<string, number> = {}
      const pctMap: Record<string, number | null> = {}
      pairs.forEach(([cid, price, pct]) => {
        if (price != null) priceMap[cid] = price
        pctMap[cid] = pct
      })
      setPrices(priceMap)
      setChg24hPctMap(pctMap)
    }

    fetchAll()
    const id = setInterval(fetchAll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [coinKey])

  function coinMeta(cid: string): CoinMeta | undefined {
    return coins?.find(c => c.coingecko_id === cid)
  }

  // Per-coin computed rows (unchanged business logic)
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
      const prev = (r.delta24Pct != null && r.value != null) ? (r.value / (1 + (r.delta24Pct ?? 0))) : r.value
      return a + (prev ?? 0)
    }, 0)
    const delta24Usd = value - prevTotal
    const delta24Pct = prevTotal > 0 ? (delta24Usd / prevTotal) : null
    return { value, invested, unreal, realized, total: unreal + realized, delta24Usd, delta24Pct }
  }, [rows])

  // Navigation helpers
  function goToCoin(cid: string) { router.push(`/coins/${cid}`) }
  function onRowKey(e: React.KeyboardEvent<HTMLTableRowElement>, cid: string) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/coins/${cid}`) }
  }

  const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="rounded-2xl border border-[#081427] bg-white/5 backdrop-blur-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Portfolio</h1>
            <p className="text-xs text-slate-400 mt-1">Your full holdings, performance, and allocation — live.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/audit" className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs">
              Audit Log
            </a>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Portfolio Value" value={fmtCurrency(totals.value)} />
        <StatCard label="Money Invested" value={fmtCurrency(totals.invested)} sub="Cost basis of current holdings" />
        <StatCard label="Unrealized P&L" value={fmtCurrency(totals.unreal)} />
        <StatCard label="Realized P&L" value={fmtCurrency(totals.realized)} />
        <StatCard label="Total P&L" value={fmtCurrency(totals.total)} />
        <StatCard
          label="24h Change"
          value={
            totals.delta24Pct == null
              ? `${fmtCurrency(totals.delta24Usd)}`
              : `${fmtCurrency(totals.delta24Usd)} · ${fmtPct(totals.delta24Pct)}`
          }
          sub={totals.delta24Pct == null ? '24h % unavailable' : 'vs previous 24h value'}
        />
      </div>

      {/* Portfolio price-history chart + Allocation donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Portfolio History (since earliest buy; cached history + range selector) */}
        <div className="lg:col-span-2">
          <PortfolioHistoryChartCard trades={trades ?? []} />
        </div>

        {/* Right: Allocation Donut */}
        <div className="rounded-2xl border border-[#081427] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Allocation by Asset</div>
            <div className="text-xs text-slate-400">{rows.length} assets</div>
          </div>
          <div className="h-64">
            <AllocationDonut data={rows.map(r => ({ name: r.symbol, value: r.value }))} />
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="rounded-2xl border border-[#081427] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0b1830] bg-white/5 backdrop-blur-md flex items-center justify-between">
          <div className="text-sm font-medium">Holdings</div>
          <div className="text-xs text-slate-400">{rows.length} shown</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="text-slate-300 sticky top-0 bg-[#0a162c]/80 backdrop-blur">
              <tr className="text-left">
                <th className="py-2 pl-4 pr-2">Coin</th>
                <th className="py-2 pr-2">Qty</th>
                <th className="py-2 pr-2">Avg Cost</th>
                <th className="py-2 pr-2">Value</th>
                <th className="py-2 pr-2">Money Invested</th>
                <th className="py-2 pr-2">Unrealized</th>
                <th className="py-2 pr-2">Realized</th>
                <th className="py-2 pr-2">24h Δ</th>
                <th className="py-2 pr-4">Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr
                  key={r.cid}
                  onClick={() => goToCoin(r.cid)}
                  onKeyDown={(e) => onRowKey(e, r.cid)}
                  tabIndex={0}
                  className="group cursor-pointer hover:bg-white/5 focus:bg-white/10 outline-none"
                >
                  <td className="py-2 pl-4 pr-2">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-white/10 grid place-items-center text-[11px] text-slate-200">
                        {r.symbol.slice(0,3)}
                      </div>
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[11px] text-slate-400 -mt-0.5">{r.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="py-2 pr-2">{fmtCurrency(r.avg)}</td>
                  <td className="py-2 pr-2">{fmtCurrency(r.value)}</td>
                  <td className="py-2 pr-2">{fmtCurrency(r.costBasisRemaining)}</td>
                  <td className={(r.unrealUsd>=0?'text-emerald-400':'text-rose-400') + ' py-2 pr-2'}>{fmtCurrency(r.unrealUsd)}</td>
                  <td className={(r.realizedUsd>=0?'text-emerald-400':'text-rose-400') + ' py-2 pr-2'}>{fmtCurrency(r.realizedUsd)}</td>
                  <td className="py-2 pr-2">
                    {r.delta24Pct == null
                      ? fmtCurrency(r.delta24Usd)
                      : `${fmtCurrency(r.delta24Usd)} · ${fmtPct(r.delta24Pct)}`}
                  </td>
                  <td className={(r.totalPnl>=0?'text-emerald-400':'text-rose-400') + ' py-2 pr-4'}>{fmtCurrency(r.totalPnl)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="py-3 px-4 text-slate-400 text-sm" colSpan={9}>
                    No holdings yet. Add buys on a coin page to see your portfolio here.
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

