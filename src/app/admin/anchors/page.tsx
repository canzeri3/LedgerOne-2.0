'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'

type AnchorRowDb = {
  coingecko_id: string
  anchor_top_price: number | null
  pump_threshold_multiple: number | null
  force_manual_anchor: boolean | null
}

type AnchorRowUi = {
  coingecko_id: string
  anchor_top_price: string // text input; '' => null
  pump_threshold_multiple: string // text input; '' => default 1.5
  force_manual_anchor: boolean
  dirty?: boolean
}

const DEFAULT_PUMP = 1.5

function parseNumberOrNull(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return n
}

export default function AdminAnchorsPage() {
  const [rows, setRows] = useState<AnchorRowUi[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setMessage(null)
      try {
        const { data, error } = await supabaseBrowser
          .from('coin_anchors')
          .select(
            'coingecko_id,anchor_top_price,pump_threshold_multiple,force_manual_anchor'
          )
          .order('coingecko_id', { ascending: true })

        if (error) throw error
        if (cancelled) return

        const mapped: AnchorRowUi[] = (data as AnchorRowDb[]).map((row) => ({
          coingecko_id: row.coingecko_id,
          anchor_top_price:
            row.anchor_top_price == null ? '' : String(row.anchor_top_price),
          pump_threshold_multiple:
            row.pump_threshold_multiple == null
              ? String(DEFAULT_PUMP)
              : String(row.pump_threshold_multiple),
          force_manual_anchor: !!row.force_manual_anchor,
          dirty: false,
        }))

        setRows(mapped)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load coin_anchors.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const markDirty = (id: string, updater: (r: AnchorRowUi) => AnchorRowUi) => {
    setRows((prev) =>
      prev.map((r) =>
        r.coingecko_id === id ? { ...updater(r), dirty: true } : r
      )
    )
  }

  const onChangeAnchor = (id: string, value: string) => {
    markDirty(id, (r) => ({ ...r, anchor_top_price: value }))
  }

  const onChangePumpMultiple = (id: string, value: string) => {
    markDirty(id, (r) => ({ ...r, pump_threshold_multiple: value }))
  }

  const onToggleForceManual = (id: string) => {
    markDirty(id, (r) => ({
      ...r,
      force_manual_anchor: !r.force_manual_anchor,
    }))
  }

  const onSaveRow = async (row: AnchorRowUi) => {
    setError(null)
    setMessage(null)

    // Pump multiple validation
    const pumpNum =
      parseNumberOrNull(row.pump_threshold_multiple) ?? DEFAULT_PUMP
    if (!Number.isFinite(pumpNum) || pumpNum <= 1.0) {
      setError(
        `Pump multiple for ${row.coingecko_id} must be > 1.0 (e.g. 1.5 or 1.7).`
      )
      return
    }

    // Admin top price (nullable)
    const anchorNum = parseNumberOrNull(row.anchor_top_price)

    // NEW: If Manual is forced, require a valid positive admin top
    if (row.force_manual_anchor) {
      if (!Number.isFinite(anchorNum as number) || (anchorNum as number) <= 0) {
        setError(
          `To force manual mode for ${row.coingecko_id}, you must set a positive Admin top (USD).`
        )
        return
      }
    }

    setSavingId(row.coingecko_id)
    try {
      const { error } = await supabaseBrowser
        .from('coin_anchors')
        .update({
          anchor_top_price: anchorNum,
          pump_threshold_multiple: pumpNum,
          force_manual_anchor: row.force_manual_anchor,
        })
        .eq('coingecko_id', row.coingecko_id)

      if (error) throw error

      setRows((prev) =>
        prev.map((r) =>
          r.coingecko_id === row.coingecko_id ? { ...r, dirty: false } : r
        )
      )
      setMessage(`Saved settings for ${row.coingecko_id}.`)
    } catch (e: any) {
      setError(e?.message ?? `Failed to save ${row.coingecko_id}.`)
    } finally {
      setSavingId(null)
    }
  }


  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-5xl mx-auto space-y-6">
      <header className="border-b border-[rgb(41,42,45)]/80 pb-4">
        <h1 className="text-[20px] md:text-[22px] font-semibold text-white/90">
          Price Cycle Anchors
        </h1>
        <p className="mt-1 text-[13px] md:text-[14px] text-[rgb(163,163,164)] max-w-2xl">
          Configure per-asset pump thresholds and manual top prices used by the
          price-cycle engine. Auto uses historical 50–70% pumps; manual anchors
          act as fallbacks, and you can force manual when needed.
        </p>
      </header>

      {loading && (
        <div className="text-sm text-slate-400">Loading anchors…</div>
      )}

      {!loading && error && (
        <div className="rounded-md border border-red-500/60 bg-red-900/20 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && message && !error && (
        <div className="rounded-md border border-emerald-500/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
          {message}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-slate-400">
          No coin_anchors rows found. Seed the table, then reload this page.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]">
          <table className="min-w-full text-left text-[12px] md:text-[13px] text-slate-200">
            <thead className="bg-[rgb(32,33,35)] text-[rgb(163,163,164)]">
              <tr>
                <th className="px-3 py-2 font-medium">Asset (coingecko_id)</th>
                <th className="px-3 py-2 font-medium">Pump threshold (×)</th>
                <th className="px-3 py-2 font-medium">Admin top (USD)</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSaving = savingId === row.coingecko_id
                const dirty = !!row.dirty
                return (
                  <tr
                    key={row.coingecko_id}
                    className="border-t border-[rgb(41,42,45)]/80 hover:bg-[rgb(33,34,36)]"
                  >
                    <td className="px-3 py-2 align-middle">
                      <span className="font-mono text-[12px]">
                        {row.coingecko_id}
                      </span>
                    </td>

                    {/* Pump threshold multiple */}
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-24 rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-2 py-1 text-[12px] text-slate-100 placeholder:text-[rgb(120,121,125)] focus:outline-none focus:ring-0 focus:border-transparent"
                        placeholder={String(DEFAULT_PUMP)}
                        value={row.pump_threshold_multiple}
                        onChange={(e) =>
                          onChangePumpMultiple(
                            row.coingecko_id,
                            e.target.value
                          )
                        }
                        disabled={isSaving}
                      />
                    </td>

                    {/* Admin top price (USD) */}
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-28 rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-2 py-1 text-[12px] text-slate-100 placeholder:text-[rgb(120,121,125)] focus:outline-none focus:ring-0 focus:border-transparent"
                        placeholder="(auto only)"
                        value={row.anchor_top_price}
                        onChange={(e) =>
                          onChangeAnchor(row.coingecko_id, e.target.value)
                        }
                        disabled={isSaving}
                      />
                      <div className="mt-1 text-[11px] text-[rgb(140,140,144)]">
                        If blank to rely on auto pump unless forced.
                      </div>
                    </td>

                    {/* Mode toggle */}
                    <td className="px-3 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => onToggleForceManual(row.coingecko_id)}
                        disabled={isSaving}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border ${
                          row.force_manual_anchor
                            ? 'border-amber-400/70 bg-amber-500/10 text-amber-100'
                            : 'border-[rgb(70,71,75)] bg-[rgb(34,35,37)] text-slate-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 rounded-full ${
                            row.force_manual_anchor
                              ? 'bg-amber-400'
                              : 'bg-[rgb(90,91,95)]'
                          }`}
                        />
                        <span>
                          {row.force_manual_anchor ? 'Manual (forced)' : 'Auto'}
                        </span>
                      </button>
                      <div className="mt-1 text-[11px] text-[rgb(140,140,144)] max-w-[180px]">
                        Uses the admin top price
                        
                      </div>
                    </td>

                    {/* Save action */}
                    <td className="px-3 py-2 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => onSaveRow(row)}
                        disabled={isSaving || !dirty}
                        className={`inline-flex items-center rounded-md px-3 py-1.5 text-[12px] font-medium border ${
                          isSaving
                            ? 'border-[rgb(80,81,85)] bg-[rgb(45,46,49)] text-slate-300'
                            : dirty
                            ? 'border-[rgb(109,93,186)] bg-[rgb(43,39,64)] text-[rgb(219,217,255)] hover:bg-[rgb(51,46,78)]'
                            : 'border-[rgb(70,71,75)] bg-[rgb(34,35,37)] text-slate-300'
                        }`}
                      >
                        {isSaving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
