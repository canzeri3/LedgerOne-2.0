'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'
import PlannerPaywallCard from '@/components/billing/PlannerPaywallCard'

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

export default function CoinPlanners({ id }: Props) {
  const { user } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  const canUsePlanners = !!user && !!entitlements?.canUsePlanners

  // Active Buy?
  const { data: buyActive } = useSWR<BuyPlanner | null>(
    user && canUsePlanners ? ['buy-planner-active', user.id, id] : null,
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
user && canUsePlanners ? ['sell-planners', user.id, id] : null,
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

  const buyRootRef = useRef<HTMLDivElement>(null)
  const sellRootRef = useRef<HTMLDivElement>(null)

  // Collapsible (coins page): collapse Buy & Sell by default and toggle on header click.
  React.useLayoutEffect(() => {
    const buyHost = buyRootRef.current as HTMLElement | null
    const sellHost = sellRootRef.current as HTMLElement | null

    const setup = (host: HTMLElement | null) => {
      if (!host) return
      // The first child is expected to be the outer shell (Card or container)
      const shell = host.firstElementChild as HTMLElement | null
      if (!shell) return
      shell.classList.add('collapsed')
      const header = shell.firstElementChild as HTMLElement | null
      if (header) {
        header.style.cursor = 'pointer'
        const onClick = () => shell.classList.toggle('collapsed')
        header.addEventListener('click', onClick)
        ;(shell as any).__onClick = onClick
      }
    }

    const cleanup = (host: HTMLElement | null) => {
      if (!host) return
      const shell = host.firstElementChild as HTMLElement | null
      if (!shell) return
      const header = shell.firstElementChild as HTMLElement | null
      const onClick = (shell as any).__onClick as (() => void) | undefined
      if (header && onClick) header.removeEventListener('click', onClick)
    }

    setup(buyHost)
    setup(sellHost)
    return () => {
      cleanup(buyHost)
      cleanup(sellHost)
    }
  }, [])

  // --- UI scaffolding (existing) ---
  const shell =
    'rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-800/80 to-slate-900/80 backdrop-blur shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] transition-transform duration-200 hover:-translate-y-[1px]'

  useEffect(() => {
    if (!buyRootRef.current) return
    const host = buyRootRef.current
    if (!host) return

    const currencyRegex = /\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:USD)?/i
    const numericRegex = /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/

    const findPrice = (el: HTMLElement): number | null => {
      const text = (el.textContent || '').trim()
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
        ) {
          return node
        }
        node = node.parentElement
      }
      return stopAt
    }

    const observer = new MutationObserver(() => {
      // placeholder for any UI sync with existing content if needed
    })

    observer.observe(host, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (user && !entLoading && entitlements && !entitlements.canUsePlanners) {
  return (
    <div className="space-y-4">
      <PlannerPaywallCard compact />
    </div>
  )
}

  return (
    <div className="space-y-4">
      {user && !entLoading && entitlements?.plannedAssetsLimit != null && entitlements.plannedAssetsLimit > 0 ? (
  <div className="mb-3 rounded-2xl border border-slate-800/80 bg-[#151618] px-3 py-2">
    <div className="text-[12px] text-slate-300">
      Planned assets: <span className="text-slate-50 font-medium">{entitlements.plannedAssetsUsed}</span>
      /{entitlements.plannedAssetsLimit}
      {entitlements.plannedAssetsUsed >= entitlements.plannedAssetsLimit ? (
        <span className="text-indigo-200"> — limit reached</span>
      ) : null}
    </div>
  </div>
) : null}

      {hasActiveBuy && (
        <div ref={buyRootRef} className={shell}>
          <div className="px-5 pt-5 pb-3 border-b border-slate-700/50">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-slate-100">Buy Planner</h2>
              </div>
            </div>
          </div>
          <div className="p-5">
            <BuyPlannerLadder coingeckoId={id} />
          </div>
        </div>
      )}

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
    
      <style jsx>{`
        /* Collapsible: hide body (assumes shell children: [header][body(.p-5)]) */
        :global(.collapsed) > :global(.p-5) { display: none !important; }
      `}</style>
    </div>
  )
}
