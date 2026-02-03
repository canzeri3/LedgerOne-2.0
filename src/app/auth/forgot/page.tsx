'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'

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
  const isSent = status === 'sent'

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

        {/* Brand header (same style as login) */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            LedgerOne
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-50">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter the email you use for LedgerOne. We&apos;ll send you a secure reset link.
          </p>
        </div>

        {/* Forgot password card */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] shadow-xl shadow-black/40 p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Account email
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

            {message && (
              <p
                className={`text-xs rounded-md px-3 py-2 ${
                  isError
                    ? 'text-red-400 bg-red-950/40 border border-red-900/60'
                    : 'text-slate-200 bg-slate-900/50 border border-slate-700/70'
                }`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !email}
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-700/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Sending reset link…' : 'Send reset link'}
            </button>

            <p className="text-[11px] text-slate-500 mt-2">
              The link will send you back into LedgerOne to set a new password. For security, links
              may expire and can only be used once.
            </p>
          </form>
        </div>

        {/* Footer links with clean spacing (no crunching) */}
        <div className="mt-6 text-center space-y-2">
          <div>
            <Link
              href="/login"
              className="text-xs font-medium text-indigo-300 hover:text-indigo-200 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
          <p className="text-[11px] text-slate-500">
            Need help? Contact your administrator or operations desk.
          </p>
        </div>
      </div>
    </div>
  )
}
