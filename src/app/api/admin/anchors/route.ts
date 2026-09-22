import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function getAdminEmailAllowlist(): Set<string> {
  // SECURITY: Never use NEXT_PUBLIC_* for access control — those vars are
  // baked into the client JS bundle and visible to every browser.
  const raw =
    process.env.LEDGERONE_ADMIN_EMAILS ??
    process.env.ADMIN_EMAILS ??
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

/**
 * POST /api/admin/anchors
 *
 * Updates one coin_anchors row. This must run server-side with the service
 * role: coin_anchors has RLS enabled with a SELECT-only policy for
 * `authenticated`, so a browser-side update silently matches zero rows and
 * returns success without writing anything.
 *
 * Body: { coingecko_id, anchor_top_price, pump_threshold_multiple, force_manual_anchor }
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await assertRequestIsAdmin()

    const body = (await req.json().catch(() => null)) as
      | {
          coingecko_id?: string
          anchor_top_price?: number | null
          pump_threshold_multiple?: number
          force_manual_anchor?: boolean
        }
      | null

    const coingeckoId = String(body?.coingecko_id ?? '').trim()
    if (!coingeckoId) {
      return NextResponse.json({ error: 'Missing coingecko_id' }, { status: 400 })
    }

    const forceManual = body?.force_manual_anchor === true

    const pumpRaw = Number(body?.pump_threshold_multiple)
    if (!Number.isFinite(pumpRaw) || pumpRaw <= 1.0) {
      return NextResponse.json(
        { error: `Pump multiple for ${coingeckoId} must be > 1.0 (e.g. 1.5 or 1.7).` },
        { status: 400 }
      )
    }

    const anchorInput = body?.anchor_top_price
    const anchorTopPrice =
      anchorInput == null || !Number.isFinite(Number(anchorInput))
        ? null
        : Number(anchorInput)

    // Mirrors the client-side guard: forcing manual mode requires a usable top.
    if (forceManual && !(anchorTopPrice != null && anchorTopPrice > 0)) {
      return NextResponse.json(
        {
          error: `To force manual mode for ${coingeckoId}, you must set a positive Admin top (USD).`,
        },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdminClient()

    const { data, error } = await supabaseAdmin
      .from('coin_anchors')
      .update({
        anchor_top_price: anchorTopPrice,
        pump_threshold_multiple: pumpRaw,
        force_manual_anchor: forceManual,
      })
      .eq('coingecko_id', coingeckoId)
      .select('coingecko_id,anchor_top_price,pump_threshold_multiple,force_manual_anchor')

    if (error) throw error

    // A zero-row update means the id doesn't exist — surface it instead of
    // reporting a save that never happened.
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: `No coin_anchors row found for ${coingeckoId}.` },
        { status: 404 }
      )
    }

    console.info('[admin:anchors] updated', {
      adminEmail: admin.email,
      coingeckoId,
      anchorTopPrice,
      pumpMultiple: pumpRaw,
      forceManual,
    })

    return NextResponse.json({ ok: true, row: data[0] }, { status: 200 })
  } catch (e: any) {
    const status = Number(e?.status ?? 500)
    const message = e?.message ?? 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }
}
