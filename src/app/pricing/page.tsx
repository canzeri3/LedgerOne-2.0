'use client'

import Link from 'next/link'

import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'

type TierKey = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

type TierPoint = {
  title: string
  desc: string
}

type TierCard = {
  key: TierKey
  badge: string // small label (e.g. "Tier 1")
  title: string // big name
  priceMain: string // big price (e.g. "$39" or "Free")
  priceSub?: string // small suffix (e.g. "/month")
  description: string // quick general description under the price
  points: TierPoint[] // bullet rows (title + small desc)
  ctaHref: string // where the CTA goes (wiring later)
  highlight?: 'none' | 'recommended'
  future?: boolean
}

const TIERS: TierCard[] = [
  {
    key: 'T0',
    badge: 'Tier 0',
    title: 'LedgerOne Tracker',
    priceMain: 'Free',
    description: 'Unlimited coin tracking and performance analytics — no planning tools.',
    points: [
      { title: 'Dashboard & Portfolio Analytics', desc: 'Holdings, cost basis, P&L overview' },
{ title: 'Coin pages', desc: 'Coin-specific analytics' },
      { title: 'Transaction ledger', desc: 'Record buys/sells and track history' },
      { title: 'Locked features', desc: 'Planners + Portfolio Risk Metrics are locked' },
    ],
    ctaHref: '/signup',
    highlight: 'none',
  },
  {
    key: 'T1',
    badge: 'Tier 1',
    title: 'LedgerOne Standard',
    priceMain: '$19',
    priceSub: '/month',
description: 'Built for focused portfolios — Structured planning across your core positions.',
    points: [
      { title: 'Buy Planner', desc: 'Rules-based accumulation ladders' },
      { title: 'Sell Planner', desc: 'Structured exits and cycle planning' },
      { title: 'Portfolio Risk Metrics', desc: 'Exposure & risk insights unlocked' },
{ title: 'Planner assets cap', desc: 'Buy / Sell plans for up to 5 coins' },
    ],
    ctaHref: '#compare',
    highlight: 'none',
  },
  {
    key: 'T2',
    badge: 'Tier 2',
    title: 'LedgerOne Diversified',
    priceMain: '$39',
    priceSub: '/month',
    description: 'Built for diversified portfolios — Structure planning across a broader set of assets.',
    points: [
{ title: 'Everything in Standard', desc: 'All planning tools and portfolio visibility included' },
      { title: 'Higher capacity', desc: 'Up to 20 active planned coins (Buy + Sell)' },
],

    ctaHref: '#compare',
    highlight: 'recommended',
  },
  {
    key: 'T3',
    badge: 'Tier 3',
title: 'LedgerOne Ultimate',
    priceMain: '$59',
    priceSub: '/month',
    description: 'Built for scale — Unlimited planning across your entire portfolio.',
    points: [
 { title: 'Everything in Standard', desc: 'Planning + portfolio visibility included' },
  { title: 'Unlimited planned assets', desc: 'No cap on active planned coins' },
  { title: 'Best for high conviction', desc: 'Scale a rules-based system across a full portfolio' },
  { title: 'Same clean ledger', desc: 'Tracking and history remain core to the process' },
    ],
    ctaHref: '#compare',
    highlight: 'none',
  },
{
  key: 'T4',
  badge: 'Tier 4 (Future)',
  title: 'LedgerOne Strategy',
priceMain: 'Coming Soon',
description: 'A guided program to maximize the platform and leverage the LedgerOne methodology.',
points: [
  { title: 'Institutional Framework', desc: 'Institutional-grade methodology and standards' },
  { title: 'Planner inputs', desc: 'Which inputs to use for specific assets' },
  { title: 'Budget allocation', desc: 'How to set and adjust budgets per asset' },
  { title: 'Timing control', desc: 'How to adapt inputs across market cycles' },
],
  ctaHref: '#compare',
  highlight: 'none',
  future: true,
},

]

