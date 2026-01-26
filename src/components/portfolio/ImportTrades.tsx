'use client'

import { useRef, useState, type ChangeEvent } from 'react'
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

const REQUIRED = ['coingecko_id', 'side', 'price', 'quantity', 'trade_time'] as const

function isRequiredMissing(headers: string[]) {
  return REQUIRED.filter((h) => !headers.includes(h))
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

  const append = (s: string) => setLog((prev) => (prev ? prev + '\n' : '') + s)

  const handleFile = async (file: File) => {
    if (!user) {
      append('Sign in to import trades.')
      return
    }

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
        append(`Missing columns: ${missing.join(', ')}`)
        return
      }

      // Validate & shape rows
      const rows: ParsedRow[] = []
      for (const r of parsed.data as any[]) {
        const cid = String(r.coingecko_id || '').trim()
        const side = String(r.side || '').toLowerCase()
        const price = parseNumber(r.price)
        const qty = parseNumber(r.quantity)
        const t = String(r.trade_time || '').trim()

        if (!cid || (side !== 'buy' && side !== 'sell') || !Number.isFinite(price) || !Number.isFinite(qty) || !t) {
          append(`Skipping invalid row: ${JSON.stringify(r)}`)
          continue
        }

        // Time normalization: allow ISO or anything Date() can parse reasonably
        const dt = new Date(t)
        if (isNaN(dt.getTime())) {
          append(`Skipping row with bad trade_time: ${t}`)
          continue
        }

        // Fee: optional; if present but not numeric, treat as blank (do not insert NaN)
        let feeVal: number | '' = ''
        if (!(r.fee === '' || r.fee == null)) {
          const nf = parseNumber(r.fee)
          if (Number.isFinite(nf)) feeVal = nf
          else append(`Warning: invalid fee "${r.fee}" — treating as blank`)
        }

        rows.push({
          coingecko_id: cid,
          side: side as 'buy' | 'sell',
          price: Number(price),
          quantity: Number(qty),
          fee: feeVal,
          trade_time: dt.toISOString(),
          buy_planner_id: String(r.buy_planner_id ?? '').trim(),
          sell_planner_id: String(r.sell_planner_id ?? '').trim(),
        })
      }

      if (rows.length === 0) {
        append('No valid rows to import.')
        return
      }

      // Deterministic ordering for ledger safety (time asc, coin, buys before sells when timestamps tie)
      rows.sort((a, b) => {
        const t1 = a.trade_time.localeCompare(b.trade_time)
        if (t1) return t1
        const c = a.coingecko_id.localeCompare(b.coingecko_id)
        if (c) return c
        if (a.side === b.side) return 0
        return a.side === 'buy' ? -1 : 1
      })

      append(`Validated ${rows.length} rows. Inserting…`)

      // Batch inserts (chunks of 200)
      const BATCH = 200
      let inserted = 0

      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH)
        const payload = slice.map((r) => ({
          user_id: user.id,
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
          append(`Batch insert error (rows ${i + 1}–${i + slice.length}): ${error.message}`)
          append('Trying row-by-row to find the failing row…')

          for (let j = 0; j < payload.length; j++) {
            const rowNum = i + j + 1
            const one = payload[j]
            const { error: eOne } = await supabaseBrowser.from('trades').insert(one)
            if (eOne) {
              append(`Failed row ${rowNum}: ${eOne.message}`)
              append(`Row data: ${JSON.stringify(slice[j])}`)
              return
            }
            inserted += 1
            append(`Inserted ${inserted}/${rows.length}`)
          }

          continue
        }

        inserted += payload.length
        append(`Inserted ${inserted}/${rows.length}`)
      }

      append('Import complete.')
    } catch (e: any) {
      append(`Import failed: ${e?.message || String(e)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void handleFile(f)
  }

  return (
    <section className="rounded-2xl bg-[rgb(28,29,31)] ring-1 ring-inset ring-[rgb(41,42,45)]/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      <div className="p-4 md:p-5 border-b border-[rgb(41,42,45)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.00))]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[14px] text-slate-100 font-medium">Import trades (CSV)</div>
            <div className="mt-1 text-[12px] text-[rgb(163,163,164)]">
              Required: <code className="text-slate-200/80">coingecko_id, side, price, quantity, trade_time</code>. Optional:{' '}
              <code className="text-slate-200/80">fee, buy_planner_id, sell_planner_id</code>.
            </div>
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onPick}
              disabled={!user || busy}
              className="text-[13px] text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-[rgb(18,19,21)]/70 file:px-3 file:py-2.5 file:text-[13px] file:text-slate-100 file:ring-1 file:ring-inset file:ring-[rgb(58,60,66)]/70 hover:file:bg-[rgb(18,19,21)]/90 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="p-4 md:p-5 space-y-4">
        <div className="rounded-xl bg-[rgb(18,19,21)]/55 ring-1 ring-inset ring-[rgb(58,60,66)]/70 p-3">
          <div className="text-[11px] uppercase tracking-wide text-[rgb(176,176,178)] mb-2">Console</div>
          <pre className="text-[12px] text-slate-100/90 whitespace-pre-wrap break-words max-h-56 overflow-auto">{log || '—'}</pre>
        </div>

        <div className="text-[12px] text-[rgb(140,140,142)]">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-[rgb(176,176,178)]">Example</div>
          <pre className="rounded-xl bg-[rgb(18,19,21)]/55 ring-1 ring-inset ring-[rgb(58,60,66)]/70 p-3 text-[12px] text-slate-100/90 overflow-auto">
coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id
bitcoin,buy,45000,0.01,0.5,2025-09-10T14:23:00Z,,
          </pre>
        </div>
      </div>
    </section>
  )
}
