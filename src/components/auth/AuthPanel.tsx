'use client'

import { FormEvent, useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'

type AuthStatus = 'idle' | 'sending' | 'sent' | 'error'

export default function AuthPanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const refreshSession = async () => {
      const { data, error: fetchError } = await supabaseBrowser.auth.getUser()
      if (cancelled) return

      if (fetchError) {
        setError(fetchError.message)
      }

      setUserEmail(data.user?.email ?? null)
    }

    void refreshSession()

    const intervalId = window.setInterval(() => {
      void refreshSession()
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const handleSendLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('sending')
    setError(null)

    const { error: signInError } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
      },
    })

    if (signInError) {
      setStatus('error')
      setError(signInError.message)
      return
    }

    setStatus('sent')
  }

  const handleSignOut = async () => {
    await supabaseBrowser.auth.signOut()
    setUserEmail(null)
    setStatus('idle')
    setEmail('')
  }

  if (userEmail) {
    return (
      <div className="rounded-lg border border-[#081427] bg-[#0a162c] p-4 text-sm text-slate-200">
        <p className="mb-2">
          Signed in as <span className="font-semibold text-white">{userEmail}</span>
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md bg-[#1f2a44] px-3 py-2 font-medium text-white transition hover:bg-[#263251]"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSendLink}
      className="space-y-4 rounded-lg border border-[#081427] bg-[#0a162c] p-4 text-sm text-slate-200"
    >
      <div>
        <label htmlFor="magic-link-email" className="mb-1 block text-xs uppercase tracking-wide">
          Email
        </label>
        <input
          id="magic-link-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-[#182745] bg-[#111d33] px-3 py-2 text-white outline-none focus:border-[#3b82f6]"
          placeholder="you@example.com"
        />
      </div>

      {error ? (
        <p className="rounded-md border border-red-700 bg-red-950/40 p-2 text-xs text-red-200">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-md bg-[#1f2a44] px-3 py-2 font-medium text-white transition hover:bg-[#263251] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending'
          ? 'Sending magic link…'
          : status === 'sent'
            ? 'Magic link sent!'
            : 'Send magic link'}
      </button>

      <p className="text-xs text-slate-400">
        We&apos;ll email you a secure sign-in link. No password required.
      </p>
    </form>
  )
}