function tierKeyFromEntitlementsTier(tier?: string): TierKey | null {
  if (!tier) return null
  if (tier === 'PLANNER') return 'T1'
  if (tier === 'PORTFOLIO') return 'T2'
  if (tier === 'DISCIPLINED') return 'T3'
  if (tier === 'ADVISORY') return 'T4'
  return 'T0'
}

function tierRank(key: TierKey): number {
  if (key === 'T0') return 0
  if (key === 'T1') return 1
  if (key === 'T2') return 2
  if (key === 'T3') return 3
  return 4
}

function TierCardView({
  tier,
  isCurrent,
  isRecommended,
  currentKey,
  hasUser,
}: {
  tier: TierCard
  isCurrent: boolean
  isRecommended: boolean
  currentKey: TierKey | null
  hasUser: boolean
}) {
  // Your site purple (RGB 114,108,172) — subtle, not loud
  const PURPLE_A = 'rgba(114,108,172,0.85)'
  const PURPLE_B = 'rgba(114,108,172,0.45)'
  const PURPLE_SOFT = 'rgba(114,108,172,0.18)'

  const showRibbon = isRecommended || isCurrent

// Always show a small "Recommended" chip on LedgerOne Portfolio (Tier 2)
const showSmallRecommendedChip = tier.key === 'T2'
  const ribbonLabel = isCurrent ? 'CURRENT' : 'POPULAR'

  // CTA label rules: Current / Upgrade / Downgrade
  let ctaLabel = 'Get started'
  if (!hasUser) {
    ctaLabel = tier.key === 'T0' ? 'Start free' : 'Get started'
  } else if (isCurrent) {
    ctaLabel = 'Current plan'
  } else if (currentKey) {
    const cur = tierRank(currentKey)
    const next = tierRank(tier.key)
    ctaLabel = next < cur ? 'Downgrade plan' : 'Upgrade plan'
  } else {
    // user exists but entitlements not resolved (rare) — default to upgrade wording
    ctaLabel = 'Upgrade plan'
  }

  const ctaHref = !hasUser ? (tier.key === 'T0' ? '/signup' : '/signup') : tier.ctaHref

  // Card accent intensity
  const frameShadow =
    isCurrent || isRecommended
      ? 'hover:shadow-[0_25px_80px_-30px_rgba(114,108,172,0.35)]'
      : 'hover:shadow-black/30'

  return (
    <div className="group relative w-full max-w-[360px]">
     <div
  className={[
    'relative overflow-hidden rounded-2xl bg-gradient-to-b from-[rgb(28,29,31)] to-[rgb(42,43,44)] p-[1px] shadow-2xl transition-all duration-300',
    'hover:-translate-y-1',
    frameShadow,
    // Current-plan glow ring
isCurrent ? 'ring-[10px] ring-inset ring-[rgba(114,108,172,0.70)]' : '',
  ].join(' ')}
>

{isCurrent && (
  <div
    className="absolute inset-0 opacity-45"
    style={{
      boxShadow:
        '0 0 0 3px rgba(114,108,172,0.34) inset, 0 0 70px rgba(114,108,172,0.40), 0 0 26px rgba(114,108,172,0.28)',
    }}
  />
)}



<div
  className="absolute inset-0 opacity-20"
  style={{
    background: `linear-gradient(180deg, ${PURPLE_A}, ${PURPLE_B})`,
  }}
/>


<div className="relative rounded-2xl bg-gradient-to-b from-[rgb(28,29,31)] to-[rgb(42,43,44)] p-5">
          {/* glow orbs */}
          <div
            className="absolute -left-16 -top-16 h-32 w-32 rounded-full blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-70"
            style={{
              background: `linear-gradient(135deg, ${PURPLE_SOFT}, rgba(114,108,172,0))`,
            }}
          />
          <div
            className="absolute -bottom-16 -right-16 h-32 w-32 rounded-full blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-70"
            style={{
              background: `linear-gradient(135deg, ${PURPLE_SOFT}, rgba(114,108,172,0))`,
            }}
          />

          {/* corner ribbon */}
{showRibbon && (
  <div className="absolute -right-[1px] -top-[1px] overflow-hidden rounded-tr-2xl">
    <div
      className="absolute h-20 w-20"
      style={{
        background: `linear-gradient(90deg, ${PURPLE_A}, ${PURPLE_B})`,
      }}
    />
    <div className="absolute h-20 w-20 bg-[rgba(28,29,31,0.92)]" />
    <div
      className="absolute right-0 top-[22px] h-[2px] w-[56px] rotate-45"
      style={{
        background: `linear-gradient(90deg, ${PURPLE_A}, ${PURPLE_B})`,
      }}
    />
    <span className="absolute right-1 top-1 text-[10px] font-semibold text-white">{ribbonLabel}</span>
  </div>
)}

{showSmallRecommendedChip && !showRibbon && (
  <div className="absolute right-3 top-3 z-20">
    <span
      className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide text-slate-100"
      style={{
        background: 'rgba(114,108,172,0.16)',
        border: '1px solid rgba(114,108,172,0.30)',
      }}
    >
      Recommended
    </span>
  </div>
)}

          {/* Header: name large, price large, description */}
          <div className="relative">
            <h3
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'rgba(114,108,172,0.95)' }}
            >
              {tier.badge}
            </h3>

            <div className="mt-2">
              <div className="text-lg font-semibold text-white">{tier.title}</div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{tier.priceMain}</span>
                {tier.priceSub ? <span className="text-sm text-slate-400">{tier.priceSub}</span> : null}
              </div>

              <p className="mt-2 text-sm text-slate-400 leading-6">{tier.description}</p>
            </div>
          </div>

          {/* Bullet rows */}
