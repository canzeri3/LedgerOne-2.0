'use client'

import { useState } from 'react'
import Link from 'next/link'
import { L1Nightsky, L1Grain, L1Icon, L1ClosingCTA, L1Footer } from '@/components/ledgerone'
import { useUser } from '@/lib/useUser'
import { useEntitlements } from '@/lib/useEntitlements'
import { startCheckout } from '@/lib/billing/checkout'
import type { CheckoutTier } from '@/lib/billing/plans'

type TierKey = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

/** Self-serve checkout tier for a pricing card, or null (Free / contact-sales). */
function checkoutTierForKey(key: TierKey): CheckoutTier | null {
  if (key === 'T1') return 'PLANNER'
  if (key === 'T2') return 'PORTFOLIO'
  if (key === 'T3') return 'DISCIPLINED'
  return null
}

type TierCard = {
  key: TierKey
  tier: string
  name: string
  price: string
  period?: string
  blurb: string
  features: { t: string; s: string; muted?: boolean }[]
  cta: string
  ctaHref: string
  recommended?: boolean
  future?: boolean
}

const TIERS: TierCard[] = [
  {
    key: 'T0',
    tier: 'TIER 0',
    name: 'LedgerOne Tracker',
    price: 'Free',
    blurb: 'Unlimited coin tracking and performance analytics — no planning tools.',
    features: [
      { t: 'Dashboard & portfolio analytics', s: 'Holdings, cost basis, P&L overview' },
      { t: 'Coin pages', s: 'Coin-specific analytics' },
      { t: 'Transaction ledger', s: 'Record buys / sells and track history' },
      { t: 'Planners locked', s: 'Planners + Portfolio Risk Metrics are locked', muted: true },
    ],
    cta: 'Open the tracker',
    ctaHref: '/dashboard',
  },
  {
    key: 'T1',
    tier: 'TIER 1',
    name: 'LedgerOne Standard',
    price: '$14.99',
    period: '/mo',
    blurb: 'Built for focused portfolios — structured planning across your core positions.',
    features: [
      { t: 'Buy Planner', s: 'Rules-based accumulation ladders' },
      { t: 'Sell Planner', s: 'Structured exits and cycle planning' },
      { t: 'Portfolio Risk Metrics', s: 'Exposure & risk insights unlocked' },
      { t: 'Planner assets cap', s: 'Buy / Sell plans for up to 5 coins' },
    ],
    cta: 'Request access',
    ctaHref: '/pricing',
  },
  {
    key: 'T2',
    tier: 'TIER 2',
    name: 'LedgerOne Diversified',
    price: '$29.99',
    period: '/mo',
    blurb: 'Built for diversified portfolios — structure planning across a broader set of assets.',
    features: [
      { t: 'Everything in Standard', s: 'All planning tools and portfolio visibility' },
      { t: 'Higher capacity', s: 'Up to 20 active planned coins (Buy + Sell)' },
    ],
    cta: 'Request access',
    ctaHref: '/pricing',
    recommended: true,
  },
  {
    key: 'T3',
    tier: 'TIER 3',
    name: 'LedgerOne Ultimate',
    price: '$45.00',
    period: '/mo',
    blurb: 'Built for scale — unlimited planning across your entire portfolio.',
    features: [
      { t: 'Everything in Standard', s: 'Planning + portfolio visibility included' },
      { t: 'Unlimited planned assets', s: 'No cap on active planned coins' },
      { t: 'Best for high conviction', s: 'A rules-based system across a full book' },
      { t: 'Same clean ledger', s: 'Tracking and history remain core' },
    ],
    cta: 'Request access',
    ctaHref: '/pricing',
  },
]

const FUTURE_TIER = {
  tier: 'TIER 4 · FUTURE',
  name: 'LedgerOne Strategy',
  blurb: 'A guided program to maximize the platform and leverage the LedgerOne methodology end to end.',
  features: [
    { t: 'Institutional framework', s: 'Institutional-grade methodology and standards' },
    { t: 'Planner inputs', s: 'Which inputs to use for specific assets' },
    { t: 'Budget allocation', s: 'How to set and adjust budgets per asset' },
    { t: 'Timing control', s: 'How to adapt inputs across market cycles' },
  ],
}

function tierKeyFromEntitlementsTier(tier?: string): TierKey | null {
  if (!tier) return null
  if (tier === 'PLANNER') return 'T1'
  if (tier === 'PORTFOLIO') return 'T2'
  if (tier === 'DISCIPLINED') return 'T3'
  if (tier === 'ADVISORY') return 'T4'
  return 'T0'
}

function tierRank(key: TierKey): number {
  return ['T0', 'T1', 'T2', 'T3', 'T4'].indexOf(key)
}

