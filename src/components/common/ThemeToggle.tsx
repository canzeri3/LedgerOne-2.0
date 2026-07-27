'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

/**
 * Compact sun/moon theme toggle for the in-app header.
 * Matches the existing h-9 w-9 icon-button pattern (privacy eye, settings gear).
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid a hydration mismatch: the icon depends on the client-side theme,
  // so render a same-size placeholder until mounted (no layout shift).
  useEffect(() => {
    setMounted(true)
  }, [])

  const isLight = mounted && theme === 'light'
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center hover:text-slate-50 transition-colors"
    >
      {mounted ? (
        isLight ? (
          <Moon className="h-4 w-4 text-slate-200" />
        ) : (
          <Sun className="h-4 w-4 text-slate-200" />
        )
      ) : (
        <span aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  )
}