<div className="relative mt-5 space-y-3">
  {Array.from({ length: 4 }).map((_, i) => {
    const p = tier.points[i]
    const isEmpty = !p

    return (
      <div
        key={p?.title ?? `empty-${i}`}
        className={['flex items-start gap-3', isEmpty ? 'opacity-0 pointer-events-none select-none' : ''].join(' ')}
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(114,108,172,0.10)' }}
        >
          <svg
            stroke="currentColor"
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4"
            style={{ color: 'rgba(114,108,172,0.95)' }}
          >
            <path
              d="M5 13l4 4L19 7"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium text-white leading-5">{p?.title ?? '—'}</p>
          <p className="text-xs text-slate-400 leading-5">{p?.desc ?? '—'}</p>
        </div>
      </div>
    )
  })}
</div>

          {/* CTA: current/upgrade/downgrade */}
          <div className="relative mt-6">
            {isCurrent ? (
              <div
                className="w-full rounded-xl p-px font-semibold text-white"
                style={{ background: `linear-gradient(90deg, ${PURPLE_A}, ${PURPLE_B})` }}
              >
<div className="relative rounded-xl bg-[rgba(28,29,31,0.72)] px-4 py-3 text-center text-xs">
                  Current plan
                </div>
              </div>
            ) : (
              <Link
                href={ctaHref}
                className="group/btn relative block w-full overflow-hidden rounded-xl p-px font-semibold text-white transition-colors"
                style={{ background: `linear-gradient(90deg, ${PURPLE_A}, ${PURPLE_B})` }}
              >
<div className="relative rounded-xl bg-[rgba(28,29,31,0.68)] px-4 py-3 transition-colors group-hover/btn:bg-transparent">
                  <span className="relative flex items-center justify-center gap-2 text-xs">
                    {tier.future ? 'Learn more' : ctaLabel}
                    <svg
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1"
                    >
                      <path
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PricingPage() {
  const { user } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  // Current tier reflects effective entitlements tier (includes admin override + trialing)
  const currentKey = user && !entLoading ? tierKeyFromEntitlementsTier(entitlements?.tier) : null

  const recommendedKey = TIERS.find((t) => t.highlight === 'recommended')?.key ?? 'T2'
  const showRecommended = !entLoading && (!user || currentKey === 'T0' || currentKey == null)

  return (
    <div className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-6">
      {/* Top header */}
      <div className="mb-6 group relative">
<div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[rgb(28,29,31)] to-[rgb(42,43,44)] p-[1px] shadow-2xl transition-all duration-300">
    <div
      className="absolute inset-0 opacity-20"
      style={{
        background: 'linear-gradient(180deg, rgba(114,108,172,0.85), rgba(114,108,172,0.45))',
      }}
    />

    <div className="relative rounded-2xl bg-gradient-to-b from-[rgb(28,29,31)] to-[rgb(42,43,44)] p-5 sm:p-6">
      {/* subtle glow orbs */}
      <div
        className="absolute -left-16 -top-16 h-32 w-32 rounded-full blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-70"
        style={{
          background: 'linear-gradient(135deg, rgba(114,108,172,0.18), rgba(114,108,172,0))',
        }}
      />
      <div
        className="absolute -bottom-16 -right-16 h-32 w-32 rounded-full blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-70"
        style={{
          background: 'linear-gradient(135deg, rgba(114,108,172,0.18), rgba(114,108,172,0))',
        }}
      />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Price · Plans &amp; access
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50">
            Plans built for disciplined portfolio management.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 leading-6">
            Choose your tier based on how many assets you want to actively plan. Tracking remains available for free.
          </p>

          {!entLoading && user && currentKey && currentKey !== 'T0' ? (
            <p className="mt-3 text-[12px] text-slate-400">Current plan is marked below.</p>
          ) : !entLoading && user && currentKey === 'T0' ? (
            <p className="mt-3 text-[12px] text-slate-400">You’re on Free. Recommended plan is marked below.</p>
          ) : !entLoading && showRecommended ? (
            <p className="mt-3 text-[12px] text-slate-400">Recommended plan is marked below.</p>
          ) : null}
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[rgb(42,43,44)] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[rgb(54,55,56)]"
          >
            Go to dashboard
          </Link>

          {!user ? (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[rgb(42,43,44)] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[rgb(54,55,56)]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium text-slate-50 shadow transition"
                style={{
                  background: 'linear-gradient(90deg, rgba(114,108,172,0.85), rgba(114,108,172,0.45))',
                  boxShadow: '0 10px 30px -18px rgba(114,108,172,0.55)',
                }}
              >
                Start free
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  </div>
</div>


      {/* Tier cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {TIERS.filter((t) => t.key === 'T0' || t.key === 'T1' || t.key === 'T2').map((tier) => (
          <div key={tier.key} className="flex justify-center">
            <TierCardView
              tier={tier}
              currentKey={currentKey}
              hasUser={Boolean(user)}
              isCurrent={Boolean(currentKey && tier.key === currentKey)}
              isRecommended={Boolean(showRecommended && tier.key === recommendedKey)}
            />
          </div>
        ))}
      </div>

      {/* Bottom two tiers centered as a pair */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:justify-center">
        {TIERS.filter((t) => t.key === 'T3' || t.key === 'T4').map((tier) => (
          <div key={tier.key} className="flex justify-center w-full lg:w-[380px]">
            <TierCardView
              tier={tier}
              currentKey={currentKey}
              hasUser={Boolean(user)}
              isCurrent={Boolean(currentKey && tier.key === currentKey)}
              isRecommended={Boolean(showRecommended && tier.key === recommendedKey)}
            />
          </div>
        ))}
      </div>

      <div id="compare" className="mt-8 rounded-2xl border border-slate-800/80 bg-[#151618] p-4">
        <p className="text-xs text-slate-400 leading-6">
          Note: This page describes plan scope and access. Billing, upgrades, and paywall enforcement will be wired in next.
        </p>
      </div>
    </div>
  )
}
