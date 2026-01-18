'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

type Props = {
  className?: string
}

type MenuItem = {
  label: string
  href?: string // Placeholder routes can be added later
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Login and Security', href: '#' },
{ label: 'Upgrade Plan', href: '/pricing' },
  { label: 'Manage Communications', href: '#' },
  { label: 'Settings', href: '/settings' },
]

function getInitials(input?: string | null) {
  const raw = (input ?? '').trim()
  if (!raw) return 'LO'

  // If it's an email, use the part before @
  const base = raw.includes('@') ? raw.split('@')[0] : raw

  // Split on spaces, dots, underscores, hyphens
  const parts = base
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) return 'LO'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  const first = parts[0][0] ?? ''
  const last = parts[parts.length - 1][0] ?? ''
  return (first + last).toUpperCase()
}

export default function AuthButton({ className }: Props) {
  const router = useRouter()
  const { user, loading } = useUser()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const initials = useMemo(() => {
    const name =
      (user?.user_metadata as any)?.full_name ||
      (user?.user_metadata as any)?.name ||
      user?.email ||
      null
    return getInitials(name)
  }, [user])

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return

    const onDocClick = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleLogout() {
    if (busy) return
    try {
      setBusy(true)
      setOpen(false)
      await supabaseBrowser.auth.signOut()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function handleItemClick(item: MenuItem) {
    setOpen(false)
    const href = item.href
    if (!href || href === '#') return // hyperlinks assigned later
    router.push(href)
  }

  // Loading state: keep header stable with a skeleton circle
  if (loading) {
    return (
      <div className={['relative', className ?? ''].join(' ').trim()}>
        <div className="h-9 w-9 rounded-full bg-[rgb(31,32,33)] border border-[rgb(43,44,45)] animate-pulse" />
      </div>
    )
  }

// Logged out: show a clear "person" icon button that routes to /login
if (!user) {
  return (
    <div className={['relative', className ?? ''].join(' ').trim()}>
      <button
        type="button"
        aria-label="Log in"
        title="Log in"
        onClick={() => router.push('/login')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(43,44,45)] bg-[rgb(31,32,33)] text-slate-200 hover:bg-[rgb(54,55,56)] transition-colors"
      >
        {/* Minimal grey user icon (no green, no external deps) */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <path
            d="M12 12a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.5 20.25c1.65-3.5 5-5.25 7.5-5.25s5.85 1.75 7.5 5.25"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}


  return (
    <div ref={rootRef} className={['relative', className ?? ''].join(' ').trim()}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(43,44,45)] bg-[rgb(31,32,33)] text-slate-200 text-xs font-semibold hover:bg-[rgb(54,55,56)] transition-colors"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-[rgb(43,44,45)] bg-[rgb(19,20,21)] shadow-lg"
        >
          <div className="px-3 py-2 border-b border-[rgb(43,44,45)]">
            <div className="text-xs text-slate-200 font-medium">Account</div>
            <div className="mt-0.5 text-[11px] text-slate-400 truncate">{user.email}</div>
          </div>

          <div className="py-1">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => handleItemClick(item)}
                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[rgb(31,32,33)] transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="border-t border-[rgb(43,44,45)]">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={busy}
              className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[rgb(31,32,33)] transition-colors disabled:opacity-60"
            >
              {busy ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
