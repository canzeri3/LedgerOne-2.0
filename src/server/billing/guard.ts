/**
 * Environment sanity check for Stripe keys.
 *
 * Guards the two classic launch mistakes:
 *   1. Deploying to production while still using test keys (no real money moves).
 *   2. Running locally against LIVE keys (real cards get charged during dev).
 *
 * Development logs configuration mistakes. Production fails closed so a
 * deployment can never silently accept test payments or skip activation.
 */

let checked = false

export function assertStripeKeyMode(): void {
  if (checked) return

  const secret = process.env.STRIPE_SECRET_KEY ?? ''
  // Vercel preview builds also use NODE_ENV=production, but must be allowed to
  // exercise Stripe sandbox mode. Only the production deployment requires a
  // live key. Outside Vercel, NODE_ENV remains the fallback signal.
  const isProd = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === 'production'
    : process.env.NODE_ENV === 'production'
  const isLiveKey = secret.startsWith('sk_live_')
  const isTestKey = secret.startsWith('sk_test_')
  const errors: string[] = []

  if (!secret) {
    errors.push('STRIPE_SECRET_KEY is not set')
  }

  if (isProd && isTestKey) {
    errors.push('production is using a test Stripe key')
  }
  if (isProd && secret && !isLiveKey) {
    errors.push('production STRIPE_SECRET_KEY is not a recognized live key')
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
    errors.push(`missing price env vars: ${missing.join(', ')}`)
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    errors.push('STRIPE_WEBHOOK_SECRET is not set')
  }

  const invalidPrices = [
    ['STRIPE_PRICE_STANDARD', process.env.STRIPE_PRICE_STANDARD],
    ['STRIPE_PRICE_DIVERSIFIED', process.env.STRIPE_PRICE_DIVERSIFIED],
    ['STRIPE_PRICE_ULTIMATE', process.env.STRIPE_PRICE_ULTIMATE],
  ].filter(([, value]) => value && !value.startsWith('price_')).map(([name]) => name)
  if (invalidPrices.length) {
    errors.push(`invalid Stripe price IDs: ${invalidPrices.join(', ')}`)
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET has an invalid format')
  }

  if (errors.length) {
    const message = `[billing] Invalid Stripe configuration: ${errors.join('; ')}`
    if (isProd) throw new Error(message)
    console.error(message)
  }

  checked = true
}
