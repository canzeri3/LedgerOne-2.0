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
  const label = d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return label
}

function summarizeDetails(details: any): string {
  if (!details || typeof details !== 'object') return '—'

  // Prefer common keys if present (keeps it readable)
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
  ]

  for (const k of preferredKeys) {
    if (details[k] == null) continue
    const v = details[k]
    if (typeof v === 'string' && v.trim()) return `${k}: ${v}`
    if (typeof v === 'number' || typeof v === 'boolean') return `${k}: ${String(v)}`
  }

  // Otherwise show a compact set of first keys
  const keys = Object.keys(details)
  if (keys.length === 0) return '—'
  const first = keys.slice(0, 3).map((k) => `${k}`)
  return first.length ? `fields: ${first.join(', ')}${keys.length > 3 ? '…' : ''}` : '—'
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

  // UI state
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
        const hay = `${r.action ?? ''} ${r.entity ?? ''} ${r.coingecko_id ?? ''} ${JSON.stringify(r.details ?? {})}`.toLowerCase()
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
<div className="relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto">
  <div className="space-y-6 rounded-3xl border border-slate-800/40 bg-slate-950/30 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-slate-400">
          A chronological record of actions and system events for your account.
        </p>
      </div> 
</div>


      {/* Controls */}
<div className="rounded-2xl border border-slate-700/40 bg-slate-950/40 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
        <div className="p-4 border-b border-slate-700/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-1">
              {/* Search */}
              <div className="relative md:max-w-[520px] w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search action, entity, coin, or details…"
                  className="w-full rounded-xl border border-slate-700/50 bg-slate-950/40 pl-10 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-500/30"
                />
              </div>

              {/* Entity filter */}
              <div className="flex gap-2 items-center">
                <div className="text-xs text-slate-400 whitespace-nowrap">Entity</div>
                <select
                  value={entity}
                  onChange={(e) => setEntity(e.target.value as any)}
                  className="rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500/30"
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
              <div className="flex gap-2 items-center">
                <div className="text-xs text-slate-400 whitespace-nowrap">Coin</div>
                <input
                  value={coin}
                  onChange={(e) => setCoin(e.target.value)}
                  placeholder="e.g., bitcoin"
                  className="w-[220px] rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-500/30"
                />
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Showing <span className="text-slate-200 font-medium">{shown}</span> of{' '}
              <span className="text-slate-200 font-medium">{total}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-2 md:p-3">
          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              Error loading logs.
            </div>
          )}

          {!data && !error && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3 text-sm text-slate-300">
              Loading…
            </div>
          )}

          {data && filtered.length === 0 && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-6 text-sm text-slate-300">
              No matching audit entries.
              <div className="text-xs text-slate-500 mt-1">Try clearing filters or adjusting search terms.</div>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="divide-y divide-slate-700/40">
              {filtered.map((row) => {
                const isOpen = expanded.has(row.id)
                return (
                  <div key={row.id} className="px-3 py-3 md:px-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.id)}
className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/40 bg-slate-900/30 hover:bg-slate-900/45"
                        aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                        title={isOpen ? 'Collapse details' : 'Expand details'}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-200" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-200" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-xs text-slate-400">{fmtTime(row.created_at)}</div>

                            <span className="rounded-lg border border-slate-700/50 bg-slate-800/20 px-2 py-0.5 text-xs text-slate-200">
                              {prettyEntity(row.entity)}
                            </span>

                            {row.coingecko_id ? (
                              <span className="rounded-lg border border-slate-700/50 bg-slate-800/20 px-2 py-0.5 text-xs text-slate-200">
                                {row.coingecko_id}
                              </span>
                            ) : (
                              <span className="rounded-lg border border-slate-700/50 bg-slate-800/10 px-2 py-0.5 text-xs text-slate-400">
                                — coin —
                              </span>
                            )}
                          </div>

                          <div className="text-sm text-slate-100 font-medium tracking-tight">{row.action}</div>
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                          {summarizeDetails(row.details)}
                        </div>

                        {isOpen && (
                          <div className="mt-3 rounded-xl border border-slate-700/40 bg-slate-950/40 p-3">
                            <div className="text-[11px] text-slate-400 mb-2">Details (JSON)</div>
                            <pre className="text-xs text-slate-200 whitespace-pre-wrap break-words max-h-[420px] overflow-auto">
                              {JSON.stringify(row.details ?? {}, null, 2)}
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
      </div>

      <p className="text-xs text-slate-500">
        Edits, freezes, and reassignment events are logged automatically. Only you can see your own logs (RLS owner-only).
      </p>
    </div>
  )
}
