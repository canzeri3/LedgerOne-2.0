'use client'

import Link from 'next/link'

import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'

type TierKey = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

type TierCard = {
  key: TierKey
  badge: string
  title: string
  priceLabel: string
  designedFor?: string
  tagline?: string
  access?: string[]
  unlocks?: string[]
  limits?: string[]
  positioning?: string
  note?: string
  ctaLabel: string
  ctaHref: string
  secondaryCtaLabel?: string
  secondaryCtaHref?: string
  highlight?: 'none' | 'recommended'
}


const TIERS: TierCard[] = [
  {
    key: 'T0',
    badge: 'Tier 0 · Free',
    title: 'LedgerOne Tracker',
    priceLabel: 'Free',
    designedFor: 'Trust + funnel',
    tagline: 'Track your portfolio. Keep the record clean.',
    access: [
      'Dashboard',
      'Portfolio overview',
      'Coin pages',
      'Holdings, cost basis, P&L',
      'Transaction history',
    ],
    limits: ['Unlimited assets (tracking only)', 'No planners', 'No execution cues', 'No adherence metrics'],
    positioning: "Track what you’ve done. Plan what you’ll do next.",
    ctaLabel: 'Start free',
    ctaHref: '/signup',
    secondaryCtaLabel: 'Sign in',
    secondaryCtaHref: '/login',
    highlight: 'none',
  },
  {
    key: 'T1',
    badge: 'Tier 1',
    title: 'LedgerOne Planner',
    priceLabel: '$19/mo (intro) → $29/mo later',
    designedFor: 'Focused portfolios',
    tagline: 'Pre-commit a plan and execute with discipline.',
    unlocks: [
      'Buy planner',
      'Sell planner',
      'Risk profile selection',
      'Pre-committed plans',
      'Execution cues',
      'Plan vs actual comparison',
    ],
    limits: ['Designed for focused portfolios (up to 5 planned assets).', 'Tracking remains unlimited.'],
    ctaLabel: 'Upgrade to Planner',
    ctaHref: '#',
    secondaryCtaLabel: 'Compare tiers',
    secondaryCtaHref: '#compare',
    highlight: 'none',
  },
  {
    key: 'T2',
    badge: 'Tier 2',
    title: 'LedgerOne Portfolio',
    priceLabel: '$39/mo',
    designedFor: 'Diversified investors',
    tagline: 'Structure across multiple assets, with stronger visibility.',
    unlocks: ['Everything in Planner', 'Multi-asset planning', 'Cross-portfolio visibility', 'Stronger alerts'],
    limits: ['Up to 20 planned assets.', 'Tracking remains unlimited.'],
    positioning: 'Built for diversified portfolios that require structure across multiple assets.',
    note: 'This is the tier most serious users grow into.',
    ctaLabel: 'Upgrade to Portfolio',
    ctaHref: '#',
    secondaryCtaLabel: 'Compare tiers',
    secondaryCtaHref: '#compare',
    highlight: 'recommended',
  },
  {
    key: 'T3',
    badge: 'Tier 3',
    title: 'LedgerOne Disciplined',
    priceLabel: '$59/mo',
    designedFor: 'High-conviction, long-term allocators',
    tagline: 'Measurement and accountability, not just capacity.',
    unlocks: [
      'Unlimited planned assets',
      'Plan adherence metrics',
      'Deviation tracking',
      'Cycle summaries',
      'Historical plan comparisons',
      'Accountability views',
    ],
    note: 'This tier introduces behavior measurement — not just more capacity. That’s why it costs more.',
    ctaLabel: 'Upgrade to Disciplined',
    ctaHref: '#',
    secondaryCtaLabel: 'Compare tiers',
    secondaryCtaHref: '#compare',
    highlight: 'none',
  },
  {
    key: 'T4',
    badge: 'Tier 4 · Future',
    title: 'LedgerOne Advisory Mode',
    priceLabel: 'Pricing not shown',
    designedFor: 'Future (do not ship yet)',
    tagline: 'Read-only access and audit-grade reporting.',
    unlocks: [
      'Advisor / accountant read-only access',
      'Exportable reports',
      'Audit trails',
      'Multi-user visibility',
    ],
    limits: ['Only ship when: users ask, institutions approach you, and compliance is clear.'],
    ctaLabel: 'Learn more',
    ctaHref: '#',
    highlight: 'none',
  },
]

