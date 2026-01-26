// src/lib/amountVisibilityStore.ts
// Intentionally NOT a client component. Safe to import from anywhere.

export const AMOUNTS_HIDE_STORAGE_KEY = 'lg1_hide_amounts'

export function getAmountsHiddenClient(): boolean {
  // Client-only (reads localStorage). On the server this always returns false.
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(AMOUNTS_HIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

