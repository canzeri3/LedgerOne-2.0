// src/lib/planner.ts

// ─────────────────────────────────────────────────────────────
// BUY LEVELS: fixed drawdowns + 25% bigger each deeper level
// ─────────────────────────────────────────────────────────────
export type BuyLevel = {
  level: number
  drawdown_pct: number  // 20,30,...,70 (and 80,90)
  price: number         // top * (1 - dd/100)
  allocation: number    // planned USD at this level
  est_tokens: number    // allocation / price (for display)
}

export function buildBuyLevels(
  topPrice: number,
  budgetUsd: number,
  ladderDepth: 70 | 90,
  growthPctPerLevel: number = 25
): BuyLevel[] {
  if (!(topPrice > 0) || !(budgetUsd > 0)) return []

  const dds = ladderDepth === 70
    ? [20, 30, 40, 50, 60, 70]
    : [20, 30, 40, 50, 60, 70, 80, 90]

  const r = 1 + (growthPctPerLevel / 100)         // geometric weight ratio
  const weights = dds.map((_, i) => Math.pow(r, i))
  const sumW = weights.reduce((s, w) => s + w, 0) || 1

  // allocate budget by weights, floor to cents, fix remainder on the last level
  const raw = weights.map(w => (budgetUsd * w) / sumW)
  const cents = raw.map(x => Math.floor(x * 100))
  let left = Math.round(budgetUsd * 100) - cents.reduce((s, c) => s + c, 0)
  cents[cents.length - 1] += left
  const allocs = cents.map(c => c / 100)

  return dds.map((dd, i) => {
    const price = topPrice * (1 - dd / 100)
    const allocation = allocs[i]
    const est_tokens = price > 0 ? allocation / price : 0
    return {
      level: i + 1,
      drawdown_pct: dd,
      price: Number(price.toFixed(8)),
      allocation: Number(allocation.toFixed(2)),
      est_tokens: Number(est_tokens.toFixed(6)),
    }
  })
}

// ─────────────────────────────────────────────────────────────
// BUY WATERFALL (USD-based) — price eligibility + lock-in
// Strict mode: tolerance defaults to 0 (buy above a level never counts).
// For a trade at P, eligible band = { levels with level.price >= P }.
// Pour USD shallow→deep (by price desc) inside that band only. Leftover is off-plan.
// Buys processed oldest→newest so prior allocations never reshuffle.
// ─────────────────────────────────────────────────────────────
export type BuyTrade = {
  price: number
  quantity: number
  fee?: number | null
  trade_time?: string
}

export type BuyFillResult = {
  allocatedUsd: number[]   // per level (USD filled)
  fillPct: number[]        // per level (0..1) = filledUSD / plannedUSD
  offPlanUsd: number       // overflow USD
  plannedTotal: number     // sum of planned USD across levels
  allocatedTotal: number   // sum of allocatedUsd
}

export function computeBuyFills(
  levels: BuyLevel[],
  trades: BuyTrade[],
  tolerance: number = 0.0  // STRICT by default
): BuyFillResult {
  const plannedTotal = levels.reduce((s, l) => s + Number(l.allocation || 0), 0)

  if (!levels.length || !trades.length) {
    return {
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanUsd: 0,
      plannedTotal,
      allocatedTotal: 0,
    }
  }

  // integer cents for stability
  const plannedCents = levels.map(l => Math.max(0, Math.round(Number(l.allocation) * 100)))
  const remainingCents = [...plannedCents]
  let offPlanCents = 0

  // SHALLOW → DEEP strictly by PRICE (high → low), robust to any incoming order
  const byPriceDesc = levels
    .map((lv, i) => ({ idx: i, price: Number(lv.price) }))
    .sort((a, b) => b.price - a.price)   // higher price first (shallower)
    .map(x => x.idx)

  // Process buys oldest-first (lock-in)
  const byTime = [...trades].sort((a, b) => {
    const ta = a.trade_time ? Date.parse(a.trade_time) : 0
    const tb = b.trade_time ? Date.parse(b.trade_time) : 0
    return ta - tb
  })

  for (const b of byTime) {
    let usdCents = Math.round((Number(b.quantity) * Number(b.price) + Number(b.fee ?? 0)) * 100)
    const P = Number(b.price)
    if (!(usdCents > 0) || !(P > 0)) continue

    // deepest eligible index inside price-sorted order:
    // eligible if P <= level.price * (1 + tolerance)
    let deepestK = -1
    for (let k = 0; k < byPriceDesc.length; k++) {
      const idx = byPriceDesc[k]
      const L = levels[idx]
      if (P <= Number(L.price) * (1 + tolerance)) deepestK = k
    }

    if (deepestK < 0) {
      // Buy above the shallowest target → fully off-plan
      offPlanCents += usdCents
      continue
    }

    // Pour USD shallow → deepest eligible ONLY
    for (let k = 0; k <= deepestK && usdCents > 0; k++) {
      const idx = byPriceDesc[k]
      const need = Math.max(0, remainingCents[idx])
      if (need <= 0) continue
      const take = Math.min(usdCents, need)
      remainingCents[idx] = need - take
      usdCents -= take
    }

    // Anything left after the deepest eligible is off-plan
    if (usdCents > 0) offPlanCents += usdCents
  }

  const allocatedCents = remainingCents.map((rem, i) => plannedCents[i] - rem)
  const allocatedUsd = allocatedCents.map(c => Number((c / 100).toFixed(2)))
  const fillPct = allocatedUsd.map((u, i) => {
    const p = plannedCents[i] / 100
    return p > 0 ? Math.min(1, u / p) : 0
  })
  const allocatedTotal = allocatedUsd.reduce((s, v) => s + v, 0)
  const offPlanUsd = Number((offPlanCents / 100).toFixed(2))

  return { allocatedUsd, fillPct, offPlanUsd, plannedTotal, allocatedTotal }
}

