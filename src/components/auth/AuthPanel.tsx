'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function AuthPanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // watch session (simple poll to avoid adding a full provider)
  async function refreshSession() {
    const { data } = await supabaseBrowser.auth.getUser()
    setUserEmail(data.user?.email ?? null)
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending'); setError(null)
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
    })
    if (error) { setStatus('error'); setError(error.message); return }
    setStatus('sent')
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut()
    setUserEmail(null)
  }

  // initial state
  if (userEmail === null) { void refreshSession() }

  if (userEmail) {
    return (
      <div className="rounded-lg border border-[#081427] bg-[#0a162c] p-3 text-sm">
        <div className="text-slate-300 mb-2"

