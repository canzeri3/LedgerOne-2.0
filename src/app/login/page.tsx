'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Card from '@/components/ui/Card'

const supabase =
  typeof window !== 'undefined'
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      )
    : (null as any)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (!supabase) throw new Error('Supabase not available.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // Success → redirect (your layout/session may already do this)
      if (typeof window !== 'undefined') window.location.href = '/'
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 md:px-6 py-10 max-w-md mx-auto">
      <Card title="Sign in" subtitle="Welcome back to LedgerOne.">
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs text-slate-300 mb-1">Email</label>
            <input
              id="email"
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
            <label htmlFor="password" className="block text-xs text-slate-300 mb-1">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div className="flex items-center justify-between">
            <a href="/auth/forgot" className="text-xs text-blue-400 hover:text-blue-300">
              Forgot password?
            </a>
            <a href="/signup" className="text-xs text-slate-300 hover:text-white">
              Create account
            </a>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      </Card>
    </div>
  )
}

