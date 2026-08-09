'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerCombinedCard from '@/components/planner/SellPlannerCombinedCard'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'
import '@/app/planner/planner-skin.css'

/**
 * Coins page planners under Add Trade — "prime desk" skin.
 * UI-only: collapsible pl-panel sections (rail, badge, stats, chip, caret)
 * exactly as in the design handoff. The ladders are the same reskinned
 * BuyPlannerLadder / SellPlannerLadder used on /planner — no logic changes.
 */

function PlannerPanel({
  side,
  defaultOpen,
  hasAlert,
  pheadSlots,
  children,
}: {
  side: 'buy' | 'sell'
  defaultOpen: boolean
  hasAlert: boolean
  pheadSlots: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const collapseRef = useRef<HTMLDivElement | null>(null)
  const firstRun = useRef(true)
  const label = side === 'buy' ? 'Buy' : 'Sell'

  // Drive the collapse height explicitly: the ladders have no fixed height, and
  // grid-template-rows 0fr->1fr does not interpolate in every engine.
  useEffect(() => {
    const el = collapseRef.current
    const inner = bodyRef.current
    if (!el || !inner) return

    // Settle straight into the initial state — no animation on mount.
    if (firstRun.current) {
      firstRun.current = false
      el.style.height = open ? 'auto' : '0px'
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.height = open ? 'auto' : '0px'
      return
    }

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'height') return
      // Release to auto so the panel tracks later content changes.
      if (open) el.style.height = 'auto'
    }
    el.addEventListener('transitionend', onEnd)

    if (open) {
      el.style.height = '0px'
      void el.offsetHeight // commit the start value before animating
      el.style.height = `${inner.scrollHeight}px`
    } else {
      el.style.height = `${inner.scrollHeight}px`
      void el.offsetHeight
      el.style.height = '0px'
    }

    return () => el.removeEventListener('transitionend', onEnd)
  }, [open])

  return (
    <div className={`pl-panel ${side}${open ? '' : ' closed'}`}>
      <div className="pl-rail" aria-hidden="true" />
      <div
        className="pl-phead"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(o => !o)
          }
        }}
      >
        <div className="pl-title">
          <span className="pl-badge">{label}</span>
          <div className={`tt${hasAlert ? ' alert' : ''}`}>{label} Planner</div>
        </div>
        <div
          className="pl-phead-right"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {pheadSlots}
          <span
            className={`cp-caret${open ? ' open' : ''}`}
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(o => !o)
            }}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.24 4.4a.75.75 0 01-1.08 0l-4.24-4.4a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </div>

      {/* Keep the body mounted while closed so the ladder's stat portals stay live */}
      <div ref={collapseRef} className={`pl-collapse${open ? ' open' : ''}`}>
        <div ref={bodyRef} className="pl-collapse-inner" inert={!open}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function CoinPlannersUnderAddTrade() {
  const pathname = usePathname()
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

  const setSellAlert = useCallback((sellActive: boolean) => {
    setPlannerAlerts((current) =>
      current.sellActive === sellActive ? current : { ...current, sellActive }
    )
  }, [])

  const setSellHistoryAlert = useCallback((sellHistory: boolean) => {
    setPlannerAlerts((current) =>
      current.sellHistory === sellHistory
        ? current
        : { ...current, sellHistory }
    )
  }, [])

  // Resolve coin id (keeps existing behavior)
  const coinId = useMemo(() => {
    if (pathname) {
      const m = pathname.match(/\/coins\/([^/]+)/)
      if (m?.[1]) return m[1]
    }
    if (typeof document !== 'undefined') {
      const attrEl = document.querySelector('[data-coingecko-id]') as HTMLElement | null
      const metaEl = document.querySelector('meta[name="coingecko-id"]') as HTMLMetaElement | null
      return attrEl?.getAttribute('data-coingecko-id') || metaEl?.content || null
    }
    return null
  }, [pathname])

  if (!coinId) return null

  return (
    <div className="pl pl-coins mt-11 px-6 md:px-8 lg:px-6 flex flex-col gap-6" style={{ paddingBottom: 0 }}>
      {/* BUY — collapsed by default (matches handoff) */}
      <PlannerPanel
        side="buy"
        defaultOpen={false}
        hasAlert={plannerAlerts.buy}
        pheadSlots={<div id="buy-phead-stats" className="contents" />}
      >
        <div className="pt-1">
          <BuyPlannerLadder
            coingeckoId={coinId}
            onAlertStateChange={setBuyAlert}
          />
        </div>
      </PlannerPanel>

      {/* SELL — open by default (matches handoff) */}
      <PlannerPanel
        side="sell"
        defaultOpen={true}
        hasAlert={plannerAlerts.sellActive || plannerAlerts.sellHistory}
        pheadSlots={
          <>
            <div id="sell-phead-stats" className="contents" />
            <div id="coin-sell-plans" className="contents" />
          </>
        }
      >
        <SellPlannerCombinedCard
          title=""
          newestFirst={true}
          ActiveView={
            <SellPlannerLadder
              coingeckoId={coinId}
              onAlertStateChange={setSellAlert}
            />
          }
          HistoryView={
            <SellPlannerHistory
              coingeckoId={coinId}
              onAlertStateChange={setSellHistoryAlert}
            />
          }
        />
      </PlannerPanel>
    </div>
  )
}
