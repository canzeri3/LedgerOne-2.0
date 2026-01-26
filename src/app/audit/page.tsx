'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

type LogRow = {
  id: string
  coingecko_id: string | null
  entity: 'buy_planner' | 'sell_planner' | 'sell_level' | 'trade' | 'system'
  action: string
  details: any
  created_at: string
}

const ENTITIES: Array<LogRow['entity']> = ['buy_planner', 'sell_planner', 'sell_level', 'trade', 'system']

function fmtTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function prettyEntity(e: LogRow['entity']) {
  switch (e) {
    case 'buy_planner':
      return 'Buy Planner'
    case 'sell_planner':
      return 'Sell Planner'
    case 'sell_level':
      return 'Sell Level'
    case 'trade':
      return 'Trade'
    case 'system':
      return 'System'
    default:
      return e
  }
}

/**
 * Ladder depth redaction mapping (exact):
 * 70 => "moderate"
 * 75 => "aggressive"
 * 90 => "conservative"
 */
function ladderDepthToLabel(v: any): string {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string'
        ? Number(v.trim())
        : NaN

  if (Number.isFinite(n)) {
    if (n === 70) return 'moderate'
    if (n === 75) return 'aggressive'
    if (n === 90) return 'conservative'
    return 'moderate'
  }

  if (typeof v === 'string' && v.trim()) return v.trim().toLowerCase()

  return 'moderate'
}

function sanitizeAuditDetails(input: any): any {
  if (input == null) return input
  if (Array.isArray(input)) return input.map(sanitizeAuditDetails)

  if (typeof input === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(input)) {
      if (k === 'ladder_depth' || k === 'ladderDepth' || k === 'ladder_depth_new' || k === 'ladder_depth_old') {
        out[k] = ladderDepthToLabel(v)
        continue
      }
      out[k] = sanitizeAuditDetails(v)
    }
    return out
  }

  return input
}

function summarizeDetails(details: any): string {
  if (!details || typeof details !== 'object') return '—'

  const preferredKeys = [
    'message',
    'reason',
    'note',
    'status',
    'from',
    'to',
    'level',
    'level_id',
    'trade_id',
    'planner_id',
    'coin',
    'symbol',
    'qty',
    'quantity',
    'price',
    'avg_price',
    'ladder_depth_new',
    'ladder_depth_old',
    'ladder_depth',
    'ladderDepth',
  ]

  for (const k of preferredKeys) {
    if ((details as any)[k] == null) continue
    const v = (details as any)[k]
    if (typeof v === 'string' && v.trim()) return `${k}: ${v}`
    if (typeof v === 'number' || typeof v === 'boolean') return `${k}: ${String(v)}`
  }

  const keys = Object.keys(details)
  if (keys.length === 0) return '—'
  const first = keys.slice(0, 3).map((k) => `${k}`)
  return first.length ? `fields: ${first.join(', ')}${keys.length > 3 ? '…' : ''}` : '—'
}

