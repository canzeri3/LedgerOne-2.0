'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Tier } from '@/lib/entitlements'

type AdminUserRow = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null
  tier: Tier
  status: string
  effectiveTier: Tier
}

type UsersResponse = {
  page: number
  perPage: number
  total: number
  users: AdminUserRow[]
}

const GRANTABLE: Tier[] = ['PLANNER', 'PORTFOLIO', 'DISCIPLINED', 'ADVISORY']
const DEFAULT_PER_PAGE = 200

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function AdminUsersClient() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [query, setQuery] = useState('')

  const [page, setPage] = useState(1)
  const [perPage] = useState(DEFAULT_PER_PAGE)
  const [total, setTotal] = useState(0)

  const [grantTierByUser, setGrantTierByUser] = useState<Record<string, Tier>>(
    {}
  )
  const [savingUserId, setSavingUserId] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const load = async (nextPage: number) => {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(
        `/api/admin/users?page=${nextPage}&perPage=${perPage}`,
        { cache: 'no-store' }
      )
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load users')

      const payload = json as UsersResponse
      setRows(payload.users ?? [])
      setTotal(Number(payload.total ?? 0))
      setPage(Number(payload.page ?? nextPage))

      // Initialize default selection per visible user.
      setGrantTierByUser((prev) => {
        const next = { ...prev }
        for (const u of payload.users ?? []) {
          if (!next[u.id]) next[u.id] = 'PLANNER'
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const email = (r.email ?? '').toLowerCase()
      return email.includes(q) || r.id.toLowerCase().includes(q)
    })
  }, [rows, query])

  const onGrant = async (userId: string) => {
    setSavingUserId(userId)
    setError(null)
    setMessage(null)

    try {
      const tier = grantTierByUser[userId] ?? 'PLANNER'

      const res = await fetch('/api/admin/users/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier }),
      })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json?.error ?? 'Grant failed')

      setMessage('Access granted. Reloading…')
      await load(page)
      setMessage('Access granted.')
    } catch (e: any) {
      setError(e?.message ?? 'Grant failed')
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-[12px] text-[rgb(163,163,164)]">
          Page <span className="text-slate-200">{page}</span> of{' '}
          <span className="text-slate-200">{totalPages}</span> — loaded{' '}
          <span className="text-slate-200">{rows.length}</span> users (total{' '}
          <span className="text-slate-200">{total}</span>).
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void load(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
            className="rounded-md border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-3 py-2 text-[12px] text-slate-200 hover:bg-[rgb(36,37,39)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            onClick={() => void load(Math.min(totalPages, page + 1))}
            disabled={loading || page >= totalPages}
            className="rounded-md border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-3 py-2 text-[12px] text-slate-200 hover:bg-[rgb(36,37,39)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or user id (current page)"
            className="w-[260px] md:w-[320px] rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-3 py-2 text-[12px] text-slate-100 placeholder:text-[rgb(120,121,125)] focus:outline-none focus:ring-0 focus:border-transparent"
          />
          <button
            onClick={() => void load(page)}
            className="rounded-md border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-3 py-2 text-[12px] text-slate-200 hover:bg-[rgb(36,37,39)]"
          >
            Reload
          </button>
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

      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-slate-400">No users on this page.</div>
      )}

      {!loading && !error && rows.length > 0 && filtered.length === 0 && (
        <div className="text-sm text-slate-400">No users match that search.</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]">
          <table className="min-w-full text-left text-[12px] md:text-[13px] text-slate-200">
            <thead className="bg-[rgb(32,33,35)] text-[rgb(163,163,164)]">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">User ID</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Last sign-in</th>
                <th className="px-3 py-2 font-medium">Stored tier</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Effective tier</th>
                <th className="px-3 py-2 font-medium text-right">Grant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSaving = savingUserId === u.id
                const canGrant = u.effectiveTier === 'FREE'

                return (
                  <tr
                    key={u.id}
                    className="border-t border-[rgb(41,42,45)]/80 hover:bg-[rgb(33,34,36)]"
                  >
                    <td className="px-3 py-2 align-middle">
                      <span className="text-slate-100">{u.email ?? '—'}</span>
                    </td>

                    <td className="px-3 py-2 align-middle">
                      <span className="font-mono text-[12px] text-slate-300">
                        {u.id}
                      </span>
                    </td>

                    <td className="px-3 py-2 align-middle text-[rgb(200,200,202)]">
                      {fmtDate(u.created_at)}
                    </td>

                    <td className="px-3 py-2 align-middle text-[rgb(200,200,202)]">
                      {fmtDate(u.last_sign_in_at)}
                    </td>

                    <td className="px-3 py-2 align-middle">
                      <span className="rounded-md border border-[rgb(58,59,63)] bg-[rgb(41,42,43)] px-2 py-1 text-[11px]">
                        {u.tier}
                      </span>
                    </td>

                    <td className="px-3 py-2 align-middle text-[rgb(200,200,202)]">
                      {u.status}
                    </td>

                    <td className="px-3 py-2 align-middle">
                      <span
                        className={`rounded-md border px-2 py-1 text-[11px] ${
                          u.effectiveTier === 'FREE'
                            ? 'border-[rgb(58,59,63)] bg-[rgb(41,42,43)] text-slate-200'
                            : 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200'
                        }`}
                      >
                        {u.effectiveTier}
                      </span>
                    </td>

                    <td className="px-3 py-2 align-middle text-right">
                      <div className="inline-flex items-center gap-2">
                        <select
                          value={grantTierByUser[u.id] ?? 'PLANNER'}
                          onChange={(e) =>
                            setGrantTierByUser((prev) => ({
                              ...prev,
                              [u.id]: e.target.value as Tier,
                            }))
                          }
                          className="rounded-md bg-[rgb(41,42,43)] border border-[rgb(58,59,63)] px-2 py-1 text-[12px] text-slate-100 focus:outline-none"
                          disabled={!canGrant || isSaving}
                        >
                          {GRANTABLE.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => void onGrant(u.id)}
                          disabled={!canGrant || isSaving}
                          className={`rounded-md px-3 py-1.5 text-[12px] border ${
                            !canGrant
                              ? 'border-[rgb(58,59,63)] bg-[rgb(32,33,35)] text-[rgb(140,140,144)] cursor-not-allowed'
                              : isSaving
                              ? 'border-[rgb(58,59,63)] bg-[rgb(32,33,35)] text-slate-200 opacity-70'
                              : 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-900/30'
                          }`}
                        >
                          {isSaving ? 'Granting…' : 'Grant'}
                        </button>
                      </div>

                      {!canGrant && (
                        <div className="mt-1 text-[11px] text-[rgb(140,140,144)]">
                          Paid/trialing users are protected.
                        </div>
                      )}
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
