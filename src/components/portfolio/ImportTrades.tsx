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
    <div className="space-y-5">
      {/* Upload row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="csv-label">CSV file</div>
          <div className="csv-hint">
            Required <code>coingecko_id, side, price, quantity, trade_time</code>
          </div>
          <div className="csv-hint">
            Optional <code>fee, buy_planner_id, sell_planner_id</code>
          </div>
          <div className="csv-hint">
            Monetary fields <code>price</code> and <code>fee</code> are interpreted as USD.
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onPick}
          disabled={!user || busy}
          className="csv-file"
        />
      </div>

      <div className="csv-divider" />

      {/* Console */}
      <div>
        <div className="csv-block-h">Console</div>
        <pre className="csv-mono csv-console">{log || '—'}</pre>
      </div>

      {/* Example */}
      <div>
        <div className="csv-block-h">Example</div>
        <pre className="csv-mono">{`coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id
bitcoin,buy,45000,0.01,0.5,2025-09-10T14:23:00Z,,`}</pre>
      </div>
    </div>
  )
}
