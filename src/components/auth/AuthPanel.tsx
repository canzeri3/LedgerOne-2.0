'use client'

import React, { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function AuthPanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // watch session (simple poll to avoid adding a full provider)
  async function refreshSession() {
    const { data } = await supabaseBrowser.auth.getUser()
    setUserEmail(data.user?.email ?? null)
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)

    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })

    if (error) {
      setStatus('error')
      setError(error.message)
      return
    }
    setStatus('sent')
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut()
    setUserEmail(null)
  }

  // initial state – fire once when we don't know the user yet
  if (userEmail === null) {
    void refreshSession()
  }

  // Signed-in state
  if (userEmail) {
    return (
      <div className="rounded-lg border border-[#081427] bg-[#0a162c] p-3 text-sm">
        <div className="text-slate-300 mb-2">
          Signed in as{' '}
          <span className="font-medium text-slate-100">{userEmail}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshSession}
            className="px-3 py-1 rounded-md bg-slate-700 text-slate-100 text-xs hover:bg-slate-600"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={signOut}
            className="px-3 py-1 rounded-md bg-red-600 text-white text-xs hover:bg-red-500"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // Logged-out state – magic link form
  return (
    <form
      onSubmit={sendLink}
      className="rounded-lg border border-[#081427] bg-[#0a162c] p-3 text-sm space-y-3"
    >
      <div className="text-slate-300 text-sm">
        Sign in with a magic link. Enter your email and we&apos;ll send you a
        one-time login URL.
      </div>

      <div className="flex flex-col gap-2">
        <input
          type="email"
          value={email}
          required
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={status === 'sending' || !email}
          className="inline-flex items-center justify-center rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'sending' ? 'Sending link…' : 'Send magic link'}
        </button>
      </div>

      {status === 'sent' && (
        <div className="text-xs text-emerald-400">
          Check your inbox for the magic link.
        </div>
      )}

      {status === 'error' && error && (
        <div className="text-xs text-red-400">Error: {error}</div>
      )}
    </form>
  )
}
