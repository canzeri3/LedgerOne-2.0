'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AMOUNTS_HIDE_STORAGE_KEY } from '@/lib/amountVisibilityStore'

type AmountVisibilityCtx = {
  hidden: boolean
  toggle: () => void
  setHidden: (v: boolean) => void
}

const Ctx = createContext<AmountVisibilityCtx | null>(null)

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(AMOUNTS_HIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function AmountVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHiddenState] = useState<boolean>(() => readInitial())

  const setHidden = useCallback((v: boolean) => setHiddenState(!!v), [])
  const toggle = useCallback(() => setHiddenState(v => !v), [])

  useEffect(() => {
    try {
      window.localStorage.setItem(AMOUNTS_HIDE_STORAGE_KEY, hidden ? '1' : '0')
    } catch {
      // ignore
    }
  }, [hidden])

  // Force a full subtree re-render so any fmtCurrency() calls re-evaluate immediately.
  const subtreeKey = hidden ? 'hide' : 'show'

  const value = useMemo<AmountVisibilityCtx>(() => ({ hidden, toggle, setHidden }), [hidden, toggle, setHidden])

  return (
    <Ctx.Provider value={value}>
      <React.Fragment key={subtreeKey}>{children}</React.Fragment>
    </Ctx.Provider>
  )
}

export function useAmountVisibility() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAmountVisibility must be used within AmountVisibilityProvider')
  return v
}

