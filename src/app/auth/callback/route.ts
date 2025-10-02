import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: Request) {
  const { event, session } = await req.json().catch(() => ({}))

  const cookieStore = await cookies()
  const res = NextResponse.json({ ok: true })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return res
  }

  // Wire cookies adapter for @supabase/ssr
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        res.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        res.cookies.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
  })

  try {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      // Persist the browser session into server cookies
      await supabase.auth.setSession({
        access_token: session?.access_token ?? '',
        refresh_token: session?.refresh_token ?? '',
      })
    } else if (event === 'SIGNED_OUT') {
      await supabase.auth.signOut()
    }
  } catch {
    // ignore—response still returns ok: true so UI stays snappy
  }

  return res
}

