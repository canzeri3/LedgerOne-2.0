'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function AuthButton() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [busy, setBusy] = useState(false)

  if (loading) {
    return <div className="text-xs text-slate-400 px-3 py-2 rounded-lg border border-[#0b1830] bg-[#081427]">loading…</div>
  }
  if (!user) {
    return <Link href="/login" className="text-sm text-slate-200 px-3 py-2 rounded-lg border border-[#0b1830] bg-[#081427] hover:bg-[#0a162c]">Log in</Link>
  }
  const email = user.email ?? ''
  const short = email.length > 24 ? email.slice(0, 24) + '…' : email

  const onLogout = async () => {
    setBusy(true)
    await supabaseBrowser.auth.signOut()
    router.refresh()
    setBusy(false)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:block text-xs text-slate-400 px-2 py-1 rounded bg-[#081427] border border-[#0b1830]">{short}</div>
      <button
        onClick={onLogout}
        disabled={busy}
        className="text-sm text-slate-200 px-3 py-2 rounded-lg border border-[#0b1830] bg-[#081427] hover:bg-[#0a162c] disabled:opacity-60"
      >
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  )
}

