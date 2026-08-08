'use client'

import { useCallback, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react'
import TradesPanel from '@/components/coins/TradesPanel'
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerCombinedCard from '@/components/planner/SellPlannerCombinedCard'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'
import '@/app/planner/planner-skin.css'

type WorkspaceTab = 'trade' | 'buy' | 'sell'

const TABS = [
  { id: 'trade' as const, label: 'Add Trade', icon: Plus },
  { id: 'buy' as const, label: 'Buy Planner', icon: ArrowDownToLine },
  { id: 'sell' as const, label: 'Sell Planner', icon: ArrowUpFromLine },
]

export default function MobileCoinWorkspace({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('trade')
  const [plannerAlerts, setPlannerAlerts] = useState({
    buy: false,
    sellActive: false,
    sellHistory: false,
  })

  const setBuyAlert = useCallback((buy: boolean) => {
    setPlannerAlerts((current) =>
      current.buy === buy ? current : { ...current, buy }
    )
  }, [])

  const setSellAlert = useCallback((sell: boolean) => {
    setPlannerAlerts((current) =>
      current.sellActive === sell ? current : { ...current, sellActive: sell }
    )
  }, [])

  const setSellHistoryAlert = useCallback((sellHistory: boolean) => {
    setPlannerAlerts((current) =>
      current.sellHistory === sellHistory
        ? current
        : { ...current, sellHistory }
    )
  }, [])

  return (
    <section data-mobile-coin-actions className="mt-6 border-y border-[rgb(41,42,45)]">
      <div
        role="tablist"
        aria-label="Coin actions"
        className="grid grid-cols-3 border-b border-[rgb(41,42,45)] px-3"
      >
        {TABS.map(({ id: tabId, label, icon: Icon }) => {
          const active = activeTab === tabId
          const hasAlert =
            tabId === 'buy'
              ? plannerAlerts.buy
              : tabId === 'sell'
                ? plannerAlerts.sellActive || plannerAlerts.sellHistory
                : false
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              id={`mobile-coin-tab-${tabId}`}
              aria-selected={active}
              aria-controls={`mobile-coin-panel-${tabId}`}
              data-alert={hasAlert ? 'true' : undefined}
              onClick={() => setActiveTab(tabId)}
              className={[
                'relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 pb-3 pt-3 text-[11.5px] font-semibold transition-colors focus:outline-none',
                hasAlert
                  ? 'text-[rgb(230,165,60)]'
                  : active
                    ? 'text-[rgb(163,152,242)]'
                    : 'text-slate-500',
              ].join(' ')}
            >
              <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
              <span className="truncate">{label}</span>
              {hasAlert && <span className="sr-only">Alert active</span>}
              <span
                aria-hidden="true"
                className={[
                  'absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-[rgb(137,128,213)] transition-opacity',
                  active ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
            </button>
          )
        })}
      </div>

      <div
        id="mobile-coin-panel-trade"
        role="tabpanel"
        aria-labelledby="mobile-coin-tab-trade"
        hidden={activeTab !== 'trade'}
        className="mobile-coin-action-panel"
      >
        <TradesPanel id={id} />
      </div>

      <div
        id="mobile-coin-panel-buy"
        role="tabpanel"
        aria-labelledby="mobile-coin-tab-buy"
        hidden={activeTab !== 'buy'}
        className="mobile-coin-action-panel"
      >
        <div className="pl pl-coins mobile-coin-planner mobile-coin-table-only">
          <section aria-label="Buy Planner ladder">
            <BuyPlannerLadder
              coingeckoId={id}
              onAlertStateChange={setBuyAlert}
              showEmptyState
            />
          </section>
        </div>
      </div>

      <div
        id="mobile-coin-panel-sell"
        role="tabpanel"
        aria-labelledby="mobile-coin-tab-sell"
        hidden={activeTab !== 'sell'}
        className="mobile-coin-action-panel"
      >
        <div className="pl pl-coins mobile-coin-planner mobile-coin-table-only">
          <section aria-label="Sell Planner ladder">
            <SellPlannerCombinedCard
              switcherPlacement="inline"
              ActiveView={
                <SellPlannerLadder
                  coingeckoId={id}
                  onAlertStateChange={setSellAlert}
                  showEmptyState
                />
              }
              HistoryView={
                <SellPlannerHistory
                  coingeckoId={id}
                  onAlertStateChange={setSellHistoryAlert}
                />
              }
            />
          </section>
        </div>
      </div>
    </section>
  )
}
