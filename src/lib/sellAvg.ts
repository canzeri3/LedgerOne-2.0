// src/lib/sellAvg.ts
// Computes a weighted average price based on *filled* buy trades.
// This does NOT change any UI; it only returns a number you can display.
// Robust to empty sets and partial data.

export type FilledBuy = {
  price: number | null
  filled_qty: number | null
}

// Weighted average: sum(p*q) / sum(q)
export function computeWeightedAvgFromFilledBuys(rows: FilledBuy[]): number | null {
  if (!rows || rows.length === 0) return null

  let cost = 0
  let qty = 0
  for (const r of rows) {
    const p = typeof r.price === 'number' ? r.price : NaN
    const q = typeof r.filled_qty === 'number' ? r.filled_qty : NaN
    if (Number.isFinite(p) && Number.isFinite(q) && q > 0) {
      cost += p * q
      qty += q
    }
  }
  if (qty <= 0) return null
  return cost / qty
}

