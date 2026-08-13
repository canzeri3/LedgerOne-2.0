import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import type Stripe from 'stripe'
import { getStripe } from '@/server/stripe'
import { getAdminSupabase } from '@/server/billing/supabase'
import { assertStripeKeyMode } from '@/server/billing/guard'
import { isTerminalStripeStatus, snapshotFromSubscription } from '@/server/billing/subscription'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim() ?? ''
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  const header = req.headers.get('x-cron-secret')?.trim() ?? ''
  const supplied = bearer || header
  return Boolean(expected && supplied && safeEqual(expected, supplied))
}

function customerId(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  assertStripeKeyMode()
  const stripe = getStripe()
  const admin = getAdminSupabase()
  const { data: rows, error: rowsError } = await admin
    .from('user_subscriptions')
    .select('user_id,status,stripe_customer_id,stripe_subscription_id')
  if (rowsError) {
    console.error('[billing] reconciliation lookup failed', rowsError)
    return NextResponse.json({ error: 'billing_store_unavailable' }, { status: 503 })
  }

  const summary = { inspected: 0, repaired: 0, unchanged: 0, anomalies: 0 }

  for (const row of rows ?? []) {
    summary.inspected += 1
    const userId = String(row.user_id)
    const mappedCustomerId = row.stripe_customer_id ? String(row.stripe_customer_id) : null
    let subscription: Stripe.Subscription | null = null

    try {
      if (row.stripe_subscription_id) {
        subscription = await stripe.subscriptions.retrieve(String(row.stripe_subscription_id))
      } else if (mappedCustomerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: mappedCustomerId,
          status: 'all',
          limit: 10,
        })
        const nonTerminal = subscriptions.data.filter((item) => !isTerminalStripeStatus(item.status))
        if (nonTerminal.length > 1) {
          summary.anomalies += 1
          console.error('[billing] reconciliation found duplicate subscriptions', {
            userId,
            customerId: mappedCustomerId,
            subscriptionIds: nonTerminal.map((item) => item.id),
          })
          continue
        }
        subscription = nonTerminal[0] ?? subscriptions.data[0] ?? null
      }

      if (!subscription) {
        if (row.status === 'active' || row.status === 'trialing' || row.status === 'past_due') {
          summary.anomalies += 1
          console.error('[billing] billed database row has no Stripe subscription', { userId })
        } else {
          summary.unchanged += 1
        }
        continue
      }

      const metadataUserId = subscription.metadata?.supabase_user_id
      if (metadataUserId && metadataUserId !== userId) {
        summary.anomalies += 1
        console.error('[billing] reconciliation metadata mismatch', {
          userId,
          metadataUserId,
          subscriptionId: subscription.id,
        })
        continue
      }

      const snapshot = snapshotFromSubscription(subscription)
      const stripeCustomerId = customerId(subscription)
      if (!stripeCustomerId || (mappedCustomerId && mappedCustomerId !== stripeCustomerId)) {
        summary.anomalies += 1
        console.error('[billing] reconciliation customer mismatch', {
          userId,
          mappedCustomerId,
          stripeCustomerId,
        })
        continue
      }

      const { error: updateError } = await admin
        .from('user_subscriptions')
        .update({
          tier: snapshot.tier,
          status: snapshot.status,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: snapshot.priceId,
          current_period_end: snapshot.currentPeriodEnd,
          cancel_at_period_end: snapshot.cancelAtPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      if (updateError) throw updateError
      summary.repaired += 1
    } catch (error) {
      summary.anomalies += 1
      console.error('[billing] reconciliation item failed', { userId, error })
    }
  }

  const ok = summary.anomalies === 0
  return NextResponse.json({ ok, ...summary }, { status: ok ? 200 : 500 })
}
