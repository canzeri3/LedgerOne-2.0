'use client'

import React, { useEffect, useRef } from 'react'
import CoinPlannersUnderAddTrade from '@/components/coin/CoinPlannersUnderAddTrade'
import CollapsiblePlanner from '@/components/ui/CollapsiblePlanner'

/**
 * Pure UI wrapper:
 * - Renders your existing <CoinPlannersUnderAddTrade /> once (hidden),
 *   then moves its Buy/Sell DOM blocks into two CollapsiblePlanner sections.
 * - Both sections are collapsed by default.
 * - Collapsible headers show a yellow alert dot if any child row is already yellow
 *   (visual-only; no logic changes). Detection is handled by <CollapsiblePlanner/>.
 *
 * We do not modify any props/data/layout of your planners.
 */

function moveChildNodes(fromEl: Element, toEl: Element) {
  while (fromEl.firstChild) {
    toEl.appendChild(fromEl.firstChild)
  }
}

function classifyBlocks(root: Element) {
  let buy: Element | null = null
  let sell: Element | null = null

  // 1) Prefer explicit data hooks if present
  buy = root.querySelector('[data-planner="buy"]')
  sell = root.querySelector('[data-planner="sell"]')

  // 2) Look for headings/text cues
  if (!buy || !sell) {
    const sections = Array.from(root.querySelectorAll('section, div'))
    for (const el of sections) {
      const txt = (el.textContent || '').toLowerCase()
      if (!buy && /buy\s*planner/.test(txt)) buy = el
      if (!sell && /sell\s*planner/.test(txt)) sell = el
    }
  }

  // 3) Fallback: take two largest immediate children
  if (!buy || !sell) {
    const candidates = Array.from(root.children) as Element[]
    const sorted = candidates
      .filter(c => c.children && c.children.length > 0)
      .sort((a, b) => (b.children?.length || 0) - (a.children?.length || 0))
    if (!buy && sorted[0]) buy = sorted[0]
    if (!sell && sorted[1]) sell = sorted[1]
  }

  return { buy, sell }
}

const PlannersCollapsibleMount: React.FC = () => {
  const stagingRef = useRef<HTMLDivElement | null>(null)
  const buySlotRef = useRef<HTMLDivElement | null>(null)
  const sellSlotRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const staging = stagingRef.current
    const buySlot = buySlotRef.current
    const sellSlot = sellSlotRef.current
    if (!staging || !buySlot || !sellSlot) return

    // The planners render here (hidden), then we move their inner DOM to the slots
    const root = staging
    const { buy, sell } = classifyBlocks(root)

    if (buy) moveChildNodes(buy, buySlot)
    if (sell) moveChildNodes(sell, sellSlot)
    // If not found, the original hidden block remains; fail-safe is no-op.
  }, [])

  return (
    <>
      {/* Hidden render of your original planners (DOM exists; just not visible) */}
      <div
        ref={stagingRef}
        className="hidden"
        aria-hidden="true"
      >
        <CoinPlannersUnderAddTrade />
      </div>

      {/* Collapsible UI-only wrappers (collapsed by default) */}
      <CollapsiblePlanner title="Buy Planner" defaultOpen={false}>
        <div ref={buySlotRef} />
      </CollapsiblePlanner>

      <CollapsiblePlanner title="Sell Planner" defaultOpen={false}>
        <div ref={sellSlotRef} />
      </CollapsiblePlanner>
    </>
  )
}

export default PlannersCollapsibleMount

