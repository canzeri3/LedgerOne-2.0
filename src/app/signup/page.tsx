'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Card from '@/components/ui/Card'

const supabase =
  typeof window !== 'undefined'
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      )
    : (null as any)

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const siteBase = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
    if (env && /^https?:\/\//i.test(env)) return env
    if (typeof window !== 'undefined') return window.location.origin
    return 'http://localhost:3000'
  }, [])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    try {
      if (!supabase) throw new Error('Supabase not available.')
      const emailRedirectTo = `${siteBase}/login?confirmed=1`
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      })
      if (error) throw error
      setMessage('We sent a confirmation email. Please open it to activate your account.')
    } catch (err: any) {
      setError(err?.message || 'Could not create account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 md:px-6 py-10 max-w-md mx-auto">
      <Card title="Create Account" subtitle="Enter your email and choose a password, then confirm via email.">
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="email2" className="block text-xs text-slate-300 mb-1">Email</label>
            <input
              id="email2"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="newpw" className="block text-xs text-slate-300 mb-1">Create password</label>
            <input
              id="newpw"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirmpw" className="block text-xs text-slate-300 mb-1">Confirm password</label>
            <input
              id="confirmpw"
              type="password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100"
              placeholder="Repeat password"
              autoComplete="new-password"
            />
            <p className="mt-2 text-[11px] text-slate-400">
              You must confirm your account through email before signing in.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <a href="/login" className="text-xs text-slate-300 hover:text-white">
              Back to sign in
            </a>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {message && <p className="text-xs text-slate-300">{message}</p>}
        </form>
      </Card>
    </div>
  )
}

