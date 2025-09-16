'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'

import BuyPlannerInputs from '@/components/planner/BuyPlannerInputs'
import SellPlannerInputs from '@/components/planner/SellPlannerInputs'
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'
import SellPlannerCombinedCard from '@/components/planner/SellPlannerCombinedCard'

import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  marketcap?: number | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function PlannerPage() {
  const { data: coins } = useSWR<Coin[]>('/api/coins?limit=50&order=marketcap', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  const [coingeckoId, setCoingeckoId] = useState<string>('')

  useEffect(() => {
    if (!coingeckoId && coins && coins.length > 0) {
      setCoingeckoId(coins[0].coingecko_id)
    }
  }, [coins, coingeckoId])

  const selected = useMemo(
    () => coins?.find(c => c.coingecko_id === coingeckoId),
    [coins, coingeckoId]
  )

  return (
    <div className="px-4 md:px-6 py-6 max-w-screen-2xl mx-auto space-y-8">
      {/* Header / coin selector */}
      <Card
        title="Buy / Sell Planner"
        subtitle="Choose a coin, configure your planners, and track progress."
        headerRight={
          <div className="flex items-center gap-2">
            <label htmlFor="coin" className="text-slate-300 text-xs">Coin</label>
            <Select
              id="coin"
              value={coingeckoId}
              onChange={(e) => setCoingeckoId(e.target.value)}
            >
              {(coins ?? []).map(c => (
                <option key={c.coingecko_id} value={c.coingecko_id}>
                  {c.name} ({(c.symbol ?? '').toUpperCase()})
                </option>
              ))}
            </Select>
          </div>
        }
      >
        <div className="text-xs text-slate-400">
          {selected ? `${selected.name} selected` : 'Loading coins…'}
        </div>
      </Card>

      {!coingeckoId ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          <Card title="Buy Planner — Inputs">
            <BuyPlannerInputs coingeckoId={coingeckoId} />
          </Card>

          <Card title="Buy Planner — Ladder">
            <BuyPlannerLadder coingeckoId={coingeckoId} />
          </Card>

          <Card title="Sell Planner — Inputs">
            <SellPlannerInputs coingeckoId={coingeckoId} />
          </Card>

          {/* COMBINED: Active Sell Ladder + History with version selector */}
          <SellPlannerCombinedCard
            title="Sell Planner"
            ActiveView={<SellPlannerLadder coingeckoId={coingeckoId} />}
            HistoryView={<SellPlannerHistory coingeckoId={coingeckoId} />}
            newestFirst={true}  // SellPlannerHistory sorts by created_at DESC (newest first)
          />
        </>
      )}
    </div>
  )
}

