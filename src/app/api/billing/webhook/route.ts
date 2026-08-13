import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/server/stripe'
import { getAdminSupabase } from '@/server/billing/supabase'
import { snapshotFromSubscription } from '@/server/billing/subscription'
import { assertStripeKeyMode } from '@/server/billing/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function customerIdFromSubscription(sub: Stripe.Subscription): string | null {
  if (typeof sub.customer === 'string') return sub.customer
  return sub.customer?.id ?? null
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function resolveUserId(sub: Stripe.Subscription, fallbackUserId?: string | null): Promise<string> {
  const admin = getAdminSupabase()
  const customerId = customerIdFromSubscription(sub)
  const metadataUserId = sub.metadata?.supabase_user_id || fallbackUserId || null
  let mappedUserId: string | null = null

  if (customerId) {
    const { data, error } = await admin
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (error) throw error
    mappedUserId = (data?.user_id as string | null) ?? null
  }

  if (metadataUserId && mappedUserId && metadataUserId !== mappedUserId) {
    throw new Error(`Stripe metadata and customer mapping disagree for subscription ${sub.id}`)
  }

  const userId = metadataUserId || mappedUserId
  if (!userId || !isUuid(userId)) {
    throw new Error(`Cannot attribute Stripe subscription ${sub.id} to a valid user`)
  }
  return userId
}

async function processSubscription(
  sub: Stripe.Subscription,
  event: Stripe.Event,
  fallbackUserId?: string | null
): Promise<boolean> {
  const admin = getAdminSupabase()
  const userId = await resolveUserId(sub, fallbackUserId)
  const snapshot = snapshotFromSubscription(sub)
  const customerId = customerIdFromSubscription(sub)

  if (!customerId) throw new Error(`Subscription ${sub.id} has no Stripe customer`)

  const { data, error } = await admin.rpc('process_stripe_subscription_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
    p_livemode: event.livemode,
    p_user_id: userId,
    p_tier: snapshot.tier,
    p_status: snapshot.status,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: sub.id,
    p_stripe_price_id: snapshot.priceId,
    p_current_period_end: snapshot.currentPeriodEnd,
    p_cancel_at_period_end: snapshot.cancelAtPeriodEnd,
  })
  if (error) throw error
  return Boolean(data)
}

export async function POST(req: Request) {
  assertStripeKeyMode()

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const stripe = getStripe()
  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown signature error'
    console.warn('[billing] rejected Stripe webhook signature', { message })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    let processed = true

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId =
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          processed = await processSubscription(subscription, event, session.client_reference_id)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const eventSubscription = event.data.object as Stripe.Subscription
        // Retrieve current Stripe state so out-of-order event delivery cannot
        // restore an older tier or status.
        const subscription = await stripe.subscriptions.retrieve(eventSubscription.id)
        processed = await processSubscription(subscription, event)
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true, processed })
  } catch (error) {
    console.error('[billing] Stripe webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      error,
    })
    // Stripe retries 5xx deliveries. Never acknowledge a state-changing event
    // when its database transaction failed.
    return NextResponse.json({ error: 'handler_error' }, { status: 500 })
  }
}
