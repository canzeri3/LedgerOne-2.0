'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerCombinedCard from '@/components/planner/SellPlannerCombinedCard'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'

type Props = { id: string } // coingecko_id

type BuyPlanner = {
  id: string
  user_id: string
  coingecko_id: string
  is_active: boolean
  started_at: string | null
}

type SellPlanner = {
  id: string
  user_id: string
  coingecko_id: string
  is_active: boolean
  created_at: string
  frozen_at: string | null
}

type PriceResp = { price: number | null }

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

const HIGHLIGHT_CLASS = 'text-yellow-300'
const HIGHLIGHT_ROW_CLASS = 'coin-ladder-near' // marker for cleanup
const NEAR_PCT = 0.03 // ±3%

export default function CoinPlanners({ id }: Props) {
  const { user } = useUser()

  // Active Buy?
  const { data: buyActive } = useSWR<BuyPlanner | null>(
    user ? ['active-buy-planner', user.id, id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('buy_planners')
        .select('id,user_id,coingecko_id,is_active,started_at')
        .eq('user_id', user!.id)
        .eq('coingecko_id', id)
        .eq('is_active', true)
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      return (data as any) ?? null
    },
    { refreshInterval: 60_000 }
  )

  // Active + frozen Sell?
  const { data: sellAll } = useSWR<SellPlanner[]>(
    user ? ['sell-planners', user.id, id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,user_id,coingecko_id,is_active,created_at,frozen_at')
        .eq('user_id', user!.id)
        .eq('coingecko_id', id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SellPlanner[]
    },
    { refreshInterval: 60_000 }
  )

  const hasActiveBuy = !!buyActive
  const activeSell = (sellAll ?? []).find(p => p.is_active) || null
  const frozenSell = (sellAll ?? []).filter(p => !p.is_active)
  const hasSell = !!activeSell || frozenSell.length > 0

  // Live price (for proximity + threshold highlight)
  const { data: priceData } = useSWR<PriceResp>(`/api/price/${id}`, fetcher, { refreshInterval: 30_000 })
  const livePrice = useMemo(() => (priceData?.price ?? null), [priceData?.price])

  // Refs to scope DOM decoration
  const buyRootRef = useRef<HTMLDivElement>(null)
  const sellRootRef = useRef<HTMLDivElement>(null)

  // Highlight logic (UI-only, coin page only)
  useEffect(() => {
    if (!livePrice || livePrice <= 0) return

    const roots: Array<{ root: HTMLElement | null; mode: 'buy' | 'sell' }> = [
      { root: buyRootRef.current, mode: 'buy' },
      { root: sellRootRef.current, mode: 'sell' },
    ]

    const currencyRegex = /(\$|USD)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i
    const numericRegex = /^-?\s*\$?\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:USD)?$/i

    const parseUsd = (text: string): number | null => {
      // Prefer matches that include $ or USD
      const cur = text.match(currencyRegex)
      if (cur && cur[0]) {
        const n = Number(cur[0].replace(/[^0-9.]+/g, ''))
        return Number.isFinite(n) ? n : null
      }
      // Fallback to plain numeric that looks like a currency cell
      if (numericRegex.test(text.trim())) {
        const n = Number(text.replace(/[^0-9.]+/g, ''))
        return Number.isFinite(n) ? n : null
      }
      return null
    }

    const findRowContainer = (el: HTMLElement, stopAt: HTMLElement): HTMLElement => {
      // Climb to a reasonable "row" container (has padding/border/grid/flex)
      let node: HTMLElement | null = el
      while (node && node !== stopAt) {
        const cls = node.className || ''
        if (
          typeof cls === 'string' &&
          (
            cls.includes('rounded') ||
            cls.includes('border') ||
            cls.includes('ring-') ||
            cls.includes('grid') ||
            cls.includes('flex') ||
            cls.includes('py-') ||
            cls.includes('px-')
          )
        ) return node
        node = node.parentElement
      }
      return el
    }

    const clearHighlights = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_ROW_CLASS}`).forEach(row => {
        row.classList.remove(HIGHLIGHT_ROW_CLASS, HIGHLIGHT_CLASS)
      })
    }

    const applyHighlights = (root: HTMLElement, context: 'buy' | 'sell') => {
      clearHighlights(root)

      // Scan likely price cells:
      const candidates = root.querySelectorAll<HTMLElement>(
        // Prefer obvious price cells
        '[data-price],[data-level-price],[data-usd],[data-col="price"],[data-column="price"], .price, .usd, .price-usd, .tabular-nums, .text-right, .text-left'
      )

      candidates.forEach((cell) => {
        const text = cell.textContent || ''
        if (!text) return

        // only consider things that look like a dollar amount
        const level = parseUsd(text)
        if (level == null || level <= 0) return

        const near = Math.abs(level - livePrice) / livePrice <= NEAR_PCT
        const triggerBuy = context === 'buy' && livePrice <= level
        const triggerSell = context === 'sell' && livePrice >= level

        if (near || triggerBuy || triggerSell) {
          const row = findRowContainer(cell, root)
          row.classList.add(HIGHLIGHT_ROW_CLASS, HIGHLIGHT_CLASS)
        }
      })
    }

    const observers: MutationObserver[] = []

    roots.forEach(({ root, mode }) => {
      if (!root) return
      applyHighlights(root, mode)

      const obs = new MutationObserver(() => applyHighlights(root, mode))
      obs.observe(root, { childList: true, subtree: true, characterData: true })
      observers.push(obs)
    })

    return () => {
      observers.forEach(o => o.disconnect())
      roots.forEach(({ root }) => root && clearHighlights(root))
    }
  }, [livePrice])

  if (!hasActiveBuy && !hasSell) return null

  // Single stat-card shell used on coin page (same as your other cards)
  const shell =
    'rounded-2xl border border-slate-700/40 bg-slate-800/40 backdrop-blur-[2px] ring-1 ring-slate-600/30 w-full'

  return (
    <div className="space-y-4">
      {/* BUY — ladder in stat-card shell (with ref for highlighting) */}
      {hasActiveBuy && (
        <div ref={buyRootRef} className={shell}>
          <BuyPlannerLadder coingeckoId={id} />
        </div>
      )}

      {/* SELL — combined card in same shell (with ref for highlighting) */}
      {hasSell && (
        <div ref={sellRootRef} className={shell}>
          <SellPlannerCombinedCard
            title="Sell Planner"
            newestFirst={true}
            ActiveView={<SellPlannerLadder coingeckoId={id} />}
            HistoryView={<SellPlannerHistory coingeckoId={id} />}
            className="bg-transparent border-0 ring-0 shadow-none"
          />
        </div>
      )}
    </div>
  )
}

