'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setInfo(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabaseBrowser.auth.updateUser({ password })
      if (error) throw error
      setInfo('Password updated. You can now log in.')
      setTimeout(() => {
        router.push('/login')
        router.refresh()
      }, 800)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-2xl border border-[#081427] bg-[#07132a] p-6">
        <h1 className="text-lg font-semibold mb-2">Set a new password</h1>
        <p className="text-sm text-slate-400 mb-4">
          Enter a new password for your account.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-300">New password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#0b1830] bg-[#081427] px-3 py-2 text-slate-200 outline-none"
              placeholder="••••••••"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-300">Confirm password</span>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#0b1830] bg-[#081427] px-3 py-2 text-slate-200 outline-none"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full text-sm text-slate-100 px-3 py-2 rounded-lg border border-[#0b1830] bg-[#0a162c] hover:bg-[#0b1830] disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>

        {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
        {info && <div className="mt-3 text-xs text-green-300">{info}</div>}
      </div>
    </div>
  )
}

