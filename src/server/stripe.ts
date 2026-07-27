import Stripe from 'stripe'

/**
 * Server-only Stripe client. Never import this from client components.
 * The secret key lives in STRIPE_SECRET_KEY (never NEXT_PUBLIC_*).
 */

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  // Pin nothing here — use the account's default API version to avoid
  // type drift between SDK releases.
  _stripe = new Stripe(key)
  return _stripe
}