export default function AuditPage() {
  const { user } = useUser()

  const { data, error } = useSWR<LogRow[]>(
    user ? ['/audit', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('audit_logs')
        .select('id,coingecko_id,entity,action,details,created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      return (data ?? []) as LogRow[]
    }
  )

  const [q, setQ] = useState('')
  const [entity, setEntity] = useState<'all' | LogRow['entity']>('all')
  const [coin, setCoin] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const filtered = useMemo(() => {
    const rows = data ?? []
    const qq = q.trim().toLowerCase()
    const cc = coin.trim().toLowerCase()

    return rows.filter((r) => {
      if (entity !== 'all' && r.entity !== entity) return false

      if (cc) {
        const c = (r.coingecko_id ?? '').toLowerCase()
        if (!c.includes(cc)) return false
      }

      if (qq) {
        const safeDetails = sanitizeAuditDetails(r.details ?? {})
        const hay = `${r.action ?? ''} ${r.entity ?? ''} ${r.coingecko_id ?? ''} ${JSON.stringify(safeDetails)}`.toLowerCase()
        if (!hay.includes(qq)) return false
      }

      return true
    })
  }, [data, q, entity, coin])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = data?.length ?? 0
  const shown = filtered.length

  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-screen-2xl mx-auto space-y-6" data-audit-page>
      {/* Header (Planner/Dashboard pattern) */}
      <div className="space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[rgb(41,42,45)]/80 pb-3">
          <div className="min-w-0">
            <h1 className="text-[20px] md:text-[22px] font-semibold text-white/90 leading-tight">
              Audit Log
            </h1>
            <p className="mt-1 text-[13px] md:text-[14px] text-[rgb(163,163,164)]">
              A chronological record of actions and system events for your account.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[rgb(163,163,164)]">
              Showing <span className="text-slate-100 font-medium">{shown}</span> of{' '}
              <span className="text-slate-100 font-medium">{total}</span>
            </span>

            <span className="hidden sm:inline-flex items-center rounded-lg bg-transparent ring-1 ring-inset ring-[rgb(41,42,45)]/70 px-2 py-1 text-[11px] text-[rgb(163,163,164)]">
              Last 200 entries
            </span>
          </div>
        </div>
      </div>

      {/* Main card (more depth / appeal) */}
      <section className="rounded-2xl bg-[rgb(28,29,31)] ring-1 ring-inset ring-[rgb(41,42,45)]/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        {/* Controls (higher contrast + clearer grouping) */}
        <div className="p-4 md:p-5 border-b border-[rgb(41,42,45)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.00))]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-1">
              {/* Search */}
              <div className="relative w-full lg:max-w-[560px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[rgb(186,186,188)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search action, entity, coin, or details…"
                  className="w-full rounded-xl bg-[rgb(18,19,21)]/70 ring-1 ring-inset ring-[rgb(58,60,66)]/70 pl-10 pr-3 py-2.5 text-[14px] text-slate-100 placeholder:text-[rgb(150,150,152)] hover:bg-[rgb(18,19,21)]/85 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                />
              </div>

              {/* Entity filter */}
              <div className="flex items-center gap-2">
                <div className="text-[11px] uppercase tracking-wide text-[rgb(186,186,188)] whitespace-nowrap">
                  Entity
                </div>
                <select
                  value={entity}
                  onChange={(e) => setEntity(e.target.value as any)}
                  className="rounded-xl bg-[rgb(18,19,21)]/70 ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-3 py-2.5 text-[14px] text-slate-100 hover:bg-[rgb(18,19,21)]/85 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                  <option value="all">All</option>
                  {ENTITIES.map((e) => (
                    <option key={e} value={e}>
                      {prettyEntity(e)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Coin filter */}
              <div className="flex items-center gap-2">
                <div className="text-[11px] uppercase tracking-wide text-[rgb(186,186,188)] whitespace-nowrap">
                  Coin
                </div>
                <input
                  value={coin}
                  onChange={(e) => setCoin(e.target.value)}
                  placeholder="e.g., bitcoin"
                  className="w-full sm:w-[260px] rounded-xl bg-[rgb(18,19,21)]/70 ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-3 py-2.5 text-[14px] text-slate-100 placeholder:text-[rgb(150,150,152)] hover:bg-[rgb(18,19,21)]/85 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                />
              </div>
            </div>

            <div className="text-[12px] text-[rgb(163,163,164)]">
              Tip: search matches action, entity, coin, and JSON fields.
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-2 md:p-3">
          {error && (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-inset ring-rose-500/25 px-4 py-3 text-[13px] text-rose-200">
              Error loading logs.
            </div>
          )}

          {!data && !error && (
            <div className="rounded-md bg-[rgb(21,22,24)]/35 ring-1 ring-inset ring-[rgb(41,42,45)]/70 px-4 py-3 text-[13px] text-slate-200">
              Loading…
            </div>
          )}

          {data && filtered.length === 0 && (
            <div className="rounded-md bg-[rgb(21,22,24)]/35 ring-1 ring-inset ring-[rgb(41,42,45)]/70 px-4 py-6 text-[13px] text-slate-200">
              No matching audit entries.
              <div className="text-[12px] text-[rgb(120,120,121)] mt-1">
                Try clearing filters or adjusting search terms.
              </div>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="divide-y divide-[rgb(41,42,45)]/70">
              {filtered.map((row) => {
                const isOpen = expanded.has(row.id)
                const safeDetails = sanitizeAuditDetails(row.details ?? {})

                return (
                  <div
                    key={row.id}
                    className="px-3 py-3 md:px-4 md:py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.id)}
                        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(18,19,21)]/55 ring-1 ring-inset ring-[rgb(58,60,66)]/70 hover:bg-[rgb(18,19,21)]/80 focus:outline-none focus:ring-[rgb(136,128,213)]/70 focus:ring-2"
                        aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                        title={isOpen ? 'Collapse details' : 'Expand details'}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-100" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-100" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <div className="text-[12px] text-[rgb(176,176,178)] whitespace-nowrap">
                              {fmtTime(row.created_at)}
                            </div>

                            <span className="inline-flex items-center rounded-lg bg-[rgba(255,255,255,0.02)] ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-2 py-0.5 text-[12px] text-slate-100">
                              {prettyEntity(row.entity)}
                            </span>

                            {row.coingecko_id ? (
                              <span className="inline-flex items-center rounded-lg bg-[rgba(255,255,255,0.02)] ring-1 ring-inset ring-[rgb(58,60,66)]/70 px-2 py-0.5 text-[12px] text-slate-100">
                                {row.coingecko_id}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-lg bg-transparent ring-1 ring-inset ring-[rgb(58,60,66)]/50 px-2 py-0.5 text-[12px] text-[rgb(140,140,142)]">
                                — coin —
                              </span>
                            )}
                          </div>

                          <div className="text-[14px] text-slate-100 font-medium tracking-tight break-words">
                            {row.action}
                          </div>
                        </div>

                        <div className="mt-1 text-[12px] text-[rgb(176,176,178)] break-words">
                          {summarizeDetails(safeDetails)}
                        </div>

                        {isOpen && (
                          <div className="mt-3 rounded-xl bg-[rgb(18,19,21)]/55 ring-1 ring-inset ring-[rgb(58,60,66)]/70 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-[rgb(176,176,178)] mb-2">
                              Details (JSON)
                            </div>
                            <pre className="text-[12px] text-slate-100 whitespace-pre-wrap break-words max-h-[420px] overflow-auto">
                              {JSON.stringify(safeDetails ?? {}, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <p className="text-[12px] text-[rgb(120,120,121)]">
        Edits, freezes, and reassignment events are logged automatically. Only you can see your own logs (RLS owner-only).
      </p>
    </div>
  )
}
