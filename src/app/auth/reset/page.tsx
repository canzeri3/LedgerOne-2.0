'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabaseClient'

type Status = 'idle' | 'loading' | 'done' | 'error'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setStatus('error')
      setMessage('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirm) {
      setStatus('error')
      setMessage('Passwords do not match. Please double-check and try again.')
      return
    }

    setStatus('loading')

    try {
      const { error } = await supabaseBrowser.auth.updateUser({ password })

      if (error) {
        setStatus('error')
        setMessage(
          error.message ||
            'Unable to update password. The link may have expired or the session is invalid.'
        )
        return
      }

      setStatus('done')
      setMessage('Password updated successfully. You can now sign in with your new credentials.')
    } catch (err: any) {
      setStatus('error')
      setMessage(
        err?.message ||
          'An unexpected error occurred while updating your password. Please try again.'
      )
    }
  }

  const isLoading = status === 'loading'
  const isDone = status === 'done'
  const isError = status === 'error'

  return (
    <div className="min-h-screen bg-[#131415] text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand header – consistent with /login and /auth/forgot */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            LedgerOne
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-50">
            Create a new password
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            This page was opened from a secure email link. Choose a strong, unique password.
          </p>
        </div>

        {/* Reset password card */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] shadow-xl shadow-black/40 p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label
                htmlFor="new-password"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLoading || isDone}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm-password"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={isLoading || isDone}
              />
            </div>

            {message && (
              <p
                className={`text-xs rounded-md px-3 py-2 ${
                  isError
                    ? 'text-red-400 bg-red-950/40 border border-red-900/60'
                    : 'text-emerald-200 bg-emerald-950/40 border border-emerald-900/60'
                }`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || isDone}
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-700/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Updating password…' : isDone ? 'Password updated' : 'Update password'}
            </button>

            <p className="text-[11px] text-slate-500 mt-2">
              For security, password reset links may expire and can usually only be used once. If
              this link no longer works, request a new one from the Forgot password page.
            </p>
          </form>
        </div>

        {/* Footer links with clean spacing */}
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
            If you didn&apos;t request this change, sign out on all devices and notify your
            administrator or operations desk.
          </p>
        </div>
      </div>
    </div>
  )
}