function BulletList({ items }: { items?: string[] }) {
  if (!items?.length) return null
  return (
    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-slate-300">
      {items.map((x) => (
        <li key={x} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
          <span className="leading-5">{x}</span>
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
      {children}
    </p>
  )
}

function tierKeyFromEntitlementsTier(tier?: string): TierKey | null {
  if (!tier) return null
  if (tier === 'PLANNER') return 'T1'
  if (tier === 'PORTFOLIO') return 'T2'
  if (tier === 'DISCIPLINED') return 'T3'
  // FREE (and all non-paid states) map to Tier 0
  return 'T0'
}

function TierCardView({
  tier,
  isCurrent,
  isRecommended,
}: {
  tier: TierCard
  isCurrent: boolean
  isRecommended: boolean
}) {
  const isHighlighted = isCurrent || isRecommended

  const outer = 'relative rounded-3xl border bg-[#1f2021] p-4 sm:p-5 shadow-2xl shadow-black/40'
  const border = isHighlighted ? 'border-indigo-500/50' : 'border-slate-800/80'

  const glow = isHighlighted
    ? 'before:absolute before:inset-0 before:rounded-3xl before:bg-indigo-500/10 before:blur-2xl before:content-[""]'
    : ''

  return (
    <div className={`${outer} ${border} ${glow}`}>
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-slate-700/70 bg-[#151618] px-3 py-1 text-[11px] font-medium text-slate-300">
                {tier.badge}
              </div>

              {isCurrent && (
                <div className="inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-200">
                  Current plan
                </div>
              )}
              {isRecommended && !isCurrent && (
  <div className="inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-200">
    Recommended
  </div>
)}

            </div>

            <h2 className="mt-3 text-lg font-semibold text-slate-50">{tier.title}</h2>

            {tier.designedFor && <p className="mt-1 text-sm text-slate-400">Designed for: {tier.designedFor}</p>}

            {tier.tagline && <p className="mt-2 text-[13px] text-slate-300 leading-5">{tier.tagline}</p>}
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-slate-50">{tier.priceLabel}</p>
            <p className="mt-1 text-[11px] text-slate-500">Billed monthly</p>
          </div>
        </div>

        {tier.access?.length ? (
          <>
            <SectionLabel>Access</SectionLabel>
            <BulletList items={tier.access} />
          </>
        ) : null}

        {tier.unlocks?.length ? (
          <>
            <SectionLabel>Unlocks</SectionLabel>
            <BulletList items={tier.unlocks} />
          </>
        ) : null}

        {tier.limits?.length ? (
          <>
            <SectionLabel>Limits</SectionLabel>
            <BulletList items={tier.limits} />
          </>
        ) : null}

        {tier.positioning ? (
          <div className="mt-5 rounded-2xl border border-slate-800/80 bg-[#151618] p-4">
            <p className="text-sm text-slate-300 leading-6">{tier.positioning}</p>
          </div>
        ) : null}

        {tier.note ? <p className="mt-4 text-sm text-slate-400 leading-6">{tier.note}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          {isCurrent ? (
            <div className="inline-flex items-center justify-center rounded-full bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-200 ring-1 ring-inset ring-indigo-500/30">
              Current plan
            </div>
          ) : (
            <Link
              href={tier.ctaHref}
              className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[#151618] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[#252628]"
            >
              {tier.ctaLabel}
            </Link>
          )}

          {tier.secondaryCtaLabel && tier.secondaryCtaHref ? (
            <Link
              href={tier.secondaryCtaHref}
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              {tier.secondaryCtaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function PricingPage() {
  const { user } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

const hasPaidPlan =
  !!user && !entLoading && !!entitlements?.canUsePlanners && entitlements?.status === 'active'

// Only highlight "Current plan" once the user actually has a plan.
// For FREE / no-plan users, we highlight only the recommended tier.
const currentKey = hasPaidPlan ? tierKeyFromEntitlementsTier(entitlements?.tier) : null

// Use the tier in TIERS marked as recommended (fallback to Tier 1 if none is marked)
const recommendedKey = TIERS.find((t) => t.highlight === 'recommended')?.key ?? 'T1'

// Recommended is shown only when the user has no active plan
const showRecommended = !hasPaidPlan

  return (
    <div className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-6">
      {/* Top header */}
      <div className="mb-6 rounded-3xl border border-slate-800/80 bg-[#151618] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Price · Plans & access
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50">
              Plans built for disciplined portfolio management.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 leading-6">
              Choose your tier based on how many assets you want to actively plan. Tracking remains available for free.
            </p>

      {user && currentKey ? (
  <p className="mt-3 text-[12px] text-slate-400">
    Current plan is highlighted below.
  </p>
) : user && showRecommended ? (
  <p className="mt-3 text-[12px] text-slate-400">
    Recommended plan is highlighted below.
  </p>
) : null}

          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[#1f2021] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[#252628]"
            >
              Go to dashboard
            </Link>

            {!user ? (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[#1f2021] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[#252628]"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-indigo-500/90 px-4 py-2 text-xs font-medium text-slate-50 shadow shadow-indigo-500/30 transition hover:bg-indigo-400"
                >
                  Start free
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {TIERS.filter((t) => t.key === 'T0' || t.key === 'T1' || t.key === 'T2').map((tier) => (
<TierCardView
  key={tier.key}
  tier={tier}
  isCurrent={Boolean(currentKey && tier.key === currentKey)}
  isRecommended={Boolean(showRecommended && tier.key === recommendedKey)}
/>
        ))}
      </div>

      {/* Bottom two tiers centered as a pair */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:justify-center">
        {TIERS.filter((t) => t.key === 'T3' || t.key === 'T4').map((tier) => (
          <div key={tier.key} className="w-full lg:w-[380px]">
<TierCardView
  tier={tier}
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
