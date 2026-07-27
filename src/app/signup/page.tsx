'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { L1Nightsky, L1Grain } from '@/components/ledgerone'
import '../login/login-skin.css'

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
    <div className="l1-auth relative min-h-screen overflow-hidden">
      {/* Night-sky + aurora backdrop, matching the login page */}
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Access a rules-based workspace for planning and tracking.</p>

          {/* Card */}
          <form className="auth-card" onSubmit={handleSignup}>
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
              <label htmlFor="newpw">Create password</label>
              <input
                id="newpw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div className="l1-field">
              <label htmlFor="confirmpw">Confirm password</label>
              <input
                id="confirmpw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              <p className="auth-hint">You must confirm your email before signing in.</p>
            </div>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            <button type="submit" disabled={loading} className="l1-btn l1-btn-primary auth-submit">
              {loading ? 'Creating…' : 'Create account'}
            </button>

            <p className="auth-switch">
              Already have access?{' '}
              <Link href="/login">Sign in</Link>.
            </p>
          </form>

          {/* Footer note */}
          <p className="auth-note">
            LedgerOne is a planning and tracking tool. It does not provide investment advice.
          </p>
        </div>
      </div>
    </div>
  )
}
