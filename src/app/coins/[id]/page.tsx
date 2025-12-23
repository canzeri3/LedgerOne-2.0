// src/app/coins/[id]/page.tsx

import { use } from 'react'
import { headers } from 'next/headers'
import CoinOverview from '@/components/coins/CoinOverview'
import CoinStatsGrid from '@/components/coins/CoinStatsGrid'
import TradesList from '@/components/coins/TradesList'
import CoinValueChart from '@/components/coins/CoinValueChart'
import CoinPlannersUnderAddTrade from '@/components/coin/CoinPlannersUnderAddTrade'
import StickyToggleAddTrade from '@/components/coin/StickyToggleAddTrade'

type RouteParams = { id: string }
type CoinMeta = { coingecko_id: string; symbol: string; name: string }

// Build an absolute base URL for server-side fetches (works locally and in prod)
// Per mandate: server-to-server calls must use INTERNAL_BASE_URL (fallback localhost).
function getBaseUrl() {
  return process.env.INTERNAL_BASE_URL || 'http://localhost:3000'
}



export default function CoinPage({ params }: { params: Promise<RouteParams> }) {
  const { id } = use(params)
  const baseUrl = getBaseUrl()

  const coins = use(
    fetch(`${baseUrl}/api/coins`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as CoinMeta[]) : ([] as CoinMeta[])))
      .catch(() => [] as CoinMeta[])
  )

  const meta = coins.find((c) => c.coingecko_id === id)
  const name = meta?.name ?? id
  const symbol = meta?.symbol ?? id

  return (
    <div className="coins-page space-y-6">
      {/* Header stat card with price + 24h change */}
      <CoinOverview id={id} name={name} symbol={symbol} />
      <CoinStatsGrid id={id} />

 {/* Full-width Value chart */}
<div style={{ marginTop: '3rem' }} className="px-6 md:px-6 lg:px-5">
  <CoinValueChart coingeckoId={id} />
</div>


      {/* Stack: Add Trade (with sticky toggle), Planners, Recent Trades */}
      <div className="mt-6 space-y-12">
        {/* Boundary so sticky ends at the bottom of planners */}
        <div style={{ position: 'relative' }} className="space-y-6">
          <StickyToggleAddTrade id={id} />
          <CoinPlannersUnderAddTrade />
        </div>

        <div className="px-6 md:px-8 lg:px-6">
  <TradesList id={id} />
</div>
      </div>
    </div>
  )
}
