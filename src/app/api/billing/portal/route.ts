import { NextResponse } from 'next/server'
import { getStripe } from '@/server/stripe'
import { getServerSupabase, getAdminSupabase } from '@/server/billing/supabase'
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

  const supabase = await getServerSupabase()
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const { data: sub } = await admin
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const customerId = (sub?.stripe_customer_id as string | null) ?? null
  if (!customerId) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 })
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteOrigin(req)}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
