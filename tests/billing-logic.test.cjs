const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function evaluateBillingLogic() {
  const script = `
    process.env.STRIPE_PRICE_STANDARD = 'price_standard'
    process.env.STRIPE_PRICE_DIVERSIFIED = 'price_diversified'
    process.env.STRIPE_PRICE_ULTIMATE = 'price_ultimate'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ledgerone.example/path'

    const { priceIdForTier, tierForPriceId } = await import('${ROOT}/src/lib/billing/plans.ts')
    const { normalizeSubscriptionStatus } = await import('${ROOT}/src/lib/entitlements.ts')
    const {
      isTerminalStripeStatus,
      mapStripeSubscriptionStatus,
      snapshotFromSubscription,
    } = await import('${ROOT}/src/server/billing/subscription.ts')
    const { getBillingSiteOrigin } = await import('${ROOT}/src/server/billing/siteUrl.ts')

    const subscription = (status, priceId, cancelAt = null) => ({
      id: 'sub_test',
      status,
      cancel_at_period_end: true,
      cancel_at: cancelAt,
      items: {
        data: [{ price: { id: priceId }, current_period_end: 1_800_000_000 }],
      },
    })

    let unknownPriceRejected = false
    try {
      snapshotFromSubscription(subscription('active', 'price_unknown'))
    } catch {
      unknownPriceRejected = true
    }

    process.stdout.write(JSON.stringify({
      forwardPrices: ['PLANNER', 'PORTFOLIO', 'DISCIPLINED'].map(priceIdForTier),
      reversePrices: ['price_standard', 'price_diversified', 'price_ultimate', 'price_unknown'].map(tierForPriceId),
      statuses: ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete_expired', 'incomplete', 'paused'].map(mapStripeSubscriptionStatus),
      normalizedStatuses: ['ACTIVE', 'trialing', 'garbage'].map(normalizeSubscriptionStatus),
      terminal: ['active', 'canceled', 'incomplete_expired'].map(isTerminalStripeStatus),
      activeSnapshot: snapshotFromSubscription(subscription('active', 'price_standard')),
      flexibleCancellationSnapshot: snapshotFromSubscription({
        ...subscription('active', 'price_standard', 1_800_000_000),
        cancel_at_period_end: false,
      }),
      canceledSnapshot: snapshotFromSubscription(subscription('canceled', 'price_unknown')),
      unknownPriceRejected,
      siteOrigin: getBillingSiteOrigin(),
    }))
  `

  const filename = path.join(os.tmpdir(), `ledgerone-billing-${process.pid}-${Date.now()}.mts`)
  fs.writeFileSync(filename, script)
  try {
    return JSON.parse(execFileSync('npx', ['tsx', filename], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 20_000,
    }))
  } finally {
    fs.unlinkSync(filename)
  }
}

describe('billing domain logic', () => {
  let result

  beforeAll(() => {
    result = evaluateBillingLogic()
  })

  test('maps all checkout tiers to configured Stripe prices and back', () => {
    expect(result.forwardPrices).toEqual(['price_standard', 'price_diversified', 'price_ultimate'])
    expect(result.reversePrices).toEqual(['PLANNER', 'PORTFOLIO', 'DISCIPLINED', 'FREE'])
  })

  test('normalizes Stripe subscription statuses conservatively', () => {
    expect(result.statuses).toEqual([
      'active', 'trialing', 'past_due', 'past_due', 'canceled', 'canceled', 'inactive', 'inactive',
    ])
    expect(result.normalizedStatuses).toEqual(['active', 'trialing', 'none'])
    expect(result.terminal).toEqual([false, true, true])
  })

  test('grants an active known price and includes renewal state', () => {
    expect(result.activeSnapshot).toMatchObject({
      tier: 'PLANNER',
      status: 'active',
      priceId: 'price_standard',
      cancelAtPeriodEnd: true,
    })
    expect(result.activeSnapshot.currentPeriodEnd).toBe('2027-01-15T08:00:00.000Z')
    expect(result.flexibleCancellationSnapshot.cancelAtPeriodEnd).toBe(true)
  })

  test('fails closed for an active unknown price but permits canceled cleanup', () => {
    expect(result.unknownPriceRejected).toBe(true)
    expect(result.canceledSnapshot.tier).toBe('FREE')
    expect(result.canceledSnapshot.status).toBe('canceled')
  })

  test('uses only the configured canonical origin for billing redirects', () => {
    expect(result.siteOrigin).toBe('https://ledgerone.example')
  })
})

describe('billing migration', () => {
  const migration = fs.readFileSync(
    path.join(ROOT, 'db/migrations/20260812_stripe_billing_hardening.sql'),
    'utf8'
  )

  test('deduplicates Stripe events and updates subscription state atomically', () => {
    expect(migration).toContain('create or replace function public.process_stripe_subscription_event')
    expect(migration).toContain('on conflict (event_id) do nothing')
    expect(migration).toContain('on conflict (user_id) do update')
  })

  test('restricts webhook event data and RPC execution to the service role', () => {
    expect(migration).toContain('revoke all on table public.stripe_webhook_events from public, anon, authenticated')
    expect(migration).toContain('to service_role')
  })
})
