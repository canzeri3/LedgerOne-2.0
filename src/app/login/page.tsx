'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      // Success → redirect; session handling is done globally via useUser/AuthListener
      if (typeof window !== 'undefined') {
        window.location.href = '/'
      }
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#131415] text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            LedgerOne
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-50">
            Sign in to your workspace
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Institutional-grade crypto planning, all in one place.
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] shadow-xl shadow-black/40 p-6">
          <form className="space-y-5" onSubmit={handleLogin}>
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
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
                >
                  Password
                </label>
                <Link
                  // This resolves to https://ledger-one-2-0.vercel.app/auth/forgot in production
                  href="/auth/forgot"
                  className="text-xs font-medium text-indigo-300 hover:text-indigo-200 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-700/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            Don&apos;t have access yet?{' '}
            <Link href="/signup" className="text-indigo-300 hover:text-indigo-200 hover:underline">
              Request or create an account
            </Link>
            .
          </p>

          <p className="mt-3 text-center text-[11px] text-slate-500">
            Sessions are managed through secure encryption authentication. If you&apos;re not sure which email
            to use, contact your admin.
          </p>
        </div>
      </div>
    </div>
  )
}
