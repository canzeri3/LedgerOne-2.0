'use client'

import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'

type Props = {
  compact?: boolean
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-indigo-200" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 .006 1.415l-7.2 7.25a1 1 0 0 1-1.42.003L3.29 9.16a1 1 0 1 1 1.415-1.414l3.09 3.09 6.494-6.54a1 1 0 0 1 1.415-.006Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-300" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.5 8V6.5a4.5 4.5 0 1 1 9 0V8h.5A2.5 2.5 0 0 1 17.5 10.5v5A2.5 2.5 0 0 1 15 18H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 8h.5Zm2 0h5V6.5a2.5 2.5 0 0 0-5 0V8Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function tierMeta(tier?: string) {
  switch (tier) {
    case 'PLANNER':
      return { badge: 'Tier 1', name: 'LedgerOne Planner' }
    case 'PORTFOLIO':
      return { badge: 'Tier 2', name: 'LedgerOne Portfolio' }
    case 'DISCIPLINED':
      return { badge: 'Tier 3', name: 'LedgerOne Disciplined' }
    case 'FREE':
    default:
      return { badge: 'Tier 0 · Free', name: 'LedgerOne Tracker' }
  }
}

export default function PlannerPaywallCard({ compact }: Props) {
  const { user } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  const currentTier = entitlements?.tier ?? (user ? 'FREE' : undefined)
  const meta = tierMeta(currentTier)

  const outer = 'relative overflow-hidden rounded-3xl border border-slate-800/80 bg-[#151618] shadow-2xl shadow-black/40'
  const glow = 'pointer-events-none absolute -top-10 left-1/2 h-40 w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl'

  const pill =
    'inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-[#1f2021] px-3 py-1 text-[11px] font-medium text-slate-300'

  const title = compact ? 'Planner tools are locked on your current plan' : 'Planners are part of paid tiers'
  const subtitle = compact
    ? 'Upgrade to unlock structured buy/sell planning.'
    : 'Unlock structured planning, execution cues, and plan-vs-actual comparisons.'

  const primaryCta =
    'inline-flex items-center justify-center rounded-full bg-indigo-500/90 px-4 py-2 text-xs font-medium text-slate-50 shadow shadow-indigo-500/30 transition hover:bg-indigo-400'
  const secondaryCta =
    'inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[#1f2021] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[#252628]'

  return (
    <section className={outer}>
      <div className={glow} />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={pill}>
                <LockIcon />
                <span>Tier 1+ required</span>
              </div>

              {/* Current tier shown here */}
              <div className="inline-flex items-center rounded-full border border-slate-700/70 bg-[#1f2021] px-3 py-1 text-[11px] font-medium text-slate-200">
                Current: {entLoading && user ? 'Checking…' : `${meta.badge} · ${meta.name}`}
              </div>

              {/* Optional usage hint when we have it */}
              {user && !entLoading && entitlements?.plannedAssetsLimit != null && entitlements?.plannedAssetsLimit > 0 ? (
                <div className="inline-flex items-center rounded-full border border-slate-700/70 bg-[#1f2021] px-3 py-1 text-[11px] font-medium text-slate-300">
                  Planned assets: {entitlements.plannedAssetsUsed}/{entitlements.plannedAssetsLimit}
                </div>
              ) : null}
            </div>

            <h2 className={clsx('mt-3 text-slate-50', compact ? 'text-lg font-semibold' : 'text-xl font-semibold')}>
              {title}
            </h2>

            <p className={clsx('mt-2 text-slate-400 leading-6', compact ? 'text-sm' : 'text-sm')}>
              {subtitle}
            </p>
          </div>

          {!compact && (
            <div className="shrink-0 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">LedgerOne</div>
              <div className="mt-1 text-sm font-semibold text-slate-50">Planner</div>
              <div className="mt-1 text-[11px] text-slate-500">Designed for structure</div>
            </div>
          )}
        </div>

        <div className={clsx('mt-5 grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
          <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Tier 1 — LedgerOne Planner
            </p>
            <p className="mt-2 text-sm text-slate-200">Designed for focused portfolios (up to 5 planned assets).</p>

            {!compact && (
              <ul className="mt-3 space-y-2 text-[13px] text-slate-300">
                <li className="flex gap-2">
                  <CheckIcon />
                  <span>Buy planner + sell planner</span>
                </li>
                <li className="flex gap-2">
                  <CheckIcon />
                  <span>Risk profile selection + pre-committed plans</span>
                </li>
                <li className="flex gap-2">
                  <CheckIcon />
                  <span>Execution cues + plan vs actual</span>
                </li>
              </ul>
            )}
          </div>

          {!compact && (
            <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">What stays free</p>
              <p className="mt-2 text-sm text-slate-200">Tracking remains unlimited.</p>
              <ul className="mt-3 space-y-2 text-[13px] text-slate-300">
                <li className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                  <span>Holdings, cost basis, P&amp;L</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                  <span>Transaction history</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                  <span>Dashboard + coin pages</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className={clsx('mt-5 flex flex-col gap-2', compact ? 'sm:flex-row' : '')}>
          <Link href="/pricing" className={primaryCta}>
            View plans
          </Link>
          <Link href="/dashboard" className={secondaryCta}>
            Back to dashboard
          </Link>
        </div>

        <div className="mt-4 text-[11px] text-slate-500 leading-5">
          Your current plan is shown above. Upgrades and billing wiring come next, without changing planner logic.
        </div>
      </div>
    </section>
  )
}
