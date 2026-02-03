'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [message, setMessage] = useState<string>('')

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }
      if (password !== confirm) {
        throw new Error('Passwords do not match.')
      }

      // Build redirect URL at runtime (no hardcoded localhost).
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const emailRedirectTo = origin ? `${origin}/login?confirmed=1` : undefined

      const { error } = await supabaseBrowser.auth.signUp({
        email,
        password,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      })

      if (error) throw error

      setMessage('Confirmation email sent. Please open it to activate your account.')
    } catch (err: any) {
      setError(err?.message || 'Could not create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

 return (
  <div className="relative min-h-screen bg-[#131415] text-slate-100 flex items-center justify-center px-4 overflow-hidden">
    {/* Full-page halo backdrop (behind card) */}
    <div className="pointer-events-none absolute inset-0 z-0">
      {/* Top wash */}
      <div className="absolute -top-28 left-1/2 h-80 w-[72rem] max-w-[120vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500/18 via-sky-500/10 to-emerald-500/14 blur-3xl" />
      {/* Center glow behind card */}
      <div className="absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      {/* Subtle corner balance */}
      <div className="absolute -bottom-44 -right-44 h-[34rem] w-[34rem] rounded-full bg-emerald-500/8 blur-3xl" />
    </div>

    <div className="w-full max-w-md relative z-10">

        {/* Brand header (match login) */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            LedgerOne
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-50">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Access a rules-based workspace for planning and tracking.
          </p>
        </div>

        {/* Signup card (match login) */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] shadow-xl shadow-black/40 p-6">
          <form className="space-y-5" onSubmit={handleSignup}>
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                placeholder="you@desk.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="newpw"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Create password
              </label>
              <input
                id="newpw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirmpw"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Confirm password
              </label>
              <input
                id="confirmpw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">
                You must confirm your email before signing in.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {message && (
              <p className="text-xs text-emerald-200 bg-emerald-950/25 border border-emerald-900/50 rounded-md px-3 py-2">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-700/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            Already have access?{' '}
            <Link href="/login" className="text-indigo-300 hover:text-indigo-200 hover:underline">
              Sign in
            </Link>
            .
          </p>

          <p className="mt-3 text-center text-[11px] text-slate-500">
            LedgerOne is a planning and tracking tool. It does not provide investment advice.
          </p>
        </div>
      </div>
    </div>
  )
}
