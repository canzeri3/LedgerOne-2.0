// Ensure SSR and client render the exact same strings.
// Force a fixed locale + currency so we don't depend on host/browser defaults.

const LOCALE = 'en-US'

// Display currency (controlled by DisplayCurrencyProvider). Values are stored in USD
// everywhere; conversion happens at format time only. Defaults keep SSR/hydration stable.
export type DisplayCurrency = 'USD' | 'CAD' | 'EUR'

let DISPLAY_CURRENCY: DisplayCurrency = 'USD'
let FX_RATE_FROM_USD = 1

export function setDisplayCurrency(code: DisplayCurrency, rateFromUsd: number) {
  DISPLAY_CURRENCY = code
  FX_RATE_FROM_USD = Number.isFinite(rateFromUsd) && rateFromUsd > 0 ? rateFromUsd : 1
}

export function getDisplayCurrency(): DisplayCurrency {
  return DISPLAY_CURRENCY
}

/** Convert a USD amount into the active display currency (for hand-built strings, e.g. chart ticks). */
export function usdToDisplay(value: number): number {
  return value * FX_RATE_FROM_USD
}

/** Bare symbol for hand-built strings: "$" for USD/CAD, "€" for EUR. */
export function displayCurrencySymbol(): string {
  return DISPLAY_CURRENCY === 'EUR' ? '€' : '$'
}

// Amount privacy toggle (controlled by AppShell). Defaults to visible to keep SSR/hydration stable.
let AMOUNTS_HIDDEN = false

export function setAmountsHidden(v: boolean) {
  AMOUNTS_HIDDEN = !!v
}

export function getAmountsHidden() {
  return AMOUNTS_HIDDEN
}

/** Format a USD value in the active display currency with a narrow symbol ("$" / "€", never "US$" or a code suffix). */
export function fmtCurrency(
  value: number | null | undefined,
  opts?: { min?: number; max?: number }
): string {
  if (AMOUNTS_HIDDEN) return '***'
  if (value == null || !Number.isFinite(Number(value))) return `${displayCurrencySymbol()}0.00`
  const n = Number(value) * FX_RATE_FROM_USD

  // More precision for small numbers
  const min = opts?.min ?? (Math.abs(n) < 1 ? 4 : 2)
  const max = opts?.max ?? (Math.abs(n) < 1 ? 6 : min)

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: DISPLAY_CURRENCY,
    currencyDisplay: 'narrowSymbol', // "$" / "€" consistently
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
