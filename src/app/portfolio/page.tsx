'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import { useRouter } from 'next/navigation'

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

  const [frozen, setFrozen] = useState<FrozenPlanner[]>([])
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
      if (!cancelled) setFrozen(
        (planners ?? []).map(p => ({
          id: p.id,
          coingecko_id: (p as any).coingecko_id,
          avg_lock_price: p.avg_lock_price
        }))
      )
    })()
    return () => { cancelled = true }
  }, [user, coinIds.join(',')])

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
  }, [user, frozen.map(f => f.id).join(',')])

  const [prices, setPrices] = useState<Record<string, number>>({})
  const [chg24hPctMap, setChg24hPctMap] = useState<Record<string, number | null>>({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (coinIds.length === 0) { setPrices({}); setChg24hPctMap({}); return }
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
      if (!cancelled) {
        const pm: Record<string, number> = {}
        const cm: Record<string, number | null> = {}
        pairs.forEach(([k, v, p]) => { if (v != null) pm[k] = v as number; cm[k] = p })
        setPrices(pm)
        setChg24hPctMap(cm)
      }
    })()
    return () => { cancelled = true }
  }, [coinIds.sort().join(',')])

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
        const avgLock = Number(fp.avg_lock_price ?? 0)
        const sum = sells.reduce((a, tr) => a + (tr.price - avgLock) * tr.quantity, 0)
        return acc + sum
      }, 0)

      const pct24 = chg24hPctMap[cid] ?? null
      let prevVal = 0, delta24Usd = 0, delta24Pct: number | null = null
      if (pct24 != null && last != null && qty > 0) {
        prevVal = qty * (last / (1 + pct24))
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

  const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border border-[#081427] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )

  function goToCoin(cid: string) {
    router.push(`/coins/${cid}`)
  }
  function onRowKey(e: React.KeyboardEvent<HTMLTableRowElement>, cid: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      router.push(`/coins/${cid}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
      </div>

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

      <div className="rounded-2xl border border-[#081427] p-4 overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="text-slate-300">
            <tr className="text-left">
              <th className="py-2 pr-2">Coin</th>
              <th className="py-2 pr-2">Qty</th>
              <th className="py-2 pr-2">Avg Cost</th>
              <th className="py-2 pr-2">Value</th>
              <th className="py-2 pr-2">Money Invested</th>
              <th className="py-2 pr-2">Unrealized</th>
              <th className="py-2 pr-2">Realized</th>
              <th className="py-2 pr-2">24h Δ</th>
              <th className="py-2 pr-2">Total P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.cid}
                className="border-t border-[#081427] hover:bg-[#0a162c] cursor-pointer"
                onClick={() => goToCoin(r.cid)}
                tabIndex={0}
                onKeyDown={(e) => onRowKey(e, r.cid)}
                aria-label={`Open ${r.name} page`}
                role="button"
              >
                <td className="py-2 pr-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{r.symbol}</span>
                    <span className="text-xs text-slate-400">{r.name}</span>
                  </div>
                </td>
                <td className="py-2 pr-2">{r.qty.toFixed(8)}</td>
                <td className="py-2 pr-2">{r.avg>0 ? fmtCurrency(r.avg) : '—'}</td>
                <td className="py-2 pr-2">{fmtCurrency(r.value)}</td>
                <td className="py-2 pr-2">{fmtCurrency(r.costBasisRemaining)}</td>
                <td className={`${r.unrealUsd>=0?'text-emerald-400':'text-rose-400'} py-2 pr-2`}>{fmtCurrency(r.unrealUsd)}</td>
                <td className={`${r.realizedUsd>=0?'text-emerald-400':'text-rose-400'} py-2 pr-2`}>{fmtCurrency(r.realizedUsd)}</td>
                <td className="py-2 pr-2">
                  {r.delta24Pct == null
                    ? fmtCurrency(r.delta24Usd)
                    : `${fmtCurrency(r.delta24Usd)} · ${fmtPct(r.delta24Pct)}`}
                </td>
                <td className={`${r.totalPnl>=0?'text-emerald-400':'text-rose-400'} py-2 pr-2`}>{fmtCurrency(r.totalPnl)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="py-3 text-slate-400 text-sm" colSpan={9}>No positions yet. Add buys on a coin page to see your portfolio here.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Money Invested = cost basis of your current holdings (Σ qty × avg). 24h Change uses per-coin 24h % when available;
        if the API doesn't provide it, the % will show as unavailable while the $ change uses 0.
      </p>
    </div>
  )
}

