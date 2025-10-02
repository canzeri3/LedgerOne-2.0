import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({} as any))
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) {
      return NextResponse.json({ error: 'Supabase not configured.' }, { status: 500 })
    }

    const supabase = createClient(url, anon)

    // Auto-detect the site origin from the incoming request (works on localhost & prod)
    const origin = new URL(req.url).origin
    // If you also set NEXT_PUBLIC_SITE_URL, prefer that (must be absolute)
    const base = (process.env.NEXT_PUBLIC_SITE_URL && /^https?:\/\//.test(process.env.NEXT_PUBLIC_SITE_URL))
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
      : origin

    const redirectTo = `${base}/auth/reset`

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) {
      // Surface the exact Supabase error to the client — super helpful for debugging
      return NextResponse.json({ error: error.message, redirectTo }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

