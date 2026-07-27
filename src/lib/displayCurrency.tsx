'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { setDisplayCurrency, type DisplayCurrency } from '@/lib/format'

/**
 * Display-currency state for the whole app.
 *
 * All values in LedgerOne are stored and computed in USD; switching currency is a
 * display-time conversion using one FX rate from /api/fx. The provider sets the
 * module globals in @/lib/format *before* updating React state, then CurrencyRemount
 * remounts the page content so every fmtCurrency call re-runs with the new rate.
 */

const STORAGE_KEY = 'lg1_display_currency'
const CODES: DisplayCurrency[] = ['USD', 'CAD', 'EUR']

type Ctx = {
  code: DisplayCurrency
  setCode: (c: DisplayCurrency) => void
}

const DisplayCurrencyContext = createContext<Ctx>({ code: 'USD', setCode: () => {} })

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<DisplayCurrency>('USD')

  const applyCode = useCallback(async (next: DisplayCurrency) => {
    if (!CODES.includes(next)) return
    try {
      let rate = 1
      if (next !== 'USD') {
        const res = await fetch(`/api/fx?from=USD&to=${encodeURIComponent(next)}`, {
          cache: 'no-store',
        })
        const data = await res.json()
        rate = Number(data?.rate)
        if (!res.ok || !data?.ok || !Number.isFinite(rate) || rate <= 0) {
          throw new Error('fx_unavailable')
        }
      }
      // Globals first so the remount renders with the new rate already in place.
      setDisplayCurrency(next, rate)
      setCodeState(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
    } catch {
      // Rate unavailable — stay on the current currency.
    }
  }, [])

  // Init from localStorage AFTER mount (avoids hydration issues)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as DisplayCurrency | null
      if (saved && saved !== 'USD' && CODES.includes(saved)) void applyCode(saved)
    } catch {
      // ignore
    }
  }, [applyCode])

  return (
    <DisplayCurrencyContext.Provider value={{ code, setCode: applyCode }}>
      {children}
    </DisplayCurrencyContext.Provider>
  )
}

export function useDisplayCurrency() {
  return useContext(DisplayCurrencyContext)
}

/** Remounts its subtree when the display currency changes so all formatted values refresh. */
export function CurrencyRemount({ children }: { children: ReactNode }) {
  const { code } = useDisplayCurrency()
  return (
    <div key={code} className="contents">
      {children}
    </div>
  )
}
