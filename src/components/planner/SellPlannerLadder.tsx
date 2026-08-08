'use client'

import { useMemo, useEffect } from 'react'
import { Layers, Target, Coins, DollarSign, TrendingUp } from 'lucide-react'

import useSWR, { mutate as globalMutate, useSWRConfig } from 'swr'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { fmtCurrency } from '@/lib/format'
import { usePrice } from '@/lib/dataCore'
import SlotPortal from '@/components/planner/SlotPortal'
import PlannerActionAlert from '@/components/planner/PlannerActionAlert'
import {
  computeSellFills,
  type SellTrade as SellTradeType,
} from '@/lib/planner'

type SellPlanner = {
  id: string
  user_id: string
  coingecko_id: string
  is_active: boolean
  avg_lock_price: number | null
  created_at: string
  frozen_at: string | null
}

type SellLevel = {
  level: number
  rise_pct: number | null
  price: number | null
  sell_tokens: number | null
  sell_pct_of_remaining: number | null
  sell_planner_id: string
  user_id: string
  coingecko_id: string
}

type SellTrade = {
  price: number
  quantity: number
  fee?: number | null
  trade_time?: string
}

type ViewRow = {
  level: number
  targetPrice: number
  plannedTokens: number
  plannedUsd: number
  missingUsd: number
  pct: number
}

function num(n: any): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

const SELL_TOLERANCE = 0.0005 // strict for active

