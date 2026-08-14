import type Stripe from 'stripe'
import { tierForPriceId } from '@/lib/billing/plans'
import type { SubscriptionStatus, Tier } from '@/lib/entitlements'

export type SubscriptionSnapshot = {
  tier: Tier
  status: SubscriptionStatus
  priceId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    case 'incomplete':
    case 'paused':
    default:
      return 'inactive'
  }
}

export function isTerminalStripeStatus(status: Stripe.Subscription.Status): boolean {
  return status === 'canceled' || status === 'incomplete_expired'
}

export function subscriptionUsedTrial(sub: Stripe.Subscription): boolean {
  return Boolean(sub.trial_start || sub.metadata?.ledgerone_trial === 'true')
}

export function snapshotFromSubscription(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id ?? null
  const isEntitled = sub.status === 'active' || sub.status === 'trialing'
  const mappedTier = tierForPriceId(priceId)

  if (isEntitled && mappedTier === 'FREE') {
    throw new Error(`Unknown Stripe price on entitled subscription ${sub.id}`)
  }

  return {
    tier: isEntitled ? mappedTier : 'FREE',
    status: mapStripeSubscriptionStatus(sub.status),
    priceId,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    // Flexible billing mode uses `cancel_at`; classic mode uses
    // `cancel_at_period_end`. Normalize both into the app's single flag.
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  }
}
