'use client'

import { FormEvent, useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'

type AuthStatus = 'idle' | 'sending' | 'sent' | 'error'

const STATUS_MESSAGES: Record<AuthStatus, string> = {
  idle: 'Enter your email to receive a magic link.',
  sending: 'Sending magic link…',
  sent: 'Magic link sent! Check your inbox.',
  error: 'We were unable to send the link. Please try again.',
}

export default function AuthPanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (!active) return
      setUserEmail(data.user?.email ?? null)
    })

    const { data: authListener } = supabaseBrowser.auth.onAuthStateChange((_, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      active = false
      authListener?.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email) return

    setStatus('sending')
    setErrorMessage(null)

    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  const handleSignOut = async () => {
    await supabaseBrowser.auth.signOut()
    setUserEmail(null)
    setStatus('idle')
  }

  if (userEmail) {
    return (
      <div className="rounded-lg border border-[#081427] bg-[#0a162c] p-4 text-sm text-slate-200">
        <p className="mb-2">Signed in as {userEmail}</p>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md bg-[#1d2d4a] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-[#223558]"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-[#081427] bg-[#0a162c] p-4">
      <div className="flex flex-col gap-1 text-sm text-slate-300">
        <label htmlFor="magic-email" className="text-xs uppercase tracking-wide text-slate-400">
          Email
        </label>
        <input
          id="magic-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="rounded-md border border-[#132342] bg-[#0f1a33] px-3 py-2 text-slate-100 outline-none transition focus:border-[#2b4b7d]"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-md bg-[#1d2d4a] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-[#223558] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' ? 'Sending…' : 'Send magic link'}
      </button>

      <p className="text-xs text-slate-400">
        {status === 'error' && errorMessage ? errorMessage : STATUS_MESSAGES[status]}
      </p>
    </form>
  )
}
