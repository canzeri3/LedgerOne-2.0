'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

type Coin = { coingecko_id: string; symbol: string; name: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const lines = rows.map((r) => headers.map((h) => esc((r as any)[h])).join(','))
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
  const [loading, setLoading] = useState<'all' | 'trades' | 'planners' | 'levels' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedCid, setSelectedCid] = useState<'ALL' | string>('ALL')

  // Coins for the dropdown
  const { data: coins } = useSWR<Coin[]>('/api/coins', fetcher)
  const coinOptions = useMemo(() => {
    const list = Array.isArray(coins) ? coins.slice() : []
    list.sort((a, b) => (a.symbol ?? '').localeCompare(b.symbol ?? '') || (a.name ?? '').localeCompare(b.name ?? ''))
    return list
  }, [coins])

  const scopeLabel =
    selectedCid === 'ALL'
      ? 'All coins'
      : (() => {
          const c = coinOptions.find((x) => x.coingecko_id === selectedCid)
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
      levels_planned: countByPlanner.get(String(p.id)) ?? 0,
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

  const ensureSignedIn = () => {
    if (!user) {
      setErr('Sign in to export CSV files')
      return false
    }
    return true
  }

  const ensureNotEmpty = (rows: any[]) => {
    if (!rows.length) {
      setErr('Nothing to export yet')
      return false
    }
    return true
  }

  // ---- Single-file handlers -------------------------------------------------
  const doLevels = async () => {
    if (!ensureSignedIn()) return
    setErr(null)
    setLoading('levels')
    try {
      const levels = await fetchLevels()
      if (!ensureNotEmpty(levels)) return
      const name = selectedCid === 'ALL' ? 'sell_levels.csv' : `sell_levels_${selectedCid}.csv`
      download(name, toCsv(levels))
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  const doPlanners = async () => {
    if (!ensureSignedIn()) return
    setErr(null)
    setLoading('planners')
    try {
      const levels = await fetchLevels()
      const countByPlanner = new Map<string, number>()
      for (const lv of levels) {
        const key = String((lv as any).sell_planner_id)
        countByPlanner.set(key, (countByPlanner.get(key) ?? 0) + 1)
      }

      const planners = await fetchPlanners(countByPlanner)
      if (!ensureNotEmpty(planners)) return

      const name = selectedCid === 'ALL' ? 'sell_planners.csv' : `sell_planners_${selectedCid}.csv`
      download(name, toCsv(planners))
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  const doTrades = async () => {
    if (!ensureSignedIn()) return
    setErr(null)
    setLoading('trades')
    try {
      const trades = await fetchTrades()
      if (!ensureNotEmpty(trades)) return
      const name = selectedCid === 'ALL' ? 'trades.csv' : `trades_${selectedCid}.csv`
      download(name, toCsv(trades))
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  // ---- All-in-one (may be limited by browser multi-download policy) ---------
  const doAll = async () => {
    if (!ensureSignedIn()) return
    setErr(null)
    setLoading('all')
    try {
      const levels = await fetchLevels()
      const countByPlanner = new Map<string, number>()
      for (const lv of levels) {
        const key = String((lv as any).sell_planner_id)
        countByPlanner.set(key, (countByPlanner.get(key) ?? 0) + 1)
      }

      const planners = await fetchPlanners(countByPlanner)
      const trades = await fetchTrades()

      if (!levels.length && !planners.length && !trades.length) {
        setErr('Nothing to export yet')
        return
      }

      const suffix = selectedCid === 'ALL' ? '' : `_${selectedCid}`
      if (trades.length) download(`trades${suffix}.csv`, toCsv(trades))
      if (planners.length) download(`sell_planners${suffix}.csv`, toCsv(planners))
      if (levels.length) download(`sell_levels${suffix}.csv`, toCsv(levels))
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  // UI primitives (match the improved Audit controls look)
  const inputBase =
    'rounded-xl bg-[rgb(18,19,21)]/70 ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-3 py-2.5 text-[14px] text-slate-100 hover:bg-[rgb(18,19,21)]/85 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'

  const btnBase =
    'rounded-xl bg-[rgb(18,19,21)]/70 ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-3 py-2.5 text-[13px] text-slate-100 hover:bg-[rgb(18,19,21)]/90 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2 disabled:opacity-50 disabled:hover:bg-[rgb(18,19,21)]/70'

  return (
    <div className="space-y-4">
      {/* Scope selector */}
      <div className="rounded-xl bg-[rgba(255,255,255,0.02)] ring-1 ring-inset ring-[rgb(41,42,45)]/70 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[rgb(186,186,188)]">Scope</div>
            <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">Exporting: {scopeLabel}</div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select className={inputBase} value={selectedCid} onChange={(e) => setSelectedCid(e.target.value as any)}>
              <option value="ALL">All coins</option>
              {coinOptions.map((c) => (
                <option key={c.coingecko_id} value={c.coingecko_id}>
                  {(c.symbol || c.coingecko_id).toUpperCase()} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={doAll} disabled={!user || loading !== null} className={btnBase} title="Download all available CSV files">
          {loading === 'all' ? 'Preparing…' : 'Download all CSVs'}
        </button>

        <span className="text-[12px] text-[rgb(140,140,142)] mx-1">or</span>

        <button onClick={doTrades} disabled={!user || loading !== null} className={btnBase} title="Download trades CSV">
          {loading === 'trades' ? 'Preparing…' : 'Trades'}
        </button>

        <button onClick={doPlanners} disabled={!user || loading !== null} className={btnBase} title="Download sell planners CSV">
          {loading === 'planners' ? 'Preparing…' : 'Sell planners'}
        </button>

        <button onClick={doLevels} disabled={!user || loading !== null} className={btnBase} title="Download sell levels CSV">
          {loading === 'levels' ? 'Preparing…' : 'Sell levels'}
        </button>

        {err && <span className="text-[12px] text-rose-300 ml-2">{err}</span>}
      </div>

      <p className="text-[12px] text-[rgb(140,140,142)]">
        If your browser blocks multiple downloads, use the individual buttons.
      </p>
    </div>
  )
}
