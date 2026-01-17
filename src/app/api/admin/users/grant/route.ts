import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { normalizeTier, type Tier } from '@/lib/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function getAdminEmailAllowlist(): Set<string> {
  const raw =
    process.env.LEDGERONE_ADMIN_EMAILS ??
    process.env.ADMIN_EMAILS ??
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ??
    ''

  const emails = raw
    .split(/[,;\n\t ]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  return new Set(emails)
}

async function assertRequestIsAdmin(): Promise<{ userId: string; email: string }> {
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

  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 })

  const email = (user.email ?? '').toLowerCase()
  const allow = getAdminEmailAllowlist()
  if (!email || !allow.has(email))
    throw Object.assign(new Error('Forbidden'), { status: 403 })

  return { userId: user.id, email }
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SERVICE_KEY ??
    ''

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY for admin operations.'
    )
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const OVERRIDE_TIERS: Tier[] = ['FREE', 'PLANNER', 'PORTFOLIO', 'DISCIPLINED', 'ADVISORY']

export async function POST(req: NextRequest) {
  try {
    const admin = await assertRequestIsAdmin()
    const body = (await req.json().catch(() => null)) as
      | { userId?: string; tier?: string; clear?: boolean; note?: string }
      | null

    const userId = String(body?.userId ?? '').trim()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdminClient()

    // Clear override
    if (body?.clear === true) {
      const { error } = await supabaseAdmin
        .from('admin_tier_overrides')
        .delete()
        .eq('user_id', userId)

      if (error) throw error
      return NextResponse.json({ ok: true, userId, cleared: true }, { status: 200 })
    }

    // Set override
    const tier = normalizeTier(body?.tier)
    if (!OVERRIDE_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Allowed: ${OVERRIDE_TIERS.join(', ')}` },
        { status: 400 }
      )
    }

    // Snapshot billed tier/status at time override is set
    let billedTierAtSet: Tier = 'FREE'
    let billedStatusAtSet = 'none'
    try {
      const { data: sub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('tier,status')
        .eq('user_id', userId)
        .maybeSingle()

      billedTierAtSet = normalizeTier(sub?.tier)
      billedStatusAtSet = String(sub?.status ?? 'none')
    } catch {
      billedTierAtSet = 'FREE'
      billedStatusAtSet = 'none'
    }

    const note = String(body?.note ?? 'Admin override').slice(0, 500)
    const now = new Date().toISOString()

    const { error: upErr } = await supabaseAdmin
      .from('admin_tier_overrides')
      .upsert(
        {
          user_id: userId,
          tier,
          note,
          updated_by: admin.userId,
          updated_at: now,
          billed_tier_at_set: billedTierAtSet,
          billed_status_at_set: billedStatusAtSet,
          billed_snapshot_at_set: now,
        } as any,
        { onConflict: 'user_id' } as any
      )

    if (upErr) throw upErr

    return NextResponse.json({ ok: true, userId, tier }, { status: 200 })
  } catch (e: any) {
    const status = Number(e?.status ?? 500)
    const message = e?.message ?? 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }
}
