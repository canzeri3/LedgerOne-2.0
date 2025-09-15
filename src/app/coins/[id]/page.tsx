import { use } from 'react'
import { headers } from 'next/headers'
import CoinOverview from '@/components/coins/CoinOverview'
import TradesPanel from '@/components/coins/TradesPanel'
import TradesList from '@/components/coins/TradesList'
import CoinValueChart from '@/components/coins/CoinValueChart'

type RouteParams = { id: string }
type CoinMeta = { coingecko_id: string; symbol: string; name: string }

// Build an absolute base URL for server-side fetches (works locally and in prod)
function getBaseUrl() {
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
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
    <div className="space-y-6">
      {/* Header stat card with price + 24h change */}
      <CoinOverview id={id} name={name} symbol={symbol} />

      {/* NEW: Full-width Value chart */}
      <CoinValueChart coingeckoId={id} />

      {/* Stack: Add Trade card, then Recent Trades underneath */}
      <div className="space-y-4">
        <TradesPanel id={id} />
        <TradesList id={id} />
      </div>
    </div>
  )
}

