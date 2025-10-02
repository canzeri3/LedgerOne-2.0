'use client'

import { useEffect } from 'react'
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'

const supabase: SupabaseClient | null =
  typeof window !== 'undefined'
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      )
    : null

/**
 * Listens for auth changes (login, logout, token refresh) and
 * tells the server to update the auth cookies so your API routes
 * can read the session.
 */
export default function AuthListener() {
  useEffect(() => {
    if (!supabase) return
    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        try {
          await fetch('/auth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: _event, session }),
            keepalive: true,
          })
        } catch {
          // ignore network errors; middleware refresh will catch up on navigation
        }
      }
    )
    return () => {
      subscription?.subscription?.unsubscribe?.()
    }
  }, [])

  return null
}

