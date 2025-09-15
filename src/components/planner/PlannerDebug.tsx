'use client'

import useSWR from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function PlannerDebug({ coingeckoId }: { coingeckoId: string }) {
  const { user } = useUser()

  const { data, error } = useSWR(
    user ? ['/planner/debug', user.id, coingeckoId] : null,
    async () => {
      const [bp, sp, sl] = await Promise.all([
        supabaseBrowser.from('buy_planners').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).eq('coingecko_id', coingeckoId),
        supabaseBrowser.from('sell_planners').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).eq('coingecko_id', coingeckoId),
        supabaseBrowser.from('sell_levels').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).eq('coingecko_id', coingeckoId),
      ])
      return {
        buy_planners: bp.count ?? 0,
        sell_planners: sp.count ?? 0,
        sell_levels: sl.count ?? 0,
      }
    },
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  )

  return (
    <div className="rounded-lg border border-[#3b1e1e] bg-[#1a0f0f] p-3 text-[11px] text-red-200">
      <div className="font-medium mb-1">Planner Debug</div>
      {!user && <div>user: <span className="text-red-300">null (not signed in)</span></div>}
      <div>coin: <span className="text-red-300">{coingeckoId}</span></div>
      {error ? (
        <div className="mt-1">error: {String((error as any).message ?? error)}</div>
      ) : (
        <div className="mt-1">
          rows → buy_planners: {data?.buy_planners ?? 0} · sell_planners: {data?.sell_planners ?? 0} · sell_levels: {data?.sell_levels ?? 0}
        </div>
      )}
      <div className="mt-1 opacity-75">If counts are 0 after Save New / Generate Ladder → check RLS or triggers.</div>
    </div>
  )
}

