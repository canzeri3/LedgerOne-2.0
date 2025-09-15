// src/lib/format.ts
export const fmtCurrency = (n: number | null | undefined, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 })
    .format(Number.isFinite(n as number) ? (n as number) : 0);

export const fmtNumber = (n: number | null | undefined, digits = 2) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits })
    .format(Number.isFinite(n as number) ? (n as number) : 0);

export const fmtPct = (v: number, digits = 0) =>
  `${(v * 100).toFixed(digits)}%`;

