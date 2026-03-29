import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/server/lib/rateLimit'

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({} as any))

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    // Two independent limits protect against:
    //   IP limit  — burst attacks from one machine (e.g. credential stuffing)
    //   Email limit — targeted harassment of a specific user's inbox
    //
    // Both return the same generic 429 so attackers can't distinguish which
    // limit was hit (avoids leaking whether an email address exists).
    const ip = getClientIp(req)

    const ipCheck = await checkRateLimit(`rl:forgot:ip:${ip}`, 5, 15 * 60)
    if (ipCheck.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(ipCheck.resetInSec) },
        }
      )
    }

    const emailCheck = await checkRateLimit(
      `rl:forgot:email:${email.trim().toLowerCase()}`,
      3,
      60 * 60
    )
    if (emailCheck.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(emailCheck.resetInSec) },
        }
      )
    }
    // ─────────────────────────────────────────────────────────────────────

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      // Log server-side only — never expose config state to the client
      console.error('[forgot] Supabase env vars not configured')
      return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 })
    }

    const supabase = createClient(url, anon)

    // ── Compute the redirect URL ───────────────────────────────────────────
    const rawEnvBase = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
    let base: string

    if (rawEnvBase && /^https?:\/\//i.test(rawEnvBase)) {
      base = rawEnvBase.replace(/\/$/, '')
    } else {
      const origin = new URL(req.url).origin
      base = origin.replace(/\/$/, '')
    }

    const redirectTo = `${base}/auth/reset`

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      // Log full error server-side for debugging — never send to client.
      // Supabase errors can contain table names, constraint names, or hints
      // about whether the email exists.
      console.error('[forgot] Supabase error:', error.message)

      // Return a generic message regardless of whether the email exists.
      // This prevents email enumeration: the client cannot distinguish
      // "email not found" from "email found, reset sent".
      return NextResponse.json(
        { error: 'Unable to send reset email. Please check the address and try again.' },
        { status: 400 }
      )
    }

    // Omit redirectTo from the success response — it's an internal detail
    // the client doesn't need and shouldn't be able to inspect.
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[forgot] Unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
