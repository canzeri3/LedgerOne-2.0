'use client'

import useSWR from 'swr'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Search } from 'lucide-react'
import './audit-skin.css'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { restoreSellPlannerFromAudit } from '@/lib/plannerAuditClient'
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
const AUDIT_PAGE_SIZE = 40

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
    if (typeof v === 'string' && v.trim()) return `${labelize(k)}: ${v}`
    if (typeof v === 'number' || typeof v === 'boolean') return `${labelize(k)}: ${String(v)}`
  }

  const keys = Object.keys(details)
  if (keys.length === 0) return '—'
  const first = keys.slice(0, 3).map(labelize)
  return first.length ? `Fields: ${first.join(', ')}${keys.length > 3 ? '…' : ''}` : '—'
}

type RestoreTarget = {
  entity: 'buy_planner' | 'sell_planner'
  plannerId: string
  coinId: string | null
}

function getRestoreTarget(row: LogRow): RestoreTarget | null {
  if (row.entity !== 'buy_planner' && row.entity !== 'sell_planner') return null

  const action = (row.action ?? '').trim().toLowerCase()
  const looksDeleted = [
    'delete',
    'deleted',
    'remove',
    'removed',
    'deactivate',
    'deactivated',
    'archive',
    'archived',
  ].some((token) => action.includes(token))

  if (!looksDeleted) return null

  const details = row.details && typeof row.details === 'object' ? row.details : {}

  const plannerId =
    typeof (details as any).planner_id === 'string'
      ? (details as any).planner_id
      : typeof (details as any).plannerId === 'string'
        ? (details as any).plannerId
        : typeof (details as any).buy_planner_id === 'string'
          ? (details as any).buy_planner_id
          : typeof (details as any).buyPlannerId === 'string'
            ? (details as any).buyPlannerId
            : typeof (details as any).sell_planner_id === 'string'
              ? (details as any).sell_planner_id
              : typeof (details as any).sellPlannerId === 'string'
                ? (details as any).sellPlannerId
                : typeof (details as any).id === 'string'
                  ? (details as any).id
                  : null

  if (!plannerId) return null

  const coinId =
    row.coingecko_id ??
    (typeof (details as any).coingecko_id === 'string'
      ? (details as any).coingecko_id
      : typeof (details as any).coinId === 'string'
        ? (details as any).coinId
        : null)

  return {
    entity: row.entity,
    plannerId,
    coinId,
  }
}
function canRestoreFromAudit(row: LogRow): boolean {
  if (row.action !== 'deleted') return false
  if (row.entity !== 'sell_planner') return false

  const details = row.details ?? {}
  const snapshot = details?.snapshot ?? {}
  const planner = snapshot?.planner ?? {}

  return !!details?.undo_available && !details?.restored_at && !!planner?.id
}

/* ── presentational helpers (skin only) ─────────────────────── */

/** Map a free-form action string to a badge tone class. */
function badgeCls(action: string): string {
  const a = (action || '').toLowerCase()
  if (a.includes('restor')) return 'restored'
  if (a.includes('delet') || a.includes('remov') || a.includes('archiv')) return 'deleted'
  if (a.includes('creat') || a.includes('rotat') || a.includes('insert') || a.includes('new')) return 'created'
  if (a.includes('deactiv') || a.includes('paus') || a.includes('freez') || a.includes('froz')) return 'paused'
  if (a.includes('activ')) return 'activated'
  if (a.includes('edit') || a.includes('updat') || a.includes('chang')) return 'edited'
  return ''
}

