'use client'

import { FormEvent, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import Link from 'next/link'

export default function AuthPage() {
  const { user } = useUser()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabaseBrowser.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut()
  }

  if (user) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">You’re signed in</h1>
        <p className="text-sm text-slate-300">{user.email}</p>
        <div className="flex gap-3">
          <Link href="/" className="px-3 py-2 rounded-lg bg-[#0a162c] border border-[#081427]">Go to Dashboard</Link>
          <button onClick={signOut} className="px-3 py-2 rounded-lg bg-[#0a162c] border border-[#081427]">Sign out</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-slate-300">We’ll email you a magic link.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full rounded-lg bg-[#0a162c] border border-[#081427] px-3 py-2"
          placeholder="you@example.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="w-full px-3 py-2 rounded-lg bg-[#0a162c] border border-[#081427]">Send magic link</button>
      </form>
      {sent && <div className="text-sm text-emerald-400">Check your email for the link.</div>}
      {error && <div className="text-sm text-rose-400">{error}</div>}
    </div>
  )
}

