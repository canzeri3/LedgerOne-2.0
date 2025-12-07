'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

export default function AuthButton() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [busy, setBusy] = useState(false)

  if (loading) {
    // keep minimal; floating look for email preserved elsewhere
    return <div className="text-xs text-slate-400 px-3 py-2 rounded-lg">loading…</div>
  }

  // Unified click handler so the button element and styles never change
  async function handleClick() {
    if (busy) return
    if (user) {
      try {
        setBusy(true)
        await supabaseBrowser.auth.signOut()
        router.refresh()
      } finally {
        setBusy(false)
      }
    } else {
      router.push('/login')
    }
  }

  const short = user?.email ?? 'signed in'
  const isLoggedIn = !!user

  return (
    <div className="flex items-center gap-2">
      {/* EMAIL DISPLAY — floating (no bg/border) */}
      {isLoggedIn && (
        <div className="hidden md:block text-xs text-slate-400 px-3 py-1 rounded">
          {short}
        </div>
      )}

      {/* ALWAYS the same element with the same className to keep UI identical */}
      <button
        aria-label={isLoggedIn ? 'Logout' : 'Login'}
        onClick={handleClick}
        disabled={busy}
        className="Btn disabled:opacity-60"
      >
        <span className="sign" aria-hidden="true">
          {/* Icons flipped per your last request; kept identical style */}
          {isLoggedIn ? (
            // Logout icon — points RIGHT
            <svg viewBox="0 0 24 24">
              <path d="M9.5 6.5a1 1 0 0 0 0 1.4L12.6 11H3a1 1 0 1 0 0 2h9.6l-3.1 3.1a1 1 0 1 0 1.4 1.4l4.8-4.8a1 1 0 0 0 0-1.4L10.9 6.5a1 1 0 0 0-1.4 0zM19 4a1 1 0 0 0-1 1v14a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1z" />
            </svg>
          ) : (
            // Login icon — points LEFT
            <svg viewBox="0 0 24 24">
              <path d="M14.5 6.5a1 1 0 0 1 0 1.4L11.4 11H21a1 1 0 1 1 0 2h-9.6l3.1 3.1a1 1 0 1 1-1.4 1.4L8.3 12.7a1 1 0 0 1 0-1.4l4.8-4.8a1 1 0 0 1 1.4 0zM5 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1z" />
            </svg>
          )}
        </span>
        <span className="text">
          {isLoggedIn ? (busy ? 'Logging out…' : 'Logout') : 'Login'}
        </span>
      </button>

      {/* Component-scoped styles — EXACT same style block you’re using now */}
      <style jsx>{`
        /* From Uiverse.io by vinodjangid07 — size was reduced earlier per your request */
        .Btn {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          width: 36px;           /* keep your smaller size */
          height: 36px;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition-duration: 0.3s;
          box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.199);
          background-color: rgb(75, 73, 108);
        }

        .sign {
          width: 100%;
          transition-duration: 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sign svg {
          width: 15px;           /* keep icon scaled with button */
        }

        .sign svg path {
          fill: white;
        }

        .text {
          position: absolute;
          right: 0%;
          width: 0%;
          opacity: 0;
          color: white;
          font-size: 0.85em;     /* if you changed this, keep your value */
          font-weight: 600;
          transition-duration: 0.3s;
        }

        .Btn:hover {
          width: 105px;          /* keep your smaller hover width */
          border-radius: 40px;
          transition-duration: 0.3s;
        }

        .Btn:hover .sign {
          width: 30%;
          transition-duration: 0.3s;
          padding-left: 20px;
        }

        .Btn:hover .text {
          opacity: 1;
          width: 70%;
          transition-duration: 0.3s;
          padding-right: 10px;
        }

        .Btn:active {
          transform: translate(2px, 2px);
        }
      `}</style>
    </div>
  )
}
