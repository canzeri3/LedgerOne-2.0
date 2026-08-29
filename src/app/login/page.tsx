'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { L1Nightsky, L1Grain } from '@/components/ledgerone'
import './login-skin.css'

function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'

  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return '/dashboard'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/dashboard'
  }
}

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
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      if (!data.session) throw new Error('Sign-in succeeded, but no session was returned.')

      // Persist the browser session into server cookies before navigating. Without
      // awaiting this handshake, middleware can receive the next request before
      // AuthListener finishes and incorrectly treat the user as signed out.
      const sessionResponse = await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'SIGNED_IN', session: data.session }),
      })
      if (!sessionResponse.ok) {
        throw new Error('Your session could not be started. Please try signing in again.')
      }

      const destination = safeReturnPath(
        new URLSearchParams(window.location.search).get('next')
      )
      window.location.assign(destination)

    } catch (err: any) {
      setError(err?.message || 'Sign-in failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="l1-auth relative min-h-screen overflow-hidden">
      {/* Night-sky + aurora backdrop, matching the marketing pages */}
      <L1Nightsky />
      <L1Grain />
      <div className="auth-aurora" aria-hidden="true" />

      <Link href="/" className="auth-back" aria-label="Back to landing page">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to home
      </Link>

      <div className="auth-wrap">
        <div className="auth-stack">
          {/* Brand badge */}
          <div className="auth-badge">LedgerOne</div>

          {/* Heading */}
          <h1 className="auth-title">Sign in to your workspace</h1>
          <p className="auth-sub">Institutional-grade crypto planning, all in one place.</p>

          {/* Card */}
          <form className="auth-card" onSubmit={handleLogin}>
            <div className="l1-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@desk.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="l1-field">
              <div className="auth-label-row">
                <label htmlFor="password">Password</label>
                <Link
                  // This resolves to https://ledger-one-2-0.vercel.app/auth/forgot in production
                  href="/auth/forgot"
                  className="auth-forgot"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" disabled={loading} className="l1-btn l1-btn-primary auth-submit">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="auth-switch">
              Don&apos;t have access yet?{' '}
              <Link href="/signup">Request or create an account</Link>.
            </p>
          </form>

          {/* Footer note */}
          <p className="auth-note">
            Sessions are managed through secure encryption authentication. If you&apos;re not sure which
            email to use, contact your admin.
          </p>
        </div>
      </div>
    </div>
  )
}
