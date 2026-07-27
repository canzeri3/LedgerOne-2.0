import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/server/stripe'
import { getAdminSupabase } from '@/server/billing/supabase'
import { tierForPriceId } from '@/lib/billing/plans'
import { normalizeTier, type SubscriptionStatus } from '@/lib/entitlements'
import { assertStripeKeyMode } from '@/server/billing/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Map Stripe subscription status -> our SubscriptionStatus. */
function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
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

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null
}

async function upsertFromSubscription(sub: Stripe.Subscription) {
  const admin = getAdminSupabase()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id

  const status = mapStatus(sub.status)
  // Canceled/expired subscriptions revert the account to FREE.
  const paid = sub.status === 'active' || sub.status === 'trialing'
  const tier = paid ? normalizeTier(tierForPriceId(priceIdFromSubscription(sub))) : 'FREE'

  // Resolve the user: metadata first, then the customer-id mapping.
  let userId: string | null = (sub.metadata?.supabase_user_id as string | undefined) ?? null
  if (!userId && customerId) {
    const { data } = await admin
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    userId = (data?.user_id as string | null) ?? null
  }
  if (!userId) return // can't attribute — ignore

  await admin.from('user_subscriptions').upsert(
    {
      user_id: userId,
      tier,
      status,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

export async function POST(req: Request) {
  assertStripeKeyMode()

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const stripe = getStripe()
  const raw = await req.text() // raw body required for signature verification

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err: any) {
    return NextResponse.json({ error: `invalid_signature: ${err?.message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          if (session.client_reference_id && !sub.metadata?.supabase_user_id) {
            sub.metadata = { ...(sub.metadata ?? {}), supabase_user_id: session.client_reference_id }
          }
          await upsertFromSubscription(sub)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await upsertFromSubscription(event.data.object as Stripe.Subscription)
        break
      }
      default:
        // Ignore other event types.
        break
    }
  } catch (err: any) {
    // Return 500 so Stripe retries transient failures.
    return NextResponse.json({ error: `handler_error: ${err?.message}` }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