/** Local-midnight key for grouping rows by day. */
function dayKeyOf(ts: string): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayHeading(ts: string): string {
  const d = new Date(ts)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((t0.getTime() - day.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** snake_case / camelCase key → readable label. */
function labelize(k: string): string {
  const s = k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Render one detail value: primitives plain, objects as compact text. */
function detailValue(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v || '—'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    const s = JSON.stringify(v)
    return s.length > 220 ? s.slice(0, 220) + '…' : s
  } catch {
    return String(v)
  }
}

export default function AuditPage() {
  const { user } = useUser()

  const { data, error, mutate } = useSWR<LogRow[]>(
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
  const [visibleCount, setVisibleCount] = useState(AUDIT_PAGE_SIZE)
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)
  const [restoreErr, setRestoreErr] = useState<string | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  const restoreDialogRef = useRef<HTMLDivElement | null>(null)
  const restoreCancelRef = useRef<HTMLButtonElement | null>(null)
  const restoreTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setPortalReady(true)
  }, [])

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

  useEffect(() => {
    setVisibleCount(AUDIT_PAGE_SIZE)
    setExpanded(new Set())
    setPendingRestoreId(null)
  }, [q, entity, coin])

  useEffect(() => {
    if (!pendingRestoreId) return

    const trigger = restoreTriggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => restoreCancelRef.current?.focus(), 0)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.setTimeout(() => trigger?.focus(), 0)
    }
  }, [pendingRestoreId])

  useEffect(() => {
    if (!pendingRestoreId) return

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (restoringId === pendingRestoreId) return
        event.preventDefault()
        setPendingRestoreId(null)
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(
        restoreDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown)
    return () => document.removeEventListener('keydown', handleDialogKeyDown)
  }, [pendingRestoreId, restoringId])

  const visibleFiltered = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  )

  const pendingRestoreRow = useMemo(
    () => (data ?? []).find((row) => row.id === pendingRestoreId) ?? null,
    [data, pendingRestoreId]
  )

  // Visual-only grouping: by local day, preserving order (newest first)
  const groups = useMemo(() => {
    const out: Array<{ key: string; heading: string; items: LogRow[] }> = []
    for (const r of visibleFiltered) {
      const key = dayKeyOf(r.created_at)
      let g = out.find((x) => x.key === key)
      if (!g) {
        g = { key, heading: dayHeading(r.created_at), items: [] }
        out.push(g)
      }
      g.items.push(r)
    }
    return out
  }, [visibleFiltered])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearFilters = () => {
    setQ('')
    setEntity('all')
    setCoin('')
  }

  const restorePlannerFromLog = async (row: LogRow) => {
    if (!user) {
      setRestoreErr('Not signed in.')
      return
    }

    const target = getRestoreTarget(row)
    if (!target) return

    const table =
      target.entity === 'buy_planner' ? 'buy_planners' : 'sell_planners'

    setRestoreErr(null)
    setRestoreMsg(null)
    setRestoringId(row.id)

    try {
      const { data: plannerRow, error: plannerError } = await supabaseBrowser
        .from(table)
        .select('id,coingecko_id,is_active')
        .eq('id', target.plannerId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (plannerError) throw plannerError

      if (!plannerRow) {
        throw new Error(
          'Planner could not be found. It may already have been permanently removed.'
        )
      }

      const plannerCoinId = plannerRow.coingecko_id ?? target.coinId

      if (plannerRow.is_active) {
        setRestoreMsg('This planner is already active.')
        return
      }

      if (plannerCoinId) {
        const { data: conflictingActive, error: conflictError } = await supabaseBrowser
          .from(table)
          .select('id')
          .eq('user_id', user.id)
          .eq('coingecko_id', plannerCoinId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()

        if (conflictError && (conflictError as any).code !== 'PGRST116') {
          throw conflictError
        }

        if (conflictingActive?.id && conflictingActive.id !== target.plannerId) {
          throw new Error(
            'Delete the current active planner for this coin before restoring this version.'
          )
        }
      }

      const { error: restoreError } = await supabaseBrowser
        .from(table)
        .update({ is_active: true })
        .eq('id', target.plannerId)
        .eq('user_id', user.id)

      if (restoreError) throw restoreError

      setRestoreMsg(
        `${target.entity === 'buy_planner' ? 'Buy' : 'Sell'} planner restored.`
      )

      await mutate()

      if (typeof window !== 'undefined' && plannerCoinId) {
        window.dispatchEvent(
          new CustomEvent(
            target.entity === 'buy_planner'
              ? 'buyPlannerUpdated'
              : 'sellPlannerUpdated',
            { detail: { coinId: plannerCoinId } }
          )
        )
      }
    } catch (e: any) {
      setRestoreErr(e?.message ?? 'Restore failed.')
    } finally {
      setRestoringId(null)
    }
  }

  const restoreSellSnapshotFromLog = async (row: LogRow) => {
    if (!user) {
      setRestoreErr('Not signed in.')
      return
    }

    setRestoreErr(null)
    setRestoreMsg(null)
    setRestoringId(row.id)

    try {
      await restoreSellPlannerFromAudit(row.id)
      setRestoreMsg('Sell planner restored.')
      await mutate()

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sellPlannerUpdated', {
            detail: { coinId: row.coingecko_id },
          })
        )
      }
    } catch (e: any) {
      setRestoreErr(e?.message ?? 'Restore failed.')
    } finally {
      setRestoringId(null)
    }
  }

  const confirmRestore = async () => {
    if (!pendingRestoreRow || restoringId) return

    const target = getRestoreTarget(pendingRestoreRow)
    if (target) await restorePlannerFromLog(pendingRestoreRow)
    else await restoreSellSnapshotFromLog(pendingRestoreRow)

    setPendingRestoreId(null)
  }

  const restoreStatus: { type: 'success' | 'error'; text: string } | null =
    restoreMsg ? { type: 'success', text: restoreMsg } :
    restoreErr ? { type: 'error', text: restoreErr } :
    null

  const total = data?.length ?? 0

  const shown = visibleFiltered.length
  const matching = filtered.length
  const remaining = Math.max(0, matching - shown)
  const activeFilterCount = Number(Boolean(q.trim())) + Number(entity !== 'all') + Number(Boolean(coin.trim()))
  const hasActiveFilters = activeFilterCount > 0

  return (
    <div className="au px-3 sm:px-4 md:px-8 lg:px-10 py-5 md:py-8 max-w-screen-2xl mx-auto" data-audit-page>
      {/* Page head */}
      <div className="au-head">
        <div className="min-w-0">
          <h1>Audit Log</h1>
          <div className="sub">
            A chronological record of every change you have made to your planners.
          </div>
        </div>

        <div className="au-head-meta">
          <span className="au-count">
            Showing <b>{shown}</b> of <b>{matching}</b>
            {matching !== total ? ' matches' : ''}
          </span>
          <span className="au-pill">Last 200 entries</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="au-toolbar">
        <label className="au-search">
          <Search className="h-4 w-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by action, planner, or coin…"
            aria-label="Search audit activity"
            autoComplete="off"
          />
        </label>

        <div className="au-tb-group" role="group" aria-label="Filter by entity">
          <span className="au-tb-label">Entity</span>
          <div className="seg">
            <button
              type="button"
              className={entity === 'all' ? 'cur accent' : ''}
              onClick={() => setEntity('all')}
              aria-pressed={entity === 'all'}
            >
              All
            </button>
            {ENTITIES.map((e) => (
              <button
                key={e}
                type="button"
                className={entity === e ? 'cur accent' : ''}
                onClick={() => setEntity(e)}
                aria-pressed={entity === e}
              >
                {prettyEntity(e).replace(' Planner', '').replace('Sell Level', 'Levels')}
              </button>
            ))}
          </div>
        </div>

        <div className="au-tb-group">
          <span className="au-tb-label">Coin</span>
          <label className="au-search sm">
            <input
              value={coin}
              onChange={(e) => setCoin(e.target.value)}
              placeholder="e.g., bitcoin"
              aria-label="Filter by coin"
              autoComplete="off"
            />
          </label>
        </div>

        {hasActiveFilters ? (
          <button type="button" className="au-clear" onClick={clearFilters}>
            Clear filters
            <span aria-label={`${activeFilterCount} active filters`}>{activeFilterCount}</span>
          </button>
        ) : null}
      </div>

      {/* Status notes */}
      {error && <div className="au-note err">Error loading logs.</div>}
      {restoreStatus && (
        <div
          className={restoreStatus.type === 'success' ? 'au-note ok' : 'au-note err'}
          role={restoreStatus.type === 'error' ? 'alert' : 'status'}
        >
          <span>{restoreStatus.text}</span>
          <button
            type="button"
            onClick={() => {
              setRestoreMsg(null)
              setRestoreErr(null)
            }}
            aria-label="Dismiss restore message"
          >
            Dismiss
          </button>
        </div>
      )}
      {!data && !error && <div className="au-note plain" role="status">Loading activity…</div>}

      {data && filtered.length === 0 && (
        <div className="au-empty">
          <p>No matching activity. Try a different search or filter.</p>
          {hasActiveFilters ? (
            <button type="button" className="au-clear-empty" onClick={clearFilters}>
              Clear all filters
            </button>
          ) : null}
        </div>
      )}

      {/* Day groups */}
      {groups.map((g) => (
        <div className="au-group" key={g.key}>
          <div className="au-group-h">
            <span className="d">{g.heading}</span>
            <span className="c">
              {g.items.length} {g.items.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          <div className="au-card">
            {g.items.map((row) => {
              const isOpen = expanded.has(row.id)
              const safeDetails = sanitizeAuditDetails(row.details ?? {})
              const restoreTarget = getRestoreTarget(row)
              const canRestore = Boolean(restoreTarget) || canRestoreFromAudit(row)
              const detailEntries =
                safeDetails && typeof safeDetails === 'object' && !Array.isArray(safeDetails)
                  ? Object.entries(safeDetails)
                  : []
              const hasDetail = detailEntries.length > 0

              return (
                <div
                  key={row.id}
                  className={`au-row${isOpen ? ' open' : ''}${hasDetail ? '' : ' au-noexp'}`}
                  onClick={hasDetail ? () => toggleExpanded(row.id) : undefined}
                >
                  {hasDetail ? (
                    <button
                      type="button"
                      className="au-tog"
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${labelize(row.action)} ${prettyEntity(row.entity)} details`}
                      aria-expanded={isOpen}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleExpanded(row.id)
                      }}
                    >
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="au-tog" aria-hidden="true" />
                  )}

                  <time className="au-time" dateTime={row.created_at} title={fmtTime(row.created_at)}>
                    {timeOf(row.created_at)}
                  </time>

                  <div className="au-main">
                    <div className="au-line">
                      <span className="au-action">{labelize(row.action)}</span>
                      <span className="au-chip">{prettyEntity(row.entity)}</span>
                      {row.coingecko_id ? (
                        <span className="au-chip">
                          <span className="tk">{row.coingecko_id}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="au-summary">{summarizeDetails(safeDetails)}</div>

                    {isOpen && hasDetail && (
                      <div className="au-detail" onClick={(ev) => ev.stopPropagation()}>
                        <div className="au-detail-h">What changed</div>
                        <div className="au-changes">
                          {detailEntries.map(([k, v]) => (
                            <Fragment key={k}>
                              <div className="au-ch-label">{labelize(k)}</div>
                              <div className="au-ch-value">{detailValue(v)}</div>
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="au-right" onClick={(ev) => ev.stopPropagation()}>
                    {canRestore ? (
                      <button
                        type="button"
                        className="au-restore"
                        ref={pendingRestoreId === row.id ? restoreTriggerRef : undefined}
                        aria-haspopup="dialog"
                        aria-expanded={pendingRestoreId === row.id}
                        onClick={(event) => {
                          restoreTriggerRef.current = event.currentTarget
                          setRestoreMsg(null)
                          setRestoreErr(null)
                          setPendingRestoreId(row.id)
                        }}
                        disabled={restoringId === row.id}
                      >
                        {restoringId === row.id ? 'Restoring…' : 'Restore'}
                      </button>
                    ) : null}

                    <span className={`au-badge ${badgeCls(row.action)}`}>
                      <span className="bd" aria-hidden="true" />
                      {badgeCls(row.action) || 'event'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {remaining > 0 ? (
        <div className="au-more-wrap">
          <button
            type="button"
            className="au-more"
            onClick={() => setVisibleCount((count) => count + AUDIT_PAGE_SIZE)}
          >
            Show {Math.min(AUDIT_PAGE_SIZE, remaining)} more
          </button>
          <span>{remaining} entries remaining</span>
        </div>
      ) : null}

      <p className="mt-4 text-[12px] text-[rgb(120,120,121)]">
        Edits, freezes, deletes, and restoration events are logged automatically. Only you can see your own logs (RLS owner-only).
      </p>

      {portalReady && pendingRestoreRow
        ? createPortal(
            <div
              className="au au-restore-layer"
              data-restore-confirm-backdrop
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (restoringId === pendingRestoreRow.id) return
                setPendingRestoreId(null)
              }}
            >
              <div
                ref={restoreDialogRef}
                className="au-restore-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="restore-dialog-title"
                aria-describedby="restore-dialog-description"
                aria-busy={restoringId === pendingRestoreRow.id}
              >
                <div className="au-restore-dialog-eyebrow">Confirm restoration</div>
                <h2 id="restore-dialog-title">Restore this planner?</h2>
                <p id="restore-dialog-description">
                  This will reactivate the deleted planner and return it to your active planners.
                </p>

                <dl className="au-restore-summary">
                  <div>
                    <dt>Planner</dt>
                    <dd>{prettyEntity(pendingRestoreRow.entity)}</dd>
                  </div>
                  <div>
                    <dt>Coin</dt>
                    <dd>{pendingRestoreRow.coingecko_id ?? 'Not specified'}</dd>
                  </div>
                  <div>
                    <dt>Deleted</dt>
                    <dd>{fmtTime(pendingRestoreRow.created_at)}</dd>
                  </div>
                </dl>

                <p className="au-restore-dialog-note">
                  If another planner for this coin is already active, restoration will be safely blocked.
                </p>

                <div className="au-restore-dialog-actions">
                  <button
                    ref={restoreCancelRef}
                    type="button"
                    className="cancel"
                    onClick={() => setPendingRestoreId(null)}
                    disabled={restoringId === pendingRestoreRow.id}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="confirm"
                    onClick={() => void confirmRestore()}
                    disabled={restoringId === pendingRestoreRow.id}
                  >
                    {restoringId === pendingRestoreRow.id ? 'Restoring…' : 'Restore planner'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
