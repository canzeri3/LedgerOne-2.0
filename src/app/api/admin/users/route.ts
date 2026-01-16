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

type AdminUserRow = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null
  tier: Tier
  status: string
  effectiveTier: Tier
}

export async function GET(req: NextRequest) {
  try {
    await assertRequestIsAdmin()

    const url = new URL(req.url)
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
    const perPageRaw = Number(url.searchParams.get('perPage') ?? '200')
    const perPage = Math.min(200, Math.max(1, perPageRaw))

    const supabaseAdmin = getSupabaseAdminClient()

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    } as any)
    if (error) throw error

    const users = ((data as any)?.users ?? []) as any[]
    const total = Number((data as any)?.total ?? users.length)

    const ids = users.map((u) => String(u.id)).filter(Boolean)

    const subsByUserId = new Map<string, { tier: Tier; status: string }>()
    if (ids.length) {
      const { data: subs, error: subErr } = await supabaseAdmin
        .from('user_subscriptions')
        .select('user_id,tier,status')
        .in('user_id', ids)

      if (subErr) throw subErr

      for (const row of (subs ?? []) as any[]) {
        const uid = String(row.user_id)
        subsByUserId.set(uid, {
          tier: normalizeTier(row.tier),
          status: String(row.status ?? 'none'),
        })
      }
    }

    const rows: AdminUserRow[] = users.map((u) => {
      const id = String(u.id)
      const email = (u.email ?? null) as string | null
      const created_at = (u.created_at ?? null) as string | null
      const last_sign_in_at = (u.last_sign_in_at ?? null) as string | null

      const sub = subsByUserId.get(id)
      const tier = sub?.tier ?? 'FREE'
      const status = sub?.status ?? 'none'

      // Mirror entitlements behavior: non-paid statuses collapse to FREE.
      const effectiveTier: Tier = isPaidStatus(status) ? tier : 'FREE'

      return { id, email, created_at, last_sign_in_at, tier, status, effectiveTier }
    })

    return NextResponse.json({ page, perPage, total, users: rows }, { status: 200 })
  } catch (e: any) {
    const status = Number(e?.status ?? 500)
    const message = e?.message ?? 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }
}
