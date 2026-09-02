'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { FormDraft, removeDrafts, type DraftScope, type DraftState, type DraftStorage } from '@/lib/formDraft'

const storage: DraftStorage = {
  get length() { return window.sessionStorage.length },
  key: i => window.sessionStorage.key(i),
  getItem: key => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: key => window.sessionStorage.removeItem(key),
}
const noSubscribe = () => () => {}
let cleanupInstalled = false
function installSignOutCleanup() {
  if (cleanupInstalled) return
  cleanupInstalled = true
  supabaseBrowser.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      try { removeDrafts(storage, () => true) } catch { /* Account-scoped keys still prevent cross-account restoration. */ }
    }
  })
}

export function useFormDraft<T extends object>({ scope, defaults, validate, ready = true }: {
  scope: DraftScope | null
  defaults: T
  validate: (value: unknown) => value is T
  ready?: boolean
}) {
  const identity = JSON.stringify(scope)
  const initial = JSON.stringify(defaults)
  const fallback = useMemo<DraftState<T>>(() => ({ values: JSON.parse(initial), dirty: false, restored: false, warning: null }), [initial])
  const controller = useMemo(() => scope && ready && typeof window !== 'undefined'
    ? new FormDraft(scope, JSON.parse(initial) as T, validate, storage) : null,
  // Keep the in-memory draft through server revalidation, including when browser
  // storage is unavailable. Only a new account/form context gets a new controller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [identity, ready, validate])
  const getFallback = useMemo(() => () => fallback, [fallback])
  const state = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? getFallback, getFallback)
  useEffect(() => { installSignOutCleanup() }, [])
  useEffect(() => { controller?.updateDefaults(JSON.parse(initial) as T) }, [controller, initial])

  return {
    ...state,
    ready: !!controller,
    setField: <K extends keyof T>(field: K, value: T[K] | ((previous: T[K]) => T[K])) => controller?.setField(field, value),
    patch: (change: Partial<T>) => controller?.patch(change),
    reset: (values?: T) => controller?.reset(values),
    markSaved: () => controller?.markSaved(),
  }
}
