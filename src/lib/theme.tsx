'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'

export type Theme = 'dark' | 'light'

// localStorage key — also read by the inline boot script in src/app/layout.tsx
const STORAGE_KEY = 'lg1-theme'

// Marketing routes always render the dark brand look.
// Mirrors MARKETING_ROUTES in AppShell and the boot script in layout.tsx.
const MARKETING_ROUTES = new Set([
  '/',
  '/platform',
  '/how-it-works',
  '/use-cases',
  '/pricing',
  '/contact',
])

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyThemeToDom(theme: Theme, isMarketing: boolean) {
  const el = document.documentElement
  if (theme === 'light' && !isMarketing) {
    el.setAttribute('data-theme', 'light')
    el.style.colorScheme = 'light'
  } else {
    el.removeAttribute('data-theme')
    el.style.colorScheme = 'dark'
  }
}

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // Server render assumes dark (the default); the boot script already applied
  // the stored theme to <html> before paint, so adopt it after mount.
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(readStoredTheme())
  }, [])

  // Keep the DOM attribute in sync with theme + route (marketing stays dark)
  useEffect(() => {
    applyThemeToDom(theme, MARKETING_ROUTES.has(pathname ?? '/'))
  }, [theme, pathname])

  // Signed-in users: adopt the account preference so the theme follows the
  // user across browsers and devices (stored in Supabase auth user metadata).
  useEffect(() => {
    let cancelled = false

    const adopt = (meta: Record<string, unknown> | undefined) => {
      const t = meta?.lg1_theme
      if (t !== 'light' && t !== 'dark') return
      if (cancelled) return
      setTheme(t)
      try {
        window.localStorage.setItem(STORAGE_KEY, t)
      } catch {
        // ignore
      }
    }

    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (data.user) adopt(data.user.user_metadata)
    })

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) adopt(session.user.user_metadata)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light'
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      // Persist to the signed-in user's account (no-op when signed out)
      supabaseBrowser.auth
        .getUser()
        .then(({ data }) => {
          if (data.user) {
            void supabaseBrowser.auth.updateUser({ data: { lg1_theme: next } })
          }
        })
        .catch(() => {
          // ignore — local persistence already succeeded
        })
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
