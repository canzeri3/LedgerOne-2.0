'use client'

import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

type LogRow = {
  id: string
  coingecko_id: string | null
  entity: 'buy_planner'|'sell_planner'|'sell_level'|'trade'|'system'
  action: string
  details: any
  created_at: string
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

   return (
    <div className="relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Audit Log</h1>


      <div className="rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4 overflow-x-auto shadow-[inset_0_0_0_1px_rgba(51,65,85,0.35)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="text-slate-300">
            <tr className="text-left">
              <th className="py-2 pr-2">Time</th>
              <th className="py-2 pr-2">Coin</th>
              <th className="py-2 pr-2">Entity</th>
              <th className="py-2 pr-2">Action</th>
              <th className="py-2 pr-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {error && <tr><td className="py-3 text-rose-400" colSpan={5}>Error loading logs.</td></tr>}
            {!data && !error && <tr><td className="py-3 text-slate-400" colSpan={5}>Loading…</td></tr>}
            {data?.map(row => (
              <tr key={row.id} className="border-t border-slate-700/40 align-top">
                <td className="py-2 pr-2">{new Date(row.created_at).toLocaleString()}</td>
                <td className="py-2 pr-2">{row.coingecko_id ?? '—'}</td>
                <td className="py-2 pr-2">{row.entity}</td>
                <td className="py-2 pr-2">{row.action}</td>
                <td className="py-2 pr-2">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all">
                    {JSON.stringify(row.details ?? {}, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr><td className="py-3 text-slate-400" colSpan={5}>No audit entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Edits, freezes, and reassignment events are logged automatically. Only you can see your own logs (RLS owner-only).
      </p>
    </div>
  )
}

