'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

type Coin = { coingecko_id: string; symbol: string; name: string }

const fetcher = (url: string) => fetch(url).then(r => r.json())

function toCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: any) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const headerLine = headers.map(esc).join(',')
  const lines = rows.map(r => headers.map(h => esc((r as any)[h])).join(','))
  return [headerLine, ...lines].join('\n')
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportCSVButtons() {
  const { user } = useUser()
  const [loading, setLoading] = useState<'all'|'trades'|'planners'|'levels'|null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedCid, setSelectedCid] = useState<'ALL' | string>('ALL')

  // Coins for the dropdown
  const { data: coins } = useSWR<Coin[]>('/api/coins', fetcher)
  const coinOptions = useMemo(() => {
    const list = Array.isArray(coins) ? coins.slice() : []
    // sort by symbol then name for nice UX
    list.sort((a, b) => (a.symbol ?? '').localeCompare(b.symbol ?? '') || (a.name ?? '').localeCompare(b.name ?? ''))
    return list
  }, [coins])

  const scopeLabel = selectedCid === 'ALL'
    ? 'All coins'
    : (() => {
        const c = coinOptions.find(x => x.coingecko_id === selectedCid)
        return c ? `${(c.symbol || c.coingecko_id).toUpperCase()} — ${c.name}` : selectedCid
      })()

  // ---- Fetch helpers (apply coin filter when selected) ---------------------
  const fetchLevels = async () => {
    let q: any = supabaseBrowser
      .from('sell_levels')
      .select('sell_planner_id,coingecko_id,level,price,rise_pct,sell_pct_of_remaining')
      .eq('user_id', user!.id)
      .order('coingecko_id', { ascending: true })
      .order('sell_planner_id', { ascending: true })
      .order('level', { ascending: true })
    if (selectedCid !== 'ALL') q = q.eq('coingecko_id', selectedCid)

    const { data, error } = await q
    if (error) throw error

    return (data ?? []).map((l: any) => ({
      sell_planner_id: l.sell_planner_id,
      coingecko_id: l.coingecko_id,
      level: l.level,
      price: Number(l.price),
      rise_pct: l.rise_pct ?? '',
      sell_pct_of_remaining: l.sell_pct_of_remaining,
    }))
  }

  const fetchPlanners = async (countByPlanner: Map<string, number>) => {
    let q: any = supabaseBrowser
      .from('sell_planners')
      .select('id,coingecko_id,is_active,avg_lock_price,created_at,frozen_at')
      .eq('user_id', user!.id)
      .order('coingecko_id', { ascending: true })
      .order('created_at', { ascending: true })
    if (selectedCid !== 'ALL') q = q.eq('coingecko_id', selectedCid)

    const { data, error } = await q
    if (error) throw error

    return (data ?? []).map((p: any) => ({
      id: p.id,
      coingecko_id: p.coingecko_id,
      is_active: p.is_active,
      avg_lock_price: p.avg_lock_price ?? '',
      created_at: p.created_at,
      frozen_at: p.frozen_at ?? '',
      levels_planned: countByPlanner.get(String(p.id)) ?? 0, // computed
    }))
  }

  const fetchTrades = async () => {
    let q: any = supabaseBrowser
      .from('trades')
      .select('id,coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id')
      .eq('user_id', user!.id)
      .order('trade_time', { ascending: true })
    if (selectedCid !== 'ALL') q = q.eq('coingecko_id', selectedCid)

    const { data, error } = await q
    if (error) throw error

    return (data ?? []).map((t: any) => ({
      id: t.id,
      coingecko_id: t.coingecko_id,
      side: t.side,
      price: Number(t.price),
      quantity: Number(t.quantity),
      fee: t.fee ?? 0,
      trade_time: t.trade_time,
      buy_planner_id: t.buy_planner_id ?? '',
      sell_planner_id: t.sell_planner_id ?? '',
    }))
  }

  // ---- Single-file handlers -----------------------------------------------
  const doLevels = async () => {
    if (!user) return
    setErr(null); setLoading('levels')
    try {
      const levels = await fetchLevels()
      const name = selectedCid === 'ALL' ? 'sell_levels.csv' : `sell_levels_${selectedCid}.csv`
      download(name, toCsv(levels))
    } catch (e: any) {
      setErr(e?.message || 'Export sell_levels failed')
    } finally {
      setLoading(null)
    }
  }

  const doPlanners = async () => {
    if (!user) return
    setErr(null); setLoading('planners')
    try {
      const levels = await fetchLevels()
      const countByPlanner = new Map<string, number>()
      for (const lv of levels) {
        const key = String((lv as any).sell_planner_id)
        countByPlanner.set(key, (countByPlanner.get(key) ?? 0) + 1)
      }
      const planners = await fetchPlanners(countByPlanner)
      const name = selectedCid === 'ALL' ? 'sell_planners.csv' : `sell_planners_${selectedCid}.csv`
      download(name, toCsv(planners))
    } catch (e: any) {
      setErr(e?.message || 'Export sell_planners failed')
    } finally {
      setLoading(null)
    }
  }

  const doTrades = async () => {
    if (!user) return
    setErr(null); setLoading('trades')
    try {
      const trades = await fetchTrades()
      const name = selectedCid === 'ALL' ? 'trades.csv' : `trades_${selectedCid}.csv`
      download(name, toCsv(trades))
    } catch (e: any) {
      setErr(e?.message || 'Export trades failed')
    } finally {
      setLoading(null)
    }
  }

  // ---- All-in-one (may be limited by browser multi-download policy) --------
  const doAll = async () => {
    if (!user) return
    setErr(null); setLoading('all')
    try {
      const levels = await fetchLevels()
      const countByPlanner = new Map<string, number>()
      for (const lv of levels) {
        const key = String((lv as any).sell_planner_id)
        countByPlanner.set(key, (countByPlanner.get(key) ?? 0) + 1)
      }
      const planners = await fetchPlanners(countByPlanner)
      const trades = await fetchTrades()

      const suffix = selectedCid === 'ALL' ? '' : `_${selectedCid}`
      download(`trades${suffix}.csv`, toCsv(trades))
      download(`sell_planners${suffix}.csv`, toCsv(planners))
      download(`sell_levels${suffix}.csv`, toCsv(levels))
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Scope selector */}
      <div className="rounded-2xl border border-[#081427] p-3">
        <div className="text-sm text-slate-300 mb-2">Scope</div>
        <div className="flex gap-3 flex-wrap items-center">
          <select
            className="rounded-md border border-[#0b1830] bg-[#0a162c] px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#18305f]"
            value={selectedCid}
            onChange={(e) => setSelectedCid(e.target.value as any)}
          >
            <option value="ALL">All coins</option>
            {coinOptions.map(c => (
              <option key={c.coingecko_id} value={c.coingecko_id}>
                {(c.symbol || c.coingecko_id).toUpperCase()} — {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">Currently exporting: {scopeLabel}</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={doAll}
          disabled={!user || loading !== null}
          className="rounded-lg border border-[#081427] bg-[#0a162c] px-3 py-2 text-sm hover:bg-[#102448] disabled:opacity-50"
          title="Download trades, planners, and levels"
        >
          {loading === 'all' ? 'Exporting…' : 'Export All CSVs'}
        </button>

        <span className="text-slate-500 text-xs">or</span>

        <button
          onClick={doTrades}
          disabled={!user || loading !== null}
          className="rounded-lg border border-[#081427] bg-[#0a162c] px-3 py-2 text-sm hover:bg-[#102448] disabled:opacity-50"
          title="Download trades.csv"
        >
          {loading === 'trades' ? 'Exporting…' : 'Trades CSV'}
        </button>

        <button
          onClick={doPlanners}
          disabled={!user || loading !== null}
          className="rounded-lg border border-[#081427] bg-[#0a162c] px-3 py-2 text-sm hover:bg-[#102448] disabled:opacity-50"
          title="Download sell_planners.csv"
        >
          {loading === 'planners' ? 'Exporting…' : 'Sell Planners CSV'}
        </button>

        <button
          onClick={doLevels}
          disabled={!user || loading !== null}
          className="rounded-lg border border-[#081427] bg-[#0a162c] px-3 py-2 text-sm hover:bg-[#102448] disabled:opacity-50"
          title="Download sell_levels.csv"
        >
          {loading === 'levels' ? 'Exporting…' : 'Sell Levels CSV'}
        </button>

        {err && <span className="text-xs text-rose-400 ml-2">{err}</span>}
      </div>

      <p className="text-xs text-slate-500">
        If your browser blocks multiple downloads, use the individual CSV buttons. Filenames include the coin id when exporting a single coin.
      </p>
    </div>
  )
}

