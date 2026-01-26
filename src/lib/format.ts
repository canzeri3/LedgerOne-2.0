// Ensure SSR and client render the exact same strings.
// Force a fixed locale + currency so we don't depend on host/browser defaults.

const LOCALE = 'en-US'
const CURRENCY = 'USD'

// Amount privacy toggle (controlled by AppShell). Defaults to visible to keep SSR/hydration stable.
let AMOUNTS_HIDDEN = false

export function setAmountsHidden(v: boolean) {
  AMOUNTS_HIDDEN = !!v
}

export function getAmountsHidden() {
  return AMOUNTS_HIDDEN
}

/** Format USD consistently with a narrow "$" symbol (no "US$" on some locales). */
export function fmtCurrency(
  value: number | null | undefined,
  opts?: { min?: number; max?: number }
): string {
  if (AMOUNTS_HIDDEN) return '***'
  if (value == null || !Number.isFinite(Number(value))) return '$0.00'
  const n = Number(value)

  // More precision for small numbers
  const min = opts?.min ?? (Math.abs(n) < 1 ? 4 : 2)
  const max = opts?.max ?? (Math.abs(n) < 1 ? 6 : min)

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    currencyDisplay: 'narrowSymbol', // "$" consistently
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(n)
}

/** Format percent consistently. Pass a fraction (e.g. 0.052 => 5.20%). */
export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(Number(value))) return '0%'
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value))
}
