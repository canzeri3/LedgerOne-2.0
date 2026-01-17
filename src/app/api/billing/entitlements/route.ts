import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import {
  canUsePlannersForTier,
  isPaidStatus,
  normalizeTier,
  plannedLimitForTier,
  type Entitlements,
  type Tier,
} from '@/lib/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function getSupabaseAdminClientOrNull() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !serviceKey) return null

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function GET() {
  const asOf = new Date().toISOString()

  const cookieStore = await cookies()
  const supabase = createServerClient(
    envOrThrow('NEXT_PUBLIC_SUPABASE_URL'),
    envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 })
        },
      },
    }
  )

  // Not signed in => FREE
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) {
    const out: Entitlements = {
      tier: 'FREE',
      status: 'none',
      canUsePlanners: false,
      plannedAssetsLimit: 0,
      plannedAssetsUsed: 0,
      asOf,
    }
    return NextResponse.json(out, { status: 200 })
  }

  // Billing tier/status from user_subscriptions (DB stays the billing source of truth).
  let billedTier: Tier = 'FREE'
  let billedStatus: any = 'none'

  try {
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('tier,status')
      .eq('user_id', user.id)
      .maybeSingle()

    billedTier = normalizeTier(sub?.tier)
    billedStatus = (sub?.status ?? 'none') as any
  } catch {
    billedTier = 'FREE'
    billedStatus = 'none'
  }

  // Read admin override (user can read own override via RLS policy).
  let overrideTier: Tier | null = null
  let billedTierAtSet: Tier | null = null
  let billedStatusAtSet: string | null = null

  try {
    const { data: ovr } = await supabase
      .from('admin_tier_overrides')
      .select('tier,billed_tier_at_set,billed_status_at_set')
      .eq('user_id', user.id)
      .maybeSingle()

    if (ovr?.tier != null) overrideTier = normalizeTier(ovr.tier)
    if (ovr?.billed_tier_at_set != null) billedTierAtSet = normalizeTier(ovr.billed_tier_at_set)
    if (ovr?.billed_status_at_set != null) billedStatusAtSet = String(ovr.billed_status_at_set)
  } catch {
    overrideTier = null
    billedTierAtSet = null
    billedStatusAtSet = null
  }

  // (2) Auto-clear override when billing changes:
  // If we have a stored billed snapshot at the time override was set and it differs from current billed tier/status,
  // clear override so the user's Choose Plan decision takes over.
  if (overrideTier != null && billedTierAtSet != null && billedStatusAtSet != null) {
    const billingChanged =
      billedTier !== billedTierAtSet || String(billedStatus) !== String(billedStatusAtSet)

    if (billingChanged) {
      const admin = getSupabaseAdminClientOrNull()
      if (admin) {
        try {
          await admin.from('admin_tier_overrides').delete().eq('user_id', user.id)
          overrideTier = null
        } catch {
          // Fail closed (do not break entitlements endpoint).
          // If deletion fails, override remains in effect for this request.
        }
      }
    }
  }

  // Effective tier decision:
  // - If override exists, it wins (until auto-cleared).
  // - Else if billed status is paid/trialing, use billed tier.
  // - Else FREE.
  let tier: Tier = 'FREE'
  if (overrideTier != null) tier = overrideTier
  else if (isPaidStatus(billedStatus)) tier = billedTier
  else tier = 'FREE'

  const plannedAssetsLimit = plannedLimitForTier(tier)
  const canUsePlanners = canUsePlannersForTier(tier)

  // Paid tiers (or override tiers) compute planner usage.
  let plannedAssetsUsed = 0
  if (canUsePlanners) {
    try {
      const [buys, sells] = await Promise.all([
        supabase
          .from('buy_planners')
          .select('coingecko_id')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('sell_planners')
          .select('coingecko_id')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      const set = new Set<string>()
      for (const row of (buys.data ?? []) as any[]) set.add(String(row.coingecko_id))
      for (const row of (sells.data ?? []) as any[]) set.add(String(row.coingecko_id))
      plannedAssetsUsed = set.size
    } catch {
      plannedAssetsUsed = 0
    }
  }

  const out: Entitlements = {
    tier,              // effective tier (may be override or billed)
    status: billedStatus, // keep billing status visible (unchanged contract)
    canUsePlanners,
    plannedAssetsLimit,
    plannedAssetsUsed,
    asOf,
  }

  return NextResponse.json(out, { status: 200 })
}
