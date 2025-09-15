'use client'

import useSWR from 'swr'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { useFavorites } from '@/lib/useFavorites'
import { Star } from 'lucide-react'

type PriceResp = {
  price: number | null
  change_24h: number | null // fraction, e.g. 0.05 = +5%
  captured_at: string | null
  provider: string | null
  stale: boolean
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function CoinOverview({ id, name, symbol }: { id: string; name: string; symbol: string }) {
  const { data } = useSWR<PriceResp>(`/api/price/${id}`, fetcher, { refreshInterval: 30000 })
  const { isFavorite, toggle } = useFavorites()

  const price = data?.price ?? null
  const pct = data?.change_24h ?? null
  const fav = isFavorite(id)

  return (
    <div className="rounded-2xl border border-[#081427] p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggle(id)}
          aria-label={fav ? 'Unfavorite' : 'Favorite'}
          className={`rounded-full border px-2.5 py-2 border-[#0b1830] hover:bg-[#0a162c] ${fav ? 'text-amber-300' : 'text-slate-300'}`}
          title={fav ? 'Unfavorite' : 'Favorite'}
        >
          <Star className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
        </button>
        <div>
          <div className="text-xs text-slate-400">{name}</div>
          <div className="text-xl font-semibold">{symbol?.toUpperCase()}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-lg font-semibold">{price != null ? fmtCurrency(price) : '—'}</div>
          <div className={`text-xs ${pct == null ? 'text-slate-400' : pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pct == null ? '24h —' : fmtPct(pct)}
          </div>
        </div>
        {/* Hide stale badge for now; uncomment if you want it visible
        {data?.stale && (
          <span className="text-[10px] rounded-full border border-amber-500/40 text-amber-300 px-2 py-0.5">Stale</span>
        )} */}
      </div>
    </div>
  )
}

