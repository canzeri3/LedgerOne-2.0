'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

type ParsedRow = {
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee?: number | ''
  trade_time: string
  buy_planner_id?: string | ''
  sell_planner_id?: string | ''
}

const REQUIRED = ['coingecko_id','side','price','quantity','trade_time'] as const

function isRequiredMissing(headers: string[]) {
  const missing = REQUIRED.filter(h => !headers.includes(h))
  return missing
}

function parseNumber(v: any): number {
  if (v === '' || v == null) return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export default function ImportTrades() {
  const { user } = useUser()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string>('')

  const append = (s: string) => setLog(prev => (prev ? prev + '\n' : '') + s)

  const handleFile = async (file: File) => {
    setBusy(true)
    setLog('')
    try {
      append(`Reading ${file.name}…`)
      const text = await file.text()
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
      if (parsed.errors?.length) {
        append(`Parser warnings: ${parsed.errors.length}`)
      }

      const headers = (parsed.meta?.fields ?? []) as string[]
      const missing = isRequiredMissing(headers)
      if (missing.length) {
        append(`❌ Missing columns: ${missing.join(', ')}`)
        return
      }

      // Validate & shape rows
      const rows: ParsedRow[] = []
      for (const r of parsed.data as any[]) {
        const cid = String(r.coingecko_id || '').trim()
        const side = String(r.side || '').toLowerCase()
        const price = parseNumber(r.price)
        const qty = parseNumber(r.quantity)
        const fee = r.fee === '' || r.fee == null ? '' : parseNumber(r.fee)
        const t = String(r.trade_time || '').trim()

        if (!cid || (side !== 'buy' && side !== 'sell') || !Number.isFinite(price) || !Number.isFinite(qty) || !t) {
          append(`Skipping invalid row: ${JSON.stringify(r)}`)
          continue
        }

        // Basic time normalization: allow ISO or "YYYY-MM-DD HH:mm:ss"
        const dt = new Date(t)
        if (isNaN(dt.getTime())) {
          append(`Skipping row with bad trade_time: ${t}`)
          continue
        }

        rows.push({
          coingecko_id: cid,
          side: side as 'buy'|'sell',
          price: Number(price),
          quantity: Number(qty),
          fee: fee === '' ? '' : Number(fee),
          trade_time: dt.toISOString(),
          buy_planner_id: (r.buy_planner_id ?? '').trim(),
          sell_planner_id: (r.sell_planner_id ?? '').trim(),
        })
      }

      if (rows.length === 0) {
        append('No valid rows to import.')
        return
      }

      append(`Validated ${rows.length} rows. Inserting…`)

      // Batch inserts (e.g., chunks of 200)
      const BATCH = 200
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH)
        const payload = slice.map(r => ({
          user_id: user!.id,
          coingecko_id: r.coingecko_id,
          side: r.side,
          price: r.price,
          quantity: r.quantity,
          fee: r.fee === '' ? null : r.fee,
          trade_time: r.trade_time,
          buy_planner_id: r.buy_planner_id || null,
          sell_planner_id: r.sell_planner_id || null,
        }))

        const { error } = await supabaseBrowser.from('trades').insert(payload)
        if (error) {
          append(`❌ Insert error (rows ${i+1}–${i+slice.length}): ${error.message}`)
          return
        }
        inserted += slice.length
        append(`✅ Inserted ${inserted}/${rows.length}`)
      }

      append('Done.')
    } catch (e: any) {
      append(`❌ ${e?.message || e}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && user) handleFile(f)
  }

  return (
    <div className="rounded-2xl border border-[#081427] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-medium">Import Trades (CSV)</div>
          <div className="text-xs text-slate-400">
            Required columns: <code>coingecko_id, side, price, quantity, trade_time</code>. Optional: <code>fee, buy_planner_id, sell_planner_id</code>.
          </div>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPick}
            disabled={!user || busy}
            className="text-sm text-slate-200"
          />
        </div>
      </div>

      <div className="rounded-lg bg-[#0a162c] border border-[#0b1830] p-3">
        <div className="text-xs text-slate-300 mb-1">Console</div>
        <pre className="text-xs text-slate-400 whitespace-pre-wrap break-words max-h-56 overflow-auto">{log || '—'}</pre>
      </div>

      <div className="text-xs text-slate-500">
        <div className="mb-1">Example header:</div>
        <pre className="bg-[#0a162c] border border-[#0b1830] p-2 rounded">
coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id
bitcoin,buy,45000,0.01,0.5,2025-09-10T14:23:00Z,,
        </pre>
      </div>
    </div>
  )
}

