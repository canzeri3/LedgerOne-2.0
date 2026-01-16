import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { isPaidStatus, normalizeTier, type Tier } from '@/lib/entitlements'

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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

const GRANTABLE_TIERS: Tier[] = ['PLANNER', 'PORTFOLIO', 'DISCIPLINED', 'ADVISORY']

export async function POST(req: NextRequest) {
  try {
    await assertRequestIsAdmin()

    const body = (await req.json().catch(() => null)) as
      | { userId?: string; tier?: string }
      | null

    const userId = String(body?.userId ?? '').trim()
    const tier = normalizeTier(body?.tier)

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (!GRANTABLE_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Allowed: ${GRANTABLE_TIERS.join(', ')}` },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdminClient()

    // Safety: do not override paid users.
    const { data: existing } = await supabaseAdmin
      .from('user_subscriptions')
      .select('tier,status')
      .eq('user_id', userId)
      .maybeSingle()

    const existingStatus = String((existing as any)?.status ?? 'none')
    if (isPaidStatus(existingStatus)) {
      return NextResponse.json(
        { error: 'Cannot override a paid/trialing user.' },
        { status: 409 }
      )
    }

    // Upsert the subscription row to grant access without payment.
    const { error: upErr } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert(
        { user_id: userId, tier, status: 'active' } as any,
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
