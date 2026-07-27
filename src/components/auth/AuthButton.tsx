'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Home,
  ShieldCheck,
  Sparkles,
  Bell,
  Settings as SettingsIcon,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useMenuTransition } from '@/lib/useMenuTransition'

type LoggedOutVariant = 'icon' | 'pill'

type Props = {
  className?: string
  loggedOutVariant?: LoggedOutVariant
}

type MenuItem = {
  label: string
  icon: LucideIcon
  href?: string // Placeholder routes can be added later
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Landing Page', icon: Home, href: '/' },
  { label: 'Login and Security', icon: ShieldCheck, href: '#' },
  { label: 'Upgrade Plan', icon: Sparkles, href: '/pricing' },
  { label: 'Manage Communications', icon: Bell, href: '/settings?section=notifications' },
  { label: 'Settings', icon: SettingsIcon, href: '/settings' },
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

export default function AuthButton({ className, loggedOutVariant = 'icon' }: Props) {
  const router = useRouter()
  const { user, loading } = useUser()
  const [open, setOpen] = useState(false)
  const { mounted, shown } = useMenuTransition(open)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const fullName = useMemo(() => {
    return (
      (user?.user_metadata as any)?.full_name ||
      (user?.user_metadata as any)?.name ||
      null
    )
  }, [user])

  const initials = useMemo(() => getInitials(fullName || user?.email || null), [fullName, user])

  // Preferred display label: full name, else the part before @ in the email
  const displayName = useMemo(() => {
    if (fullName) return fullName
    const email = user?.email ?? ''
    return email.includes('@') ? email.split('@')[0] : email || 'Account'
  }, [fullName, user])

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
      router.replace('/')
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

  // Loading state: keep header stable with a skeleton matching the variant
  if (loading) {
    return (
      <div className={['relative', className ?? ''].join(' ').trim()}>
        {loggedOutVariant === 'pill' ? (
          <div className="h-8 w-20 rounded-full bg-[rgb(31,32,33)] border border-[rgb(43,44,45)] animate-pulse" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-[rgb(31,32,33)] border border-[rgb(43,44,45)] animate-pulse" />
        )}
      </div>
    )
  }

  // Logged out
  if (!user) {
    // Landing/header variant: preserve the existing pill-style "Log in" button
    if (loggedOutVariant === 'pill') {
      return (
        <div className={['relative', className ?? ''].join(' ').trim()}>
          <button
            type="button"
            aria-label="Log in"
            title="Log in"
            onClick={() => router.push('/login')}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs md:text-sm font-medium text-slate-300 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
          >
            Log in
          </button>
        </div>
      )
    }

    // Default: show a clear "person" icon button that routes to /login
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
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
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
        className={[
          'inline-flex h-9 w-9 items-center justify-center rounded-full',
          'bg-gradient-to-br from-[#7E6FFF] to-[#5E54C0] text-white text-xs font-semibold',
          'ring-1 ring-inset ring-white/15 shadow-sm',
          'transition-[filter,box-shadow] duration-150 hover:brightness-110',
          open ? 'ring-2 ring-[#7E6FFF]/70' : '',
        ].join(' ')}
      >
        {initials}
      </button>

      {mounted && (
        <div
          role="menu"
          aria-label="Account"
          className={[
            "hdr-pop absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-[rgb(43,44,45)] bg-[rgb(19,20,21)] shadow-xl shadow-black/40",
            shown ? "is-open" : "",
          ].join(" ")}
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 px-3.5 py-3 border-b border-[rgb(43,44,45)]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7E6FFF] to-[#5E54C0] text-xs font-semibold text-white ring-1 ring-inset ring-white/15">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-slate-100 capitalize">
                {displayName}
              </div>
              <div className="truncate text-[11px] text-slate-400">{user.email}</div>
            </div>
          </div>

          {/* Navigation */}
          <div className="p-1.5">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => handleItemClick(item)}
                  className="hdr-pop-item group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-200 hover:bg-[rgb(31,32,33)] transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-200" />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* Sign out */}
          <div className="p-1.5 border-t border-[rgb(43,44,45)]">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={busy}
              className="hdr-pop-item group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-rose-300 hover:bg-[rgba(224,91,91,0.12)] hover:text-rose-200 transition-colors disabled:opacity-60"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{busy ? 'Logging out…' : 'Log out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
