'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Tier } from '@/lib/entitlements'

type AdminUserRow = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null

  billedTier: Tier
  billedStatus: string

  overrideTier: Tier | null
  overrideUpdatedAt: string | null

  effectiveTier: Tier
}

type UsersResponse = {
  page: number
  perPage: number
  total: number
  users: AdminUserRow[]
}

const ALL_TIERS: Tier[] = ['FREE', 'PLANNER', 'PORTFOLIO', 'DISCIPLINED', 'ADVISORY']
const DEFAULT_PER_PAGE = 200

type SortKey =
  | 'email_asc'
  | 'email_desc'
  | 'effective_tier_desc'
  | 'effective_tier_asc'
  | 'billed_tier_desc'
  | 'billed_tier_asc'
  | 'override_first'
  | 'override_last'

function tierRank(t: Tier | null | undefined) {
  // higher = “more access”
  switch (t) {
    case 'ADVISORY':
      return 4
    case 'DISCIPLINED':
      return 3
    case 'PORTFOLIO':
      return 2
    case 'PLANNER':
      return 1
    case 'FREE':
    default:
      return 0
  }
}

function safeEmail(v: string | null | undefined) {
  return (v ?? '').trim().toLowerCase()
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function pillClass(kind: 'muted' | 'good' | 'warn') {
  if (kind === 'good') return 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200'
  if (kind === 'warn') return 'border-amber-500/40 bg-amber-900/15 text-amber-200'
  return 'border-[rgb(58,59,63)] bg-[rgb(41,42,43)] text-slate-200'
}

function btnClass(disabled?: boolean) {
  return [
    'rounded-md border px-3 py-2 text-[12px]',
    'border-[rgb(58,59,63)] bg-[rgb(32,33,35)] text-slate-200',
    'hover:bg-[rgb(36,37,39)]',
    disabled ? 'opacity-50 cursor-not-allowed hover:bg-[rgb(32,33,35)]' : '',
  ].join(' ')
}

function primaryBtnClass(disabled?: boolean) {
  return [
    'rounded-md px-3 py-2 text-[12px] border',
    'border-amber-500/40 bg-amber-900/15 text-amber-200 hover:bg-amber-900/25',
    disabled ? 'opacity-60 cursor-not-allowed hover:bg-amber-900/15' : '',
  ].join(' ')
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function AdminUsersClient() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [query, setQuery] = useState('')
const [sortKey, setSortKey] = useState<SortKey>('email_asc')

  const [page, setPage] = useState(1)
  const [perPage] = useState(DEFAULT_PER_PAGE)
  const [total, setTotal] = useState(0)

  const [overrideTierByUser, setOverrideTierByUser] = useState<Record<string, Tier>>({})
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [copyMsgByUserId, setCopyMsgByUserId] = useState<Record<string, string>>({})

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const load = async (nextPage: number) => {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/users?page=${nextPage}&perPage=${perPage}`, {
        cache: 'no-store',
      })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load users')

      const payload = json as UsersResponse
      setRows(payload.users ?? [])
      setTotal(Number(payload.total ?? 0))
      setPage(Number(payload.page ?? nextPage))

      setOverrideTierByUser((prev) => {
        const next = { ...prev }
        for (const u of payload.users ?? []) {
          if (!next[u.id]) next[u.id] = (u.overrideTier ?? u.effectiveTier) as Tier
        }
        return next
      })
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

 const viewRows = useMemo(() => {
  const q = query.trim().toLowerCase()

  const base = !q
    ? rows
    : rows.filter((r) => {
        const email = (r.email ?? '').toLowerCase()
        return email.includes(q) || r.id.toLowerCase().includes(q)
      })

  const arr = [...base]

  arr.sort((a, b) => {
    switch (sortKey) {
      case 'email_asc': {
        const ae = safeEmail(a.email)
        const be = safeEmail(b.email)
        return ae.localeCompare(be)
      }
      case 'email_desc': {
        const ae = safeEmail(a.email)
        const be = safeEmail(b.email)
        return be.localeCompare(ae)
      }
      case 'effective_tier_desc':
        return tierRank(b.effectiveTier) - tierRank(a.effectiveTier)
      case 'effective_tier_asc':
        return tierRank(a.effectiveTier) - tierRank(b.effectiveTier)
      case 'billed_tier_desc':
        return tierRank(b.billedTier) - tierRank(a.billedTier)
      case 'billed_tier_asc':
        return tierRank(a.billedTier) - tierRank(b.billedTier)
      case 'override_first': {
        const ah = a.overrideTier ? 1 : 0
        const bh = b.overrideTier ? 1 : 0
        if (bh !== ah) return bh - ah
        // tie-breaker: email
        return safeEmail(a.email).localeCompare(safeEmail(b.email))
      }
      case 'override_last': {
        const ah = a.overrideTier ? 1 : 0
        const bh = b.overrideTier ? 1 : 0
        if (ah !== bh) return ah - bh
        return safeEmail(a.email).localeCompare(safeEmail(b.email))
      }
      default:
        return 0
    }
  })

  return arr
}, [rows, query, sortKey])


  const onSetOverride = async (userId: string) => {
    setSavingUserId(userId)
    setError(null)
    setMessage(null)

    try {
      const tier = overrideTierByUser[userId] ?? 'FREE'
      const res = await fetch('/api/admin/users/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier }),
      })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json?.error ?? 'Save failed')

      setMessage('Override saved. Reloading…')
      await load(page)
      setMessage('Override saved.')
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    } finally {
      setSavingUserId(null)
    }
  }

  const onClearOverride = async (userId: string) => {
    setSavingUserId(userId)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/users/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, clear: true }),
      })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json?.error ?? 'Clear failed')

      setMessage('Override cleared. Reloading…')
      await load(page)
      setMessage('Override cleared.')
    } catch (e: any) {
      setError(e?.message ?? 'Clear failed')
    } finally {
      setSavingUserId(null)
    }
  }

  const onCopyUserId = async (userId: string) => {
    const ok = await copyToClipboard(userId)
    setCopyMsgByUserId((prev) => ({
      ...prev,
      [userId]: ok ? 'Copied' : 'Copy failed',
    }))
    window.setTimeout(() => {
      setCopyMsgByUserId((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    }, 1200)
  }

  return (
    <div className="space-y-4">
      {/* Top guidance (compact) */}
      <div className="rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] px-4 py-3">
        <div className="text-[13px] text-slate-200 font-medium">Admin access overrides</div>
        <div className="mt-1 text-[12px] text-[rgb(163,163,164)] leading-relaxed">
          <div>
            <span className="text-slate-200">Billed</span> reflects what the billing system is charging.
            <span className="text-slate-200"> Override</span> only changes in-app access and does not change billing.
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-[12px] text-[rgb(163,163,164)]">
          Page <span className="text-slate-200">{page}</span> of{' '}
          <span className="text-slate-200">{Math.max(1, Math.ceil(total / perPage))}</span> — loaded{' '}
          <span className="text-slate-200">{rows.length}</span> users (total{' '}
          <span className="text-slate-200">{total}</span>).
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load(Math.max(1, page - 1))}
              disabled={loading || page <= 1}
              className={btnClass(loading || page <= 1)}
            >
              Prev
            </button>
            <button
              onClick={() => void load(Math.min(totalPages, page + 1))}
              disabled={loading || page >= totalPages}
              className={btnClass(loading || page >= totalPages)}
            >
              Next
            </button>
            <button onClick={() => void load(page)} className={btnClass(false)}>
              Reload
            </button>
          </div>

       <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
  <select
    value={sortKey}
    onChange={(e) => setSortKey(e.target.value as SortKey)}
    className="w-full sm:w-[220px] rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-3 py-2 text-[12px] text-slate-100 focus:outline-none"
  >
    <option value="email_asc">Name (Email) A → Z</option>
    <option value="email_desc">Name (Email) Z → A</option>
    <option value="effective_tier_desc">Effective Tier (High → Low)</option>
    <option value="effective_tier_asc">Effective Tier (Low → High)</option>
    <option value="billed_tier_desc">Billed Tier (High → Low)</option>
    <option value="billed_tier_asc">Billed Tier (Low → High)</option>
    <option value="override_first">Override: Yes first</option>
    <option value="override_last">Override: No first</option>
  </select>

  <input
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Search by email or user id (current page)"
    className="w-full sm:w-[360px] rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-3 py-2 text-[12px] text-slate-100 placeholder:text-[rgb(120,121,125)] focus:outline-none focus:ring-0 focus:border-transparent"
  />
</div>

        </div>
      </div>

      {loading && <div className="text-sm text-slate-400">Loading users…</div>}

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

      {/* Header row (no horizontal scrolling; labels wrap) */}
      {!loading && !error && rows.length > 0 && (
        <div className="rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] px-4 py-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 text-[11px] text-[rgb(163,163,164)]">
            <div className="lg:col-span-4">User</div>
            <div className="lg:col-span-2">Billed</div>
            <div className="lg:col-span-2">Override</div>
            <div className="lg:col-span-2">Effective</div>
            <div className="lg:col-span-2 lg:text-right">Actions</div>
          </div>
        </div>
      )}

      {!loading && !error && viewRows.length === 0 && (
        <div className="text-sm text-slate-400">
          {rows.length === 0 ? 'No users found.' : 'No users match that search.'}
        </div>
      )}

      {/* Rows (grid per row; wraps vertically; no overflow-x) */}
      {!loading && !error && viewRows.length > 0 && (
        <div className="rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]">
       {viewRows.map((u, idx) => {

            const isSaving = savingUserId === u.id
            const hasOverride = u.overrideTier != null

            const billedKind =
              u.billedStatus === 'active' || u.billedStatus === 'trialing'
                ? 'good'
                : u.billedStatus === 'past_due'
                  ? 'warn'
                  : 'muted'

            const effectiveKind = u.effectiveTier === 'FREE' ? 'muted' : 'good'

            return (
              <div
                key={u.id}
                className={[
                  'px-4 py-3',
                  idx === 0 ? '' : 'border-t border-[rgb(41,42,45)]/80',
                  'hover:bg-[rgb(33,34,36)]',
                ].join(' ')}
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
                  {/* User block (wrap-friendly) */}
                  <div className="lg:col-span-4 min-w-0">
                    <div className="text-[13px] text-slate-100 truncate">
                      {u.email ?? '—'}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-300 break-all">
                        {u.id}
                      </span>
                      <button
                        onClick={() => void onCopyUserId(u.id)}
                        className="rounded-md border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-2 py-1 text-[11px] text-slate-200 hover:bg-[rgb(36,37,39)]"
                      >
                        {copyMsgByUserId[u.id] ?? 'Copy'}
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-[rgb(140,140,144)]">
                      Created: <span className="text-slate-300">{fmtDate(u.created_at)}</span>
                      <span className="mx-2 text-[rgb(90,90,94)]">•</span>
                      Last: <span className="text-slate-300">{fmtDate(u.last_sign_in_at)}</span>
                    </div>
                  </div>

                  {/* Billed */}
                  <div className="lg:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-md border px-2 py-1 text-[11px] ${pillClass(billedKind)}`}>
                        {u.billedStatus}
                      </span>
                      <span className={`rounded-md border px-2 py-1 text-[11px] ${pillClass('muted')}`}>
                        {u.billedTier}
                      </span>
                    </div>
                  </div>

                  {/* Override */}
                  <div className="lg:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-md border px-2 py-1 text-[11px] ${
                          hasOverride ? pillClass('warn') : pillClass('muted')
                        }`}
                      >
                        {hasOverride ? u.overrideTier : '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[rgb(140,140,144)]">
                      {hasOverride ? fmtDate(u.overrideUpdatedAt) : 'No override'}
                    </div>
                  </div>

                  {/* Effective */}
                  <div className="lg:col-span-2">
                    <span className={`rounded-md border px-2 py-1 text-[11px] ${pillClass(effectiveKind)}`}>
                      {u.effectiveTier}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="lg:col-span-2 lg:text-right">
                    <div className="flex flex-col gap-2 lg:items-end">
                      <select
                        value={overrideTierByUser[u.id] ?? (u.overrideTier ?? u.effectiveTier)}
                        onChange={(e) =>
                          setOverrideTierByUser((prev) => ({
                            ...prev,
                            [u.id]: e.target.value as Tier,
                          }))
                        }
                        className="w-full lg:w-[170px] rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-3 py-2 text-[12px] text-slate-100 focus:outline-none"
                        disabled={isSaving}
                      >
                        {ALL_TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2 lg:justify-end">
                        <button
                          onClick={() => void onSetOverride(u.id)}
                          disabled={isSaving}
                          className={primaryBtnClass(isSaving)}
                        >
                          {isSaving ? 'Saving…' : 'Set'}
                        </button>

                        <button
                          onClick={() => void onClearOverride(u.id)}
                          disabled={isSaving || !hasOverride}
                          className={btnClass(isSaving || !hasOverride)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
