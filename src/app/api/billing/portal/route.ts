import { NextResponse } from 'next/server'
import { getStripe } from '@/server/stripe'
import { getServerSupabase, getAdminSupabase } from '@/server/billing/supabase'
import { assertStripeKeyMode } from '@/server/billing/guard'
import { getBillingSiteOrigin } from '@/server/billing/siteUrl'
import { checkRateLimit } from '@/server/lib/rateLimit'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  assertStripeKeyMode()

  const supabase = await getServerSupabase()
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
  }
  if (authError) {
    console.error('[billing] portal auth failed', authError)
    return NextResponse.json({ error: 'authentication_failed' }, { status: 503 })
  }

  const admin = getAdminSupabase()
  const { data: sub, error: subError } = await admin
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (subError) {
    console.error('[billing] portal subscription lookup failed', subError)
    return NextResponse.json({ error: 'billing_store_unavailable' }, { status: 503 })
  }

  const customerId = (sub?.stripe_customer_id as string | null) ?? null
  if (!customerId) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 })
  }

  const userHash = createHash('sha256').update(user.id).digest('hex')
  const rateLimit = await checkRateLimit(`rl:billing:portal:${userHash}`, 20, 60 * 60)
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: 'too_many_portal_attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSec) } }
    )
  }

  const stripe = getStripe()
  try {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) {
      return NextResponse.json({ error: 'customer_deleted' }, { status: 409 })
    }
  } catch (error) {
    console.error('[billing] portal customer verification failed', { customerId, error })
    return NextResponse.json({ error: 'billing_state_requires_reconciliation' }, { status: 409 })
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getBillingSiteOrigin()}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
