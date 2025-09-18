import CoinOverview from '@/components/coins/CoinOverview'
import CoinStatsGrid from '@/components/coins/CoinStatsGrid'
import TradesPanel from '@/components/coins/TradesPanel'
import TradesList from '@/components/coins/TradesList'
import CoinValueChart from '@/components/coins/CoinValueChart'
import SectionCard from '@/components/common/SectionCard'

// BUY planner
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'

// SELL planner (combined card that shows Levels + Frozen/History)
import CombinedSellPlannerCard from '@/components/sell/CombinedSellPlannerCard'

type RouteParams = { id: string }

/**
 * Server component. No client hooks here.
 * Child components handle their own data fetching.
 */
export default async function CoinPage({ params }: { params: RouteParams }) {
  const id = params.id
  const name = id
  const symbol = id.toUpperCase().slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Overview + stats */}
      <CoinOverview id={id} name={name} symbol={symbol} />
      <CoinStatsGrid id={id} />

      {/* Chart */}
      <CoinValueChart coingeckoId={id} />

      {/* Stack: Add Trade, then planners (styled to match stat/Add Trade cards), then recent trades */}
      <div className="space-y-4">
        {/* Add Trade (already styled) */}
        <TradesPanel id={id} />

        {/* Buy Planner – Ladder */}
        <SectionCard
          title="Buy Planner – Ladder"
          description="Your active buy ladder for this coin."
        >
          <BuyPlannerLadder coingeckoId={id} />
        </SectionCard>

        {/* Sell Planner (combined: active levels + frozen history) */}
        <SectionCard
          title="Sell Planner"
          description="Active take-profit levels and frozen history."
        >
          <CombinedSellPlannerCard coingeckoId={id} />
        </SectionCard>

        {/* Recent Trades */}
        <TradesList id={id} />
      </div>
    </div>
  )
}
