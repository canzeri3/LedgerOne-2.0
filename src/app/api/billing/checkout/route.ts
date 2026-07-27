import { NextResponse } from 'next/server'
import { getStripe } from '@/server/stripe'
import { getServerSupabase, getAdminSupabase } from '@/server/billing/supabase'
import { isCheckoutTier, priceIdForTier } from '@/lib/billing/plans'
import { assertStripeKeyMode } from '@/server/billing/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function siteOrigin(req: Request): string {
  return (
    req.headers.get('origin') ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.INTERNAL_BASE_URL ||
    'http://localhost:3000'
  )
}

export async function POST(req: Request) {
  assertStripeKeyMode()

  let tier: string
  try {
    const body = await req.json()
    tier = String(body?.tier ?? '')
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (!isCheckoutTier(tier)) {
    return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
  }

  const priceId = priceIdForTier(tier)
  if (!priceId) {
    return NextResponse.json({ error: 'price_not_configured' }, { status: 500 })
  }

  const supabase = await getServerSupabase()
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
  }

  const stripe = getStripe()
  const admin = getAdminSupabase()

  // Reuse an existing Stripe customer if we've made one for this user before.
  let customerId: string | null = null
  try {
    const { data: sub } = await admin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()
    customerId = (sub?.stripe_customer_id as string | null) ?? null
  } catch {
    customerId = null
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    // Persist the mapping immediately so the webhook can resolve the user later.
    try {
      await admin
        .from('user_subscriptions')
        .upsert(
          { user_id: user.id, stripe_customer_id: customerId },
          { onConflict: 'user_id' }
        )
    } catch {
      // Non-fatal: the webhook also records the customer id on completion.
    }
  }

  const origin = siteOrigin(req)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { supabase_user_id: user.id } },
    success_url: `${origin}/settings?billing=success`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}
