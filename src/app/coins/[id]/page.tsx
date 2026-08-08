// src/app/coins/[id]/page.tsx

import { use } from 'react'
import { headers } from 'next/headers'
import CoinOverview from '@/components/coins/CoinOverview'
import CoinStatsGrid from '@/components/coins/CoinStatsGrid'
import TradesList from '@/components/coins/TradesList'
import CoinValueChart from '@/components/coins/CoinValueChart'
import CoinPlannersUnderAddTrade from '@/components/coin/CoinPlannersUnderAddTrade'
import StickyToggleAddTrade from '@/components/coin/StickyToggleAddTrade'
import CoinMobileSwitch from '@/components/coins/CoinMobileSwitch'
import MobileCoinPage from '@/components/coins/MobileCoinPage'
import MobileCoinWorkspace from '@/components/coins/MobileCoinWorkspace'
import MobileTransactions from '@/components/dashboard/MobileTransactions'
import './coin-skin.css'

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

  // Add Trade and the planners are common to both layouts; only the trades list
  // differs, so each branch supplies its own. Only the branch the switch returns
  // is mounted, so this renders once at runtime.
  const addTradeAndPlanners = (
    <div style={{ position: 'relative' }} className="space-y-6">
      <StickyToggleAddTrade id={id} />
      <CoinPlannersUnderAddTrade />
    </div>
  )

  const positionStackDesktop = (
    <div className="mt-6 space-y-12">
      {/* Boundary so sticky ends at the bottom of planners */}
      {addTradeAndPlanners}

      <div className="px-6 md:px-8 lg:px-6">
        <TradesList id={id} />
      </div>
    </div>
  )

  // Phones reuse the dashboard's transactions list, scoped to this coin, so the
  // two surfaces read identically.
  const positionStackMobile = (
    <div>
      <MobileCoinWorkspace id={id} />
      <MobileTransactions coins={coins} coinId={id} />
    </div>
  )

  return (
    <div className="coin coins-page space-y-6">
      <CoinMobileSwitch
        mobile={
          <div className="-mx-4">
            <MobileCoinPage id={id} name={name} symbol={symbol}>
              {positionStackMobile}
            </MobileCoinPage>
          </div>
        }
      >
        {/* Header stat card with price + 24h change */}
        <CoinOverview id={id} name={name} symbol={symbol} />
        <CoinStatsGrid id={id} />

        {/* Full-width Value chart */}
        <div style={{ marginTop: '3rem' }} className="px-6 md:px-6 lg:px-5">
          <CoinValueChart coingeckoId={id} />
        </div>

        {positionStackDesktop}
      </CoinMobileSwitch>
    </div>
  )
}
