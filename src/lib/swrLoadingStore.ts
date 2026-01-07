'use client'

import { useSyncExternalStore } from 'react'

type Listener = () => void

type State = {
  navId: number
  inFlight: number
}

let state: State = { navId: 0, inFlight: 0 }
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

export function beginRouteLoad() {
  // Start a new navigation generation and reset counters for that generation.
  // Any late completions from the previous generation are ignored.
  state = { navId: state.navId + 1, inFlight: 0 }
  emit()
}

export function getNavId() {
  return state.navId
}

export function incInFlight(navId: number) {
  if (navId !== state.navId) return
  state = { ...state, inFlight: state.inFlight + 1 }
  emit()
}

export function decInFlight(navId: number) {
  if (navId !== state.navId) return
  state = { ...state, inFlight: Math.max(0, state.inFlight - 1) }
  emit()
}

export function useSWRInFlight() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state.inFlight,
    () => 0
  )
}

