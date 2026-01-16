import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
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

  // Subscription row (if missing or not paid => FREE access)
  let tier: Tier = 'FREE'
  let status: any = 'none'

  try {
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('tier,status')
      .eq('user_id', user.id)
      .maybeSingle()

    tier = normalizeTier(sub?.tier)
    status = (sub?.status ?? 'none') as any

    if (!isPaidStatus(status)) {
      tier = 'FREE'
    }
  } catch {
    tier = 'FREE'
    status = 'none'
  }

  const plannedAssetsLimit = plannedLimitForTier(tier)
  const canUsePlanners = canUsePlannersForTier(tier)

  // Important: Tier 0 should not depend on planner table reads (RLS may block them).
  // For paid tiers, compute used as distinct union of active buy/sell planners by coingecko_id.
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
    tier,
    status,
    canUsePlanners,
    plannedAssetsLimit,
    plannedAssetsUsed,
    asOf,
  }

  return NextResponse.json(out, { status: 200 })
}
