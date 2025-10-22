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
import PlannerHighlightAgent from '@/components/planner/PlannerHighlightAgent'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  marketcap?: number | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function PlannerPage() {
  // ── Data: coins list ──────────────────────────────────────────────────────
  const { data: coins } = useSWR<Coin[]>(
    '/api/coins?limit=50&order=marketcap',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // ── Local state: selected coin id ─────────────────────────────────────────
  const [coingeckoId, setCoingeckoId] = useState<string>('')

  // Prime selection once coins load
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
    <div
      className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-screen-2xl mx-auto space-y-10"
      data-coingecko-id={coingeckoId || undefined}
    >
      {/* ───────── Header / coin selector ───────── */}
      <Card
        title="Buy / Sell Planner"
        subtitle="Pick a coin, then configure inputs and review ladders in a clean, unified view."
        headerRight={
          <div className="flex items-center gap-2 md:gap-3">
            <label htmlFor="coin" className="text-slate-300 text-xs md:text-sm">Coin</label>
            <div className="min-w-[220px]">
              <Select
                id="coin"
                value={coingeckoId}
                onChange={(e: any) => setCoingeckoId(e?.target ? e.target.value : e)}
              >
                {(coins ?? []).map(c => (
                  <option key={c.coingecko_id} value={c.coingecko_id}>
                    {c.name} ({(c.symbol ?? '').toUpperCase()})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        }
      >
        <div className="text-xs md:text-sm text-slate-400">
          {selected ? `${selected.name} selected` : 'Loading coins…'}
        </div>
      </Card>

      {/* Guard against undefined selection while coins load */}
      {!coingeckoId ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* ───────── BUY: one seamless card (Inputs + Ladder) ───────── */}
          <Card
            title="Buy Planner"
            className="w-full bg-none bg-[rgb(28,29,31)] border-0"
            headerBorderClassName="border-[rgb(41,42,45)]"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-6 md:gap-y-8 gap-x-6 md:gap-x-8">
              {/* Left: Inputs */}
              <section
                aria-label="Buy Planner Inputs"
                className="md:col-span-4 lg:col-span-3 space-y-4 buy-inputs-equal"
              >
                <div className="text-xs text-slate-400 md:hidden">Inputs</div>
                <div
                  className={`
                    grid grid-cols-1 gap-4
                    [&>*>.card]:h-full
                    [&>*>[data-card]]:h-full
                    [&>*>.Card]:h-full
                    [&_*]:[contain:layout_style_paint]
                  `}
                >
                  <BuyPlannerInputs coingeckoId={coingeckoId} />
                </div>
              </section>

              {/* Right: Ladder */}
              <section
                aria-label="Buy Planner Ladder"
                className="md:col-span-8 lg:col-span-9 space-y-4"
                data-buy-planner
              >
                <div className="text-xs text-slate-400 md:hidden">Ladder</div>
                <div className="p-2 rounded-md border border-[rgb(58,59,63)] bg-[rgb(41,42,45)]">
                  <BuyPlannerLadder coingeckoId={coingeckoId} />
                </div>
              </section>
            </div>

            {/* Footer: ACTIONS at the bottom-right of the WHOLE Buy Planner card */}
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('buyplanner:action', { detail: { action: 'edit' } })
                  )
                }
                className="rounded-lg px-4 py-2 text-sm font-medium bg-[rgb(41,42,45)] border border-[rgb(58,59,63)] text-slate-200 hover:bg-[rgb(45,46,49)]"
              >
                Edit Planner
              </button>

              {/* Save New — Uiverse.io (Madflows) animated gradient, matches font/size */}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('buyplanner:action', { detail: { action: 'save' } })
                  )
                }
                className="button"
              >
                <span className="button-content">Save New</span>
              </button>
            </div>
          </Card>

          {/* ───────── SELL: inputs + active/history ───────── */}
          <Card title="Sell Planner" className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-6 md:gap-y-8 gap-x-6 md:gap-x-8">
              <section
                aria-label="Sell Planner Inputs"
                className="md:col-span-4 lg:col-span-3 space-y-4 sell-inputs-stack"
              >
                <div className="text-xs text-slate-400 md:hidden">Inputs</div>
                <div
                  className={`
                    flex flex-col gap-4
                    [&_*]:w-full
                    [&_.grid]:!grid-cols-1
                    [&_.flex]:!flex-col
                    [&_.card]:w-full
                    [&_[data-card]]:w-full
                  `}
                >
                  <SellPlannerInputs coingeckoId={coingeckoId} />
                </div>
              </section>

              <section
                aria-label="Sell Planner Active and History"
                className="md:col-span-8 lg:col-span-9 space-y-4"
                data-sell-planner
              >
                <div className="text-xs text-slate-400 md:hidden">Active &amp; History</div>
                <div className="p-0">
                  <SellPlannerCombinedCard
                    title="Active & History"
                    ActiveView={<SellPlannerLadder coingeckoId={coingeckoId} />}
                    HistoryView={<SellPlannerHistory coingeckoId={coingeckoId} />}
                    newestFirst={true}
                  />
                </div>
              </section>
            </div>
          </Card>
        </>
      )}

      {/* row highlighter; no layout impact */}
      <PlannerHighlightAgent />

      {/* Global CSS — includes Uiverse.io Save New button styles */}
      <style jsx global>{`
        /* BUY — make all immediate child cards inside the Buy inputs area the same height */
        .buy-inputs-equal > div > * {
          height: 100%;
        }
        .buy-inputs-equal .card,
        .buy-inputs-equal [data-card],
        .buy-inputs-equal .Card {
          height: 100%;
        }

        /* SELL — force vertical stacking of any grid/flex layouts emitted by SellPlannerInputs */
        .sell-inputs-stack .grid {
          grid-template-columns: 1fr !important;
        }
        .sell-inputs-stack .flex {
          flex-direction: column !important;
        }
        .sell-inputs-stack .card,
        .sell-inputs-stack [data-card],
        .sell-inputs-stack .Card {
          width: 100%;
        }

        /* From Uiverse.io by Madflows — Save New button */
        .button {
          position: relative;
          overflow: hidden;

          /* Match Edit button's vertical rhythm (≈ py-2) */
          height: 2.5rem;
          padding: 0 2rem;

          /* Match Edit button's rounded-lg */
          border-radius: 0.5rem;

          /* Dark shell; gradient animates on hover via ::before */
          background: #39364fff;
          background-size: 400%;
          color: #fff;

          /* Match Edit button's typography (Tailwind: text-sm font-medium) */
          font-size: 0.875rem;   /* 14px */
          line-height: 1.25rem;  /* 20px */
          font-weight: 500;      /* medium */

          border: none;
          cursor: pointer;
        }
        .button:hover::before {
          transform: scaleX(1);
        }
        .button-content {
          position: relative;
          z-index: 1;
        }
        .button::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          transform: scaleX(0);
          transform-origin: 0 50%;
          width: 100%;
          height: inherit;
          border-radius: inherit;
          background: linear-gradient(
            82.3deg,
            rgba(127, 61, 226, 1) 10.8%,
            rgba(92, 81, 237, 1) 94.3%
          );
          transition: all 0.45s;
        }
      `}</style>
    </div>
  )
}
