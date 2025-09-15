'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    const em = email.trim()
    const pw = password.trim()
    try {
      if (mode === 'login') {
        const { error } = await supabaseBrowser.auth.signInWithPassword({ email: em, password: pw })
        if (error) {
          const msg = (error as any)?.message ?? ''
          // Supabase often returns "Invalid login credentials" when email isn't confirmed yet.
          if (/invalid login credentials/i.test(msg)) {
            setError('Invalid email or password. If you just created this account and email confirmation is enabled, please confirm your email first (or click “Resend confirmation”).')
          } else {
            setError(msg || 'Login failed')
          }
          return
        }
        router.push('/')
        router.refresh()
      } else {
        const { error } = await supabaseBrowser.auth.signUp({ email: em, password: pw })
        if (error) {
          setError(error.message || 'Sign up failed')
          return
        }
        setInfo('Account created. If confirmations are enabled, check your email; otherwise you can switch to Log in now.')
        setMode('login')
      }
    } finally {
      setBusy(false)
    }
  }

  const resendConfirmation = async () => {
    setBusy(true); setError(null); setInfo(null)
    const em = email.trim()
    if (!em) { setError('Enter your email in the box above first.'); setBusy(false); return }
    try {
      // Supabase v2 resend helper
      const { data, error } = await (supabaseBrowser.auth as any).resend({
        type: 'signup',
        email: em,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      })
      if (error) throw error
      setInfo('Confirmation email sent. Check your inbox.')
    } catch (err: any) {
      setError(err?.message ?? 'Could not resend confirmation email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-2xl border border-[#081427] bg-[#07132a] p-6">
        <h1 className="text-lg font-semibold mb-1">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h1>
        <p className="text-xs text-slate-400 mb-4">
          {mode === 'login'
            ? 'Enter your email and password to access your data.'
            : 'Create your account with email and password.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#0b1830] bg-[#081427] px-3 py-2 text-slate-200 outline-none"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-300">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#0b1830] bg-[#081427] px-3 py-2 text-slate-200 outline-none"
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full text-sm text-slate-100 px-3 py-2 rounded-lg border border-[#0b1830] bg-[#0a162c] hover:bg-[#0b1830] disabled:opacity-60"
          >
            {busy ? (mode === 'login' ? 'Logging in…' : 'Creating…') : (mode === 'login' ? 'Log in' : 'Sign up')}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setInfo(null) }}
            className="text-xs text-slate-400 hover:text-slate-300"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>

          <button
            type="button"
            onClick={resendConfirmation}
            disabled={busy}
            className="text-xs text-slate-400 hover:text-slate-300"
          >
            Resend confirmation
          </button>
        </div>

        {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
        {info && <div className="mt-3 text-xs text-green-300">{info}</div>}

        <p className="mt-4 text-[11px] text-slate-500">
          Tip: If you get “Invalid login credentials” right after signing up, your email might not be confirmed yet (unless confirmations are disabled).
        </p>
      </div>
    </div>
  )
}