function PricingCard({
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
  let ctaLabel = tier.cta
  if (hasUser) {
    if (isCurrent) {
      ctaLabel = 'Current plan'
    } else if (currentKey) {
      ctaLabel = tierRank(tier.key) < tierRank(currentKey) ? 'Downgrade plan' : 'Upgrade plan'
    } else {
      ctaLabel = 'Upgrade plan'
    }
  } else {
    ctaLabel = tier.key === 'T0' ? 'Start free' : tier.cta
  }

  const ctaHref = !hasUser ? (tier.key === 'T0' ? '/signup' : '/signup') : tier.ctaHref
  const btnClass = 'l1-btn l1-pricing-cta ' + (isRecommended ? 'l1-btn-primary' : 'l1-btn-glass')

  // Signed-in users buying a self-serve paid tier go straight to Stripe Checkout.
  const checkoutTier = checkoutTierForKey(tier.key)
  const canCheckout = hasUser && !isCurrent && checkoutTier !== null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const onBuy = async () => {
    if (busy || !checkoutTier) return
    setBusy(true)
    setErr('')
    try {
      await startCheckout(checkoutTier)
    } catch (e: any) {
      setErr(e?.message || 'Checkout could not start.')
      setBusy(false)
    }
  }

  return (
    <div className={'l1-pricing-card' + (isRecommended ? ' is-recommended' : '')}>
      {isRecommended && <span className="l1-pricing-badge">Recommended</span>}
      <div className="l1-pricing-tier">{tier.tier}</div>
      <h3 className="l1-pricing-name">{tier.name}</h3>
      <div className="l1-pricing-price">
        <span className="amt">{tier.price}</span>
        {tier.period && <span className="per">{tier.period}</span>}
      </div>
      <p className="l1-pricing-blurb">{tier.blurb}</p>
      <ul className="l1-pricing-feats">
        {tier.features.map((f, i) => (
          <li key={i} className={'l1-pricing-feat' + (f.muted ? ' is-muted' : '')}>
            <span className="ck"><L1Icon name={f.muted ? 'lock' : 'check'} size={12} /></span>
            <div className="txt">
              <span className="t">{f.t}</span>
              <span className="s">{f.s}</span>
            </div>
          </li>
        ))}
      </ul>
      {isCurrent ? (
        <div className="l1-btn l1-btn-ghost l1-pricing-cta" style={{ opacity: 0.6, cursor: 'default', pointerEvents: 'none', justifyContent: 'center' }}>
          Current plan
        </div>
      ) : canCheckout ? (
        <button type="button" className={btnClass} onClick={onBuy} disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? 'Redirecting…' : ctaLabel} <L1Icon name="arrowRight" size={14} />
        </button>
      ) : (
        <Link href={ctaHref} className={btnClass}>
          {ctaLabel} <L1Icon name="arrowRight" size={14} />
        </Link>
      )}
      {err && <div style={{ marginTop: 10, fontSize: 12, color: '#E05B5B', textAlign: 'center' }}>{err}</div>}
    </div>
  )
}

export default function PricingPage() {
  const { user } = useUser()
  const { entitlements, loading: entLoading } = useEntitlements(user?.id)

  const currentKey = user && !entLoading ? tierKeyFromEntitlementsTier(entitlements?.tier) : null
  const showRecommended = !entLoading && (!user || currentKey === 'T0' || currentKey == null)

  return (
    <>
      <L1Nightsky />
      <L1Grain />

      {/* Page header */}
      <section className="l1-pageheader">
        <div className="l1-pageheader-aurora" />
        <div className="l1-wrap">
          <div className="l1-pageheader-inner">
            <div>
              <div className="l1-pageheader-eyebrow">Pricing · Plans &amp; access</div>
              <h1>Plans built for disciplined portfolio management.</h1>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'flex-end' }}>
              <p className="lead">
                Choose a tier by how many assets you want to actively plan.
                Tracking — holdings, cost basis, and performance — always stays
                free. Upgrade only when you want the planners working for you.
              </p>
              {!entLoading && user && currentKey && currentKey !== 'T0' && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>Current plan is marked below.</p>
              )}
              {!user && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <Link href="/login" className="l1-btn l1-btn-ghost">Sign in</Link>
                  <Link href="/signup" className="l1-btn l1-btn-primary">Start free <L1Icon name="arrowRight" size={14} /></Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Chrome divider */}
      <div className="l1-wrap" style={{ position: 'relative', zIndex: 1 }}>
        <div className="l1-chrome" />
      </div>

      {/* Pricing grid */}
      <section className="l1-section l1-pricing" style={{ paddingTop: 8, position: 'relative', zIndex: 1 }}>
        <div className="l1-wrap">
          <div className="l1-pricing-grid">
            {TIERS.map((tier) => (
              <PricingCard
                key={tier.key}
                tier={tier}
                currentKey={currentKey}
                hasUser={Boolean(user)}
                isCurrent={Boolean(currentKey && tier.key === currentKey)}
                isRecommended={Boolean(showRecommended && tier.recommended)}
              />
            ))}
          </div>

          {/* Future program banner */}
          <div className="l1-pricing-card l1-pricing-future">
            <div className="l1-pricing-future-lead">
              <div className="l1-pricing-tier">{FUTURE_TIER.tier}</div>
              <h3 className="l1-pricing-future-name">
                {FUTURE_TIER.name}
                <span className="soon">Coming soon</span>
              </h3>
              <p className="l1-pricing-blurb">{FUTURE_TIER.blurb}</p>
              <Link href="/contact" className="l1-btn l1-btn-glass l1-pricing-cta is-inline">
                Join the waitlist <L1Icon name="arrowRight" size={14} />
              </Link>
            </div>
            <ul className="l1-pricing-feats l1-pricing-future-feats">
              {FUTURE_TIER.features.map((f, i) => (
                <li key={i} className="l1-pricing-feat">
                  <span className="ck"><L1Icon name="check" size={12} /></span>
                  <div className="txt">
                    <span className="t">{f.t}</span>
                    <span className="s">{f.s}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <L1ClosingCTA
        title="Start free. Upgrade when the plan does."
        body="Track your whole portfolio at no cost. When you're ready to let the engine plan deployments and realizations, move up a tier — your history comes with you."
      />
      <L1Footer />
    </>
  )
}
