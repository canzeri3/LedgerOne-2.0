'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Card from '@/components/ui/Card'

const supabase =
  typeof window !== 'undefined'
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      )
    : (null as any)

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    if (password.length < 8) return setMessage('Password must be at least 8 characters.')
    if (password !== confirm) return setMessage('Passwords do not match.')

    setStatus('loading')
    try {
      if (!supabase) throw new Error('Supabase not available.')
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setStatus('error'); setMessage(error.message); return }
      setStatus('done'); setMessage('Password updated! You can now sign in.')
    } catch (err: any) {
      setStatus('error'); setMessage(err?.message || 'Failed to update password.')
    }
  }

  return (
    <div className="px-4 md:px-6 py-10 max-w-lg mx-auto">
      <Card title="Set a new password" subtitle="Enter and confirm your new password.">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1" htmlFor="pw">New password</label>
            <input
              id="pw" type="password" minLength={8} required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1" htmlFor="cpw">Confirm password</label>
            <input
              id="cpw" type="password" minLength={8} required value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between">
            <a href="/auth" className="text-xs text-slate-300 hover:text-white">Back to sign in</a>
            <button
              type="submit" disabled={status === 'loading'}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {status === 'loading' ? 'Saving…' : 'Update password'}
            </button>
          </div>

          {message && (
            <p className={`text-xs ${status === 'error' ? 'text-red-400' : 'text-slate-300'}`}>{message}</p>
          )}
        </form>
      </Card>
    </div>
  )
}

