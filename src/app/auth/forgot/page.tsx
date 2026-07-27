'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { L1Nightsky, L1Grain } from '@/components/ledgerone'
import '../../login/login-skin.css'

type Status = 'idle' | 'loading' | 'sent' | 'error'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      let data: any = {}
      try {
        data = await res.json()
      } catch {
        // non-JSON response, ignore
      }

      if (!res.ok) {
        setStatus('error')
        setMessage(data?.error || 'Failed to send reset email. Please try again.')
        return
      }

      setStatus('sent')
      setMessage('If this email is registered, a secure reset link has been sent.')
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  const isLoading = status === 'loading'
  const isError = status === 'error'

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
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-sub">
            Enter the email you use for LedgerOne. We&apos;ll send you a secure reset link.
          </p>

          {/* Card */}
          <form className="auth-card" onSubmit={handleSubmit}>
            <div className="l1-field">
              <label htmlFor="email">Account email</label>
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

            {message && (
              <p className={isError ? 'auth-error' : 'auth-success'}>{message}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !email}
              className="l1-btn l1-btn-primary auth-submit"
            >
              {isLoading ? 'Sending reset link…' : 'Send reset link'}
            </button>

            <p className="auth-hint">
              The link will send you back into LedgerOne to set a new password. For security, links
              may expire and can only be used once.
            </p>
          </form>

          {/* Footer links */}
          <p className="auth-switch">
            <Link href="/login">Back to sign in</Link>
          </p>
          <p className="auth-note">
            Need help? Contact your administrator or operations desk.
          </p>
        </div>
      </div>
    </div>
  )
}
