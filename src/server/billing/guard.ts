/**
 * Environment sanity check for Stripe keys.
 *
 * Guards the two classic launch mistakes:
 *   1. Deploying to production while still using test keys (no real money moves).
 *   2. Running locally against LIVE keys (real cards get charged during dev).
 *
 * Logs loudly on the server; never throws, so it can't take the app down.
 */

let checked = false

export function assertStripeKeyMode(): void {
  if (checked) return
  checked = true

  const secret = process.env.STRIPE_SECRET_KEY ?? ''
  const isProd = process.env.NODE_ENV === 'production'
  const isLiveKey = secret.startsWith('sk_live_')
  const isTestKey = secret.startsWith('sk_test_')

  if (!secret) {
    console.error('[billing] STRIPE_SECRET_KEY is not set — checkout and the billing portal will fail.')
    return
  }

  if (isProd && isTestKey) {
    console.error(
      '[billing] ⚠ PRODUCTION is running with a TEST Stripe key (sk_test_). ' +
        'Customers can "subscribe" but no real payment is taken. Set live keys in your host env.'
    )
  }

  if (!isProd && isLiveKey) {
    console.error(
      '[billing] ⚠ LOCAL/DEV is running with a LIVE Stripe key (sk_live_). ' +
        'Real cards will be charged. Switch .env.local back to sk_test_.'
    )
  }

  // Price IDs must be present or checkout 500s at click time.
  const missing = (
    [
      ['STRIPE_PRICE_STANDARD', process.env.STRIPE_PRICE_STANDARD],
      ['STRIPE_PRICE_DIVERSIFIED', process.env.STRIPE_PRICE_DIVERSIFIED],
      ['STRIPE_PRICE_ULTIMATE', process.env.STRIPE_PRICE_ULTIMATE],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k)

  if (missing.length) {
    console.error(`[billing] Missing price env vars: ${missing.join(', ')} — those tiers cannot be purchased.`)
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[billing] STRIPE_WEBHOOK_SECRET is not set — webhooks will be rejected and plans will never activate.')
  }
}