export default function SellPlannerLadder({
  coingeckoId,
  onAlertStateChange,
  showEmptyState = false,
}: {
  coingeckoId: string
  onAlertStateChange?: (hasAlert: boolean) => void
  showEmptyState?: boolean
}) {
  const { user, loading: userLoading } = useUser()
  const { mutate: mutateGlobal } = useSWRConfig()


  // NEW: robust live price via data core
  const { row: priceRow } = usePrice(coingeckoId, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })
  const livePrice = priceRow?.price ?? null

  // Ticker for the banner copy. Coin metadata (not market data), so it reads
  // from the coins table the same way the reports page does.
  const { data: coinSymbol } = useSWR<string | null>(
    coingeckoId ? ['/sell-planner/coin-symbol', coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('coins')
        .select('symbol')
        .eq('coingecko_id', coingeckoId)
        .maybeSingle()
      if (error) throw error
      return ((data?.symbol as string | undefined) ?? '').toUpperCase() || null
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const { data: active } = useSWR<SellPlanner | null>(
    user ? ['/sell-active', user.id, coingeckoId] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_planners')
        .select('id,user_id,coingecko_id,is_active,avg_lock_price,created_at,frozen_at')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as SellPlanner) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const { data: levels } = useSWR(
    user && active ? ['/sell-levels', user.id, coingeckoId, active.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('sell_levels')
        .select('level,rise_pct,price,sell_tokens,sell_pct_of_remaining,sell_planner_id,user_id,coingecko_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('sell_planner_id', active!.id)
        .order('level', { ascending: true })
      if (error) throw error
      return (data ?? []) as any[]
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  const { data: sells } = useSWR<SellTrade[]>(
    user && active ? ['/sells', user.id, coingeckoId, active.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('id,user_id,coingecko_id,quantity,price,fee,trade_time,side,sell_planner_id')
        .eq('user_id', user!.id)
        .eq('coingecko_id', coingeckoId)
        .eq('side', 'sell')
        .eq('sell_planner_id', active!.id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        price: num(r.price),
        quantity: num(r.quantity),
        fee: num(r.fee),
        trade_time: r.trade_time,
      }))
    },
    { revalidateOnFocus: false, dedupingInterval: 15000 }
  )

  // Live delete bridge from the planner shell
  useEffect(() => {
    if (typeof window === 'undefined') return

    const onAction = (e: Event) => {
      const ce = e as CustomEvent<{ action?: 'remove'; confirmed?: boolean }>
      if (ce.detail?.action !== 'remove') return

      void (async () => {
        if (!user) {
          alert('Please sign in first.')
          return
        }

        if (!active?.id) {
          alert('No active Sell Planner to delete.')
          return
        }

        if (!ce.detail?.confirmed) {
          const ok = window.confirm(
            'Remove the current Sell Planner for this asset? This will move it out of Active, keep its history intact, and allow it to be restored later from Audit.'
          )
          if (!ok) return
        }

        try {
          const { error } = await supabaseBrowser
            .from('sell_planners')
            .update({ is_active: false })
            .eq('id', active.id)
            .eq('user_id', user.id)
            .eq('is_active', true)

          if (error) throw error

          await Promise.all([
            mutateGlobal(['/sell-active', user.id, coingeckoId]),
            mutateGlobal(['/sell-planner/active', user.id, coingeckoId]),
            mutateGlobal(['/sell-levels', user.id, coingeckoId, active.id]),
            mutateGlobal(['/sells', user.id, coingeckoId, active.id]),
            mutateGlobal(['/sell-history/planners', user.id, coingeckoId]),
            mutateGlobal(['/sell-history/levels', user.id, coingeckoId]),
            mutateGlobal(['/sell-history/sells', user.id, coingeckoId]),
          ])

          window.dispatchEvent(
            new CustomEvent('sellPlannerUpdated', {
              detail: { coinId: coingeckoId },
            })
          )
        } catch (err: any) {
          console.error('[sell_planner live delete] exception', err)
          alert('Delete failed: ' + (err?.message || String(err)))
        }
      })()
    }

    window.addEventListener('sellplanner:action', onAction as EventListener)
    return () => {
      window.removeEventListener('sellplanner:action', onAction as EventListener)
    }
  }, [user?.id, coingeckoId, active?.id, mutateGlobal])

  // Refresh on planner updates
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bump = (e: any) => {
      const detailCoin = e?.detail?.coinId
      if (detailCoin && detailCoin !== coingeckoId) return
      if (!user || !active) return
      globalMutate(['/sell-active', user.id, coingeckoId])
      globalMutate(['/sell-levels', user.id, coingeckoId, active.id])
    }
    window.addEventListener('sellPlannerUpdated', bump)
    window.addEventListener('buyPlannerUpdated', bump)
    return () => {
      window.removeEventListener('sellPlannerUpdated', bump)
      window.removeEventListener('buyPlannerUpdated', bump)
    }
  }, [user?.id, coingeckoId, active?.id])

  const lvls = useMemo(
    () =>
      (levels ?? []).map((l: any) => ({
        level: l.level,
        targetPrice: num(l.price),
        plannedTokens: Math.max(0, num(l.sell_tokens)),
      })),
    [JSON.stringify(levels)]
  )

  const fill = useMemo(() => {
    if (!lvls.length) return null as any
    return computeSellFills(
      lvls.map(({ targetPrice, plannedTokens }) => ({ target_price: targetPrice, planned_tokens: plannedTokens })),
      sells ?? [],
      SELL_TOLERANCE
    ) as any
  }, [JSON.stringify(lvls), JSON.stringify(sells)])

  const allocated: number[] = Array.isArray(fill?.allocatedTokens)
    ? (fill.allocatedTokens as any[]).map(num)
    : lvls.map(() => 0)

  const rows: ViewRow[] = (lvls ?? []).map((lv, i) => {
    const plannedTokens = lv.plannedTokens || 0
    const plannedUsd = plannedTokens * lv.targetPrice
    const missingTokens = Math.max(0, plannedTokens - (allocated[i] ?? 0))
    const missingUsd = missingTokens * lv.targetPrice
    const pct = plannedTokens > 0 ? Math.min(1, (allocated[i] ?? 0) / plannedTokens) : 0
    return {
      level: lv.level,
      targetPrice: lv.targetPrice,
      plannedTokens,
      plannedUsd,
      missingUsd,
      pct,
    }
  })
  const hasLive = Number.isFinite(livePrice as number) && (livePrice as number) > 0

  const actionableNow = useMemo(() => {
    if (!hasLive || !rows.length) {
      return {
        alertRows: 0,
        remainingTokens: 0,
        remainingUsd: 0,
        lowestAlertPrice: null as number | null,
        actionablePrice: null as number | null,
      }
    }

    const summary = rows.reduce(
      (acc, r) => {
        const missingTokens = Math.max(0, r.plannedTokens * (1 - r.pct))
        const green = r.pct >= 0.97
        const yellow =
          !green &&
          r.targetPrice > 0 &&
          (livePrice as number) >= r.targetPrice * 0.985

        if (!yellow || missingTokens <= 0) return acc

        acc.alertRows += 1
        acc.remainingTokens += missingTokens
        acc.remainingUsd += r.missingUsd

        if (acc.lowestAlertPrice === null || r.targetPrice < acc.lowestAlertPrice) {
          acc.lowestAlertPrice = r.targetPrice
        }

        return acc
      },
      {
        alertRows: 0,
        remainingTokens: 0,
        remainingUsd: 0,
        lowestAlertPrice: null as number | null,
      }
    )

    // Price to quote in the banner: the one you'd actually sell at. The alert
    // band allows live up to 1.5% below a target, so only clamp upward — if the
    // market has run past the lowest alerting target, that's the better fill.
    const actionablePrice =
      summary.lowestAlertPrice === null
        ? null
        : Math.max(summary.lowestAlertPrice, livePrice as number)

    return { ...summary, actionablePrice }
  }, [hasLive, rows, livePrice])

  const hasActionableAlert = actionableNow.alertRows > 0

  useEffect(() => {
    onAlertStateChange?.(hasActionableAlert)
  }, [hasActionableAlert, onAlertStateChange])

  const activeLookupFinished = !userLoading && (!user || active !== undefined)
  const levelsLookupFinished = !user || active == null || levels !== undefined
  const hasUsableLevels = lvls.some(
    (level) => level.targetPrice > 0 && level.plannedTokens > 0
  )
  const hasNoPlanner =
    activeLookupFinished &&
    levelsLookupFinished &&
    (!user || active === null || !hasUsableLevels)

  if (showEmptyState && hasNoPlanner) {
    return (
      <div
        role="status"
        className="flex min-h-[190px] w-full flex-col items-center justify-center px-7 py-12 text-center"
      >
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(56,58,64)] bg-[rgb(27,28,31)] text-slate-500">
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-slate-200">
          No active Sell Planner
        </h3>
        <p className="mt-1.5 max-w-[270px] text-[13px] leading-5 text-slate-500">
          Create a Sell Planner to see its planned levels here.
        </p>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full flex flex-col"
      data-has-alert={hasActionableAlert ? '1' : '0'}
      data-active-id={active?.id ?? ''}
    >     
      {/* Panel-head stat pills (display-only; sums of already-fetched values) */}
      <SlotPortal slotId="sell-phead-stats">
        <div className="pl-stat">
          <span className="l">Sold</span>
          <span className="v" style={{ color: 'var(--pl-ladder-green)' }}>
            {fmtCurrency(allocated.reduce((s, t, i) => s + t * (lvls[i]?.targetPrice ?? 0), 0))}
          </span>
        </div>
        <div className="pl-stat key">
          <span className="l">If all hit</span>
          <span className="v" style={{ color: 'var(--pl-text)' }}>
            {fmtCurrency(rows.reduce((s, r) => s + r.plannedUsd, 0))}
          </span>
        </div>
      </SlotPortal>

      {actionableNow.alertRows > 0 && (
        <PlannerActionAlert
          action="sell"
          rows={actionableNow.alertRows}
          quantity={actionableNow.remainingTokens.toFixed(6)}
          symbol={coinSymbol}
          price={
            actionableNow.actionablePrice !== null
              ? fmtCurrency(actionableNow.actionablePrice)
              : null
          }
        />
      )}

      <div className="pl-ladder flex-1">
        <div className="ldr-scroll">
          <table className="ldr" data-sell-planner>
            <thead>
              <tr>
                <th>
                  <span className="th-l">
                    Lvl <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>

                <th>
                  <span className="th-l">
                    Target <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>

                <th className="!text-right">
                  <span className="th-l !justify-end">
                    Planned <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>

                <th className="!text-right">
                  <span className="th-l !justify-end">
                    Planned <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>

                <th className="!text-right">
                  <span className="th-l !justify-end">
                    Missing <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>

                <th className="r">
                  <span className="th-l">
                    Progress <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const green = r.pct >= 0.97
                const hasLive = Number.isFinite(livePrice as number) && (livePrice as number) > 0
                // YELLOW when live price is anywhere from 1.5% below the level or anything above it
                const yellow =
                  !green &&
                  hasLive &&
                  r.targetPrice > 0 &&
                  (livePrice as number) >= r.targetPrice * 0.985

                const rowClass = green ? 'done' : yellow ? 'alert' : ''

                return (
                  <tr key={i} className={rowClass}>
                    <td className="lvl"><span className="ix">{r.level}</span></td>
                    <td className="tgt">{fmtCurrency(r.targetPrice)}</td>
                    <td className="num coins">{r.plannedTokens.toFixed(6)}</td>
                    <td className="num amt">{fmtCurrency(r.plannedUsd)}</td>
                    <td className="num amt">{fmtCurrency(r.missingUsd)}</td>
                    <td>
                      <div className="ldr-prog">
                        <div className="ldr-prog-track">
                          <div
                            className="ldr-prog-fill"
                            style={{ width: `${(r.pct * 100).toFixed(2)}%` }}
                          />
                        </div>
                        <span className="ldr-prog-pct">
                          {Math.round(r.pct * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2">
                      <span className="ft-lbl" style={{ margin: 0 }}>Total planned</span>
                      <span className="ft-v">{rows.reduce((s, r) => s + r.plannedTokens, 0).toFixed(6)}</span>
                      <span className="ft-sep" style={{ margin: 0 }}>/</span>
                      <span className="ft-v">
                        {fmtCurrency(rows.reduce((s, r) => s + r.plannedUsd, 0))}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <span className="ft-off" style={{ margin: 0 }}>Off-Plan</span>
                      <span className="ft-m">{/* placeholder */}{(0).toFixed(6)}</span>
                      <span className="ft-sep" style={{ margin: 0 }}>/</span>
                      <span className="ft-m">{fmtCurrency(0)}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
