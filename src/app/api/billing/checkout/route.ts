import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/server/stripe'
import { getServerSupabase, getAdminSupabase } from '@/server/billing/supabase'
import { isCheckoutTier, priceIdForTier } from '@/lib/billing/plans'
import { assertStripeKeyMode } from '@/server/billing/guard'
import { getBillingSiteOrigin } from '@/server/billing/siteUrl'
import { isTerminalStripeStatus } from '@/server/billing/subscription'
import { checkRateLimit } from '@/server/lib/rateLimit'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function opaqueKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex')
}

export async function POST(req: Request) {
  assertStripeKeyMode()

  let tier: string
  let attemptId: string
  let trialRequested: boolean
  try {
    const body = await req.json()
    tier = String(body?.tier ?? '')
    attemptId = String(body?.attemptId ?? '')
    trialRequested = body?.trial === true
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (!isCheckoutTier(tier)) {
    return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
    return NextResponse.json({ error: 'invalid_attempt_id' }, { status: 400 })
  }

  const priceId = priceIdForTier(tier)
  if (!priceId) {
    return NextResponse.json({ error: 'price_not_configured' }, { status: 500 })
  }

  const supabase = await getServerSupabase()
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
  }
  if (authError) {
    console.error('[billing] checkout auth failed', authError)
    return NextResponse.json({ error: 'authentication_failed' }, { status: 503 })
  }

  const stripe = getStripe()
  const admin = getAdminSupabase()

  const rateLimit = await checkRateLimit(`rl:billing:checkout:${opaqueKey(user.id)}`, 10, 60 * 60)
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: 'too_many_checkout_attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSec) } }
    )
  }

  let customerId: string | null = null
  const { data: existing, error: existingError } = await admin
    .from('user_subscriptions')
    .select('status,stripe_customer_id,stripe_subscription_id,trial_used_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (existingError) {
    console.error('[billing] checkout subscription lookup failed', existingError)
    return NextResponse.json({ error: 'billing_store_unavailable' }, { status: 503 })
  }

  customerId = (existing?.stripe_customer_id as string | null) ?? null
  const subscriptionId = (existing?.stripe_subscription_id as string | null) ?? null

  if (trialRequested && (existing?.trial_used_at || subscriptionId)) {
    return NextResponse.json({ error: 'trial_already_used' }, { status: 409 })
  }

  if ((existing?.status === 'active' || existing?.status === 'trialing') && !subscriptionId) {
    console.error('[billing] active database subscription has no Stripe subscription id', { userId: user.id })
    return NextResponse.json({ error: 'billing_state_requires_reconciliation' }, { status: 409 })
  }

  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      if (!isTerminalStripeStatus(subscription.status)) {
        return NextResponse.json({ error: 'subscription_exists' }, { status: 409 })
      }
    } catch (error) {
      console.error('[billing] could not verify mapped Stripe subscription', { subscriptionId, error })
      return NextResponse.json({ error: 'billing_state_requires_reconciliation' }, { status: 409 })
    }
  }

  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) customerId = null
    } catch (error) {
      console.error('[billing] could not verify mapped Stripe customer', { customerId, error })
      return NextResponse.json({ error: 'billing_state_requires_reconciliation' }, { status: 409 })
    }
  }

  if (customerId) {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
    if (subscriptions.data.some((subscription) => !isTerminalStripeStatus(subscription.status))) {
      console.error('[billing] Stripe has an untracked non-terminal subscription', { userId: user.id, customerId })
      return NextResponse.json({ error: 'subscription_exists' }, { status: 409 })
    }
    if (trialRequested && subscriptions.data.length > 0) {
      const { error: trialBackfillError } = await admin
        .from('user_subscriptions')
        .update({ trial_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('trial_used_at', null)
      if (trialBackfillError) {
        console.error('[billing] failed to backfill prior Stripe trial use', trialBackfillError)
      }
      return NextResponse.json({ error: 'trial_already_used' }, { status: 409 })
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      },
      { idempotencyKey: `customer-${opaqueKey(user.id)}` }
    )
    customerId = customer.id
    const { error: mappingError } = await admin
      .from('user_subscriptions')
      .upsert(
        { user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (mappingError) {
      console.error('[billing] failed to persist Stripe customer mapping', mappingError)
      return NextResponse.json({ error: 'billing_store_unavailable' }, { status: 503 })
    }
  }

  const origin = getBillingSiteOrigin()
  const checkoutMetadata = {
    supabase_user_id: user.id,
    ledgerone_tier: tier,
    ledgerone_trial: trialRequested ? 'true' : 'false',
  }
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: checkoutMetadata,
    ...(trialRequested
      ? {
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
        }
      : {}),
  }
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      payment_method_collection: trialRequested ? 'always' : undefined,
      subscription_data: subscriptionData,
      metadata: checkoutMetadata,
      success_url: `${origin}/settings?billing=${trialRequested ? 'trial' : 'success'}`,
      cancel_url: `${origin}/pricing?billing=cancelled`,
    },
    {
      idempotencyKey: trialRequested
        ? `trial-checkout-${opaqueKey(user.id)}`
        : `checkout-${opaqueKey(user.id, attemptId)}`,
    }
  )

  return NextResponse.json({ url: session.url })
}
