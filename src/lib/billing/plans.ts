import type { Tier } from '@/lib/entitlements'

/**
 * Maps LedgerOne tiers <-> Stripe Price IDs.
 * Price IDs come from env so test and live modes can differ without a code change.
 * Only the three self-serve paid tiers are checkout-able; FREE and ADVISORY are not.
 */

export type CheckoutTier = 'PLANNER' | 'PORTFOLIO' | 'DISCIPLINED'

export const CHECKOUT_TIERS: CheckoutTier[] = ['PLANNER', 'PORTFOLIO', 'DISCIPLINED']

export function priceIdForTier(tier: CheckoutTier): string | null {
  switch (tier) {
    case 'PLANNER':
      return process.env.STRIPE_PRICE_STANDARD ?? null
    case 'PORTFOLIO':
      return process.env.STRIPE_PRICE_DIVERSIFIED ?? null
    case 'DISCIPLINED':
      return process.env.STRIPE_PRICE_ULTIMATE ?? null
    default:
      return null
  }
}

/** Reverse lookup: which tier does a given Stripe Price ID grant. */
export function tierForPriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return 'FREE'
  if (priceId === process.env.STRIPE_PRICE_STANDARD) return 'PLANNER'
  if (priceId === process.env.STRIPE_PRICE_DIVERSIFIED) return 'PORTFOLIO'
  if (priceId === process.env.STRIPE_PRICE_ULTIMATE) return 'DISCIPLINED'
  return 'FREE'
}

export function isCheckoutTier(tier: string): tier is CheckoutTier {
  return tier === 'PLANNER' || tier === 'PORTFOLIO' || tier === 'DISCIPLINED'
}
