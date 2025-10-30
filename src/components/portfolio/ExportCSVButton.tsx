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

export default function ExportCSVButton() {
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (!user) return
    setLoading(true); setErr(null)
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

      const levelRows = (levels ?? []).map(l => ({
        sell_planner_id: l.sell_planner_id,
        coingecko_id: l.coingecko_id,
        level: l.level,
        price: Number((l as any).price),
        rise_pct: (l as any).rise_pct ?? '',
        sell_pct_of_remaining: (l as any).sell_pct_of_remaining,
      }))

      // Build a count map: planner_id -> number of levels
      const countByPlanner = new Map<string, number>()
      for (const lv of levelRows) {
        const k = String(lv.sell_planner_id)
        countByPlanner.set(k, (countByPlanner.get(k) ?? 0) + 1)
      }

      // ---- Fetch SELL PLANNERS (no "levels" column here)
      const { data: planners, error: ePlanners } = await supabaseBrowser
        .from('sell_planners')
        .select('id,coingecko_id,is_active,avg_lock_price,sell_pct_of_remaining,created_at,frozen_at')
        .eq('user_id', user.id)
        .order('coingecko_id', { ascending: true })
        .order('created_at', { ascending: true })
      if (ePlanners) throw ePlanners

      const plannerRows = (planners ?? []).map(p => ({
        id: (p as any).id,
        coingecko_id: (p as any).coingecko_id,
        is_active: (p as any).is_active,
        avg_lock_price: (p as any).avg_lock_price ?? '',
        sell_pct_of_remaining: (p as any).sell_pct_of_remaining,
        created_at: (p as any).created_at,
        frozen_at: (p as any).frozen_at ?? '',
        // computed from levels table:
        levels_planned: countByPlanner.get(String((p as any).id)) ?? 0,
      }))

      // ---- Fetch TRADES
      const { data: trades, error: eTrades } = await supabaseBrowser
        .from('trades')
        .select('id,coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id')
        .eq('user_id', user.id)
        .order('trade_time', { ascending: true })
      if (eTrades) throw eTrades

      const tradesRows = (trades ?? []).map(t => ({
        id: (t as any).id,
        coingecko_id: (t as any).coingecko_id,
        side: (t as any).side,
        price: Number((t as any).price),
        quantity: Number((t as any).quantity),
        fee: (t as any).fee ?? 0,
        trade_time: (t as any).trade_time,
        buy_planner_id: (t as any).buy_planner_id ?? '',
        sell_planner_id: (t as any).sell_planner_id ?? '',
      }))

      // ---- Download CSVs
      download('trades.csv', toCsv(tradesRows))
      download('sell_planners.csv', toCsv(plannerRows))
      download('sell_levels.csv', toCsv(levelRows))
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
        className="rounded-lg border border-[#081427] bg-[#0a162c] px-3 py-2 text-sm hover:bg-[#102448] disabled:opacity-50"
      >
        {loading ? 'Exporting…' : 'Export CSV'}
      </button>
      {err && <span className="text-xs text-rose-400">{err}</span>}
    </div>
  )
}

