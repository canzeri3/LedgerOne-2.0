'use client'

import { useState } from 'react'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

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

export default function ExportCSVButton() {
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (!user) {
      setErr('Sign in to export CSV files')
      return
    }

    setLoading(true)
    setErr(null)

    try {
      // ---- Fetch SELL LEVELS first so we can compute counts per planner
      const { data: levels, error: eLevels } = await supabaseBrowser
        .from('sell_levels')
        .select('sell_planner_id,coingecko_id,level,price,rise_pct,sell_pct_of_remaining')
        .eq('user_id', user.id)
        .order('coingecko_id', { ascending: true })
        .order('sell_planner_id', { ascending: true })
        .order('level', { ascending: true })
      if (eLevels) throw eLevels

      const levelRows = (levels ?? []).map((l: any) => ({
        sell_planner_id: l.sell_planner_id,
        coingecko_id: l.coingecko_id,
        level: l.level,
        price: Number(l.price),
        rise_pct: l.rise_pct ?? '',
        sell_pct_of_remaining: l.sell_pct_of_remaining,
      }))

      const countByPlanner = new Map<string, number>()
      for (const lv of levelRows) {
        const k = String(lv.sell_planner_id)
        countByPlanner.set(k, (countByPlanner.get(k) ?? 0) + 1)
      }

      // ---- Fetch SELL PLANNERS (keep columns aligned with ExportCSVButtons)
      const { data: planners, error: ePlanners } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,is_active,avg_lock_price,created_at,frozen_at')
        .eq('user_id', user.id)
        .order('coingecko_id', { ascending: true })
        .order('created_at', { ascending: true })
      if (ePlanners) throw ePlanners

      const plannerRows = (planners ?? []).map((p: any) => ({
        id: p.id,
        coingecko_id: p.coingecko_id,
        is_active: p.is_active,
        avg_lock_price: p.avg_lock_price ?? '',
        created_at: p.created_at,
        frozen_at: p.frozen_at ?? '',
        levels_planned: countByPlanner.get(String(p.id)) ?? 0,
      }))

      // ---- Fetch TRADES
      const { data: trades, error: eTrades } = await supabaseBrowser
        .from('trades')
        .select('id,coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id')
        .eq('user_id', user.id)
        .order('trade_time', { ascending: true })
      if (eTrades) throw eTrades

      const tradesRows = (trades ?? []).map((t: any) => ({
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

      if (!tradesRows.length && !plannerRows.length && !levelRows.length) {
        setErr('Nothing to export yet')
        return
      }

      if (tradesRows.length) download('trades.csv', toCsv(tradesRows))
      if (plannerRows.length) download('sell_planners.csv', toCsv(plannerRows))
      if (levelRows.length) download('sell_levels.csv', toCsv(levelRows))
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={!user || loading}
        className="rounded-xl bg-[rgb(18,19,21)]/70 ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-3 py-2.5 text-[13px] text-slate-100 hover:bg-[rgb(18,19,21)]/90 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2 disabled:opacity-50 disabled:hover:bg-[rgb(18,19,21)]/70"
      >
        {loading ? 'Preparing…' : 'Download CSV files'}
      </button>

      {err && <span className="text-[12px] text-rose-300">{err}</span>}
    </div>
  )
}
