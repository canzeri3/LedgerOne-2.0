import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({} as any))

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json({ error: 'Supabase not configured.' }, { status: 500 })
    }

    const supabase = createClient(url, anon)

    // ── Compute the base URL for the reset link ────────────────────────────
    // 1) Prefer NEXT_PUBLIC_SITE_URL (your live domain)
    // 2) Else fall back to the incoming request's origin (dev / prod)
    const rawEnvBase = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
    let base: string

    if (rawEnvBase && /^https?:\/\//i.test(rawEnvBase)) {
      base = rawEnvBase.replace(/\/$/, '')
    } else {
      const origin = new URL(req.url).origin
      base = origin.replace(/\/$/, '')
    }

    const redirectTo = `${base}/auth/reset`

    // Log once server-side so you can see what we're sending to Supabase
    console.log('[forgot] redirectTo:', redirectTo)

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      console.error('[forgot] Supabase error:', error.message)
      return NextResponse.json({ error: error.message, redirectTo }, { status: 400 })
    }

    return NextResponse.json({ ok: true, redirectTo })
  } catch (err) {
    console.error('Error in /api/auth/forgot', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
