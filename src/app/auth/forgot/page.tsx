'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle'|'loading'|'sent'|'error'>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading'); setMessage('')
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error'); setMessage(data?.error || 'Failed to send reset email.'); return
      }
      setStatus('sent'); setMessage('Check your inbox for a reset link.')
    } catch {
      setStatus('error'); setMessage('Network error. Please try again.')
    }
  }

  return (
    <div className="px-4 md:px-6 py-10 max-w-md mx-auto">
      <Card title="Forgot Password" subtitle="Enter your email and we’ll send a secure reset link.">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs text-slate-300 mb-1">Email address</label>
            <input
              id="email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-[#0a162c]/60 border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex items-center justify-between">
            <a href="/login" className="text-xs text-slate-300 hover:text-white">Back to sign in</a>
            <button
              type="submit"
              disabled={status === 'loading' || !email}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {status === 'loading' ? 'Sending…' : 'Send reset link'}
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

