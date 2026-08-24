'use client'

import { useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'

/**
 * Listens for auth changes (login, logout, token refresh) and
 * tells the server to update the auth cookies so your API routes
 * can read the session.
 */
export default function AuthListener() {
  useEffect(() => {
    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange(
      async (_event: any, session: any) => {
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