// ─────────────────────────────────────────────────────────────
// SELL LADDER (unchanged)
// ─────────────────────────────────────────────────────────────
export type SellRow = {
  level: number
  target_price: number
  rise_vs_baseline_pct: number
  sell_pct_of_remaining: number
}

export function buildSellLadder(
  baselinePrice: number,
  stepPct: 50 | 100 | 150 | 200,
  levelsCount: number,
  sellPctOfRemaining: number
): SellRow[] {
  if (!(baselinePrice > 0) || !(levelsCount > 0)) return []
  const step = 1 + stepPct / 100
  return Array.from({ length: levelsCount }, (_, i) => {
    const price = baselinePrice * Math.pow(step, i + 1)
    const risePct = ((price - baselinePrice) / baselinePrice) * 100
    return {
      level: i + 1,
      target_price: Number(price.toFixed(8)),
      rise_vs_baseline_pct: Number(risePct.toFixed(4)),
      sell_pct_of_remaining: sellPctOfRemaining,
    }
  })
}

export type SellTrade = {
  price: number
  quantity: number
  fee?: number | null
  trade_time?: string
}

export type SellPlanLevelForFill = {
  target_price: number
  planned_tokens: number
}

export type SellFillResult = {
  allocatedTokens: number[]
  allocatedUsd: number[]
  fillPct: number[]
  offPlanTokens: number
  offPlanUsd: number
  plannedTokensTotal: number
  allocatedTokensTotal: number
  allocatedUsdTotal: number
}

export function computeSellFills(
  levels: SellPlanLevelForFill[],
  trades: SellTrade[],
  tolerance: number = 0.05
): SellFillResult {
  const plannedTokensTotal = levels.reduce((s, l) => s + Number(l.planned_tokens || 0), 0)

  if (!levels.length || !trades.length) {
    return {
      allocatedTokens: levels.map(() => 0),
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanTokens: 0,
      offPlanUsd: 0,
      plannedTokensTotal,
      allocatedTokensTotal: 0,
      allocatedUsdTotal: 0,
    }
  }

  const planned = levels.map(l => Math.max(0, Number(l.planned_tokens)))
  const allocTokens = levels.map(() => 0)
  const allocUsd = levels.map(() => 0)
  let offPlanTokens = 0
  let offPlanUsd = 0

  const sorted = [...trades].sort((a, b) => {
    const ta = a.trade_time ? Date.parse(a.trade_time) : 0
    const tb = b.trade_time ? Date.parse(b.trade_time) : 0
    return ta - tb
  })

  for (const t of sorted) {
    let remainingTokens = Math.max(0, Number(t.quantity))
    const price = Math.max(0, Number(t.price))
    if (remainingTokens <= 0 || price <= 0) continue

    const eligibleIdx = levels
      .map((lv, idx) => ({ idx, ok: price >= Number(lv.target_price) * (1 - tolerance) }))
      .filter(x => x.ok)
      .map(x => x.idx)

    for (const i of eligibleIdx) {
      if (remainingTokens <= 0) break
      const need = Math.max(0, planned[i] - allocTokens[i])
      if (need <= 0) continue
      const take = Math.min(remainingTokens, need)
      allocTokens[i] += take
      allocUsd[i] += take * price
      remainingTokens -= take
    }

    if (remainingTokens > 0) {
      offPlanTokens += remainingTokens
      offPlanUsd += remainingTokens * price
    }
  }

  const allocatedTokens = allocTokens.map(v => Number(v.toFixed(8)))
  const allocatedUsd = allocUsd.map(v => Number(v.toFixed(2)))
  const fillPct = allocatedTokens.map((tk, i) => {
    const p = planned[i]
    return p > 0 ? Math.min(1, tk / p) : 0
  })

  const allocatedTokensTotal = allocatedTokens.reduce((s, v) => s + v, 0)
  const allocatedUsdTotal = allocatedUsd.reduce((s, v) => s + v, 0)

  return {
    allocatedTokens,
    allocatedUsd,
    fillPct,
    offPlanTokens: Number(offPlanTokens.toFixed(8)),
    offPlanUsd: Number(offPlanUsd.toFixed(2)),
    plannedTokensTotal: Number(plannedTokensTotal.toFixed(8)),
    allocatedTokensTotal: Number(allocatedTokensTotal.toFixed(8)),
    allocatedUsdTotal: Number(allocatedUsdTotal.toFixed(2)),
  }
}

