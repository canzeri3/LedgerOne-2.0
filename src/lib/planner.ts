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
  ladderDepth: 70 | 75 | 90,
  growthPctPerLevel: number = 25
): BuyLevel[] {
  if (!(topPrice > 0) || !(budgetUsd > 0)) return []

  // Drawdowns by profile:
  // - 70% => Moderate: 6 levels, 20..70
  // - 75% => Aggressive: 3 levels, 25/50/75
  // - 90% => Conservative: 8 levels, 20..90
  let dds: number[]
  if (ladderDepth === 70) {
    dds = [20, 30, 40, 50, 60, 70]
  } else if (ladderDepth === 75) {
    dds = [25, 50, 75]
  } else {
    dds = [20, 30, 40, 50, 60, 70, 80, 90]
  }

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
// Buys processed oldest→newest for on-plan; cheapest-first only
// when recruiting from the off-plan pool.
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
  allocatedTotal: number   // sum of allocatedUsd actually used by ladder
}

/** Helpers for stable, tick-aware comparisons (kept for API compatibility) */
function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0
  const s = String(n)
  const i = s.indexOf('.')
  return i >= 0 ? s.length - i - 1 : 0
}
function inferTickFromLevels(levels: BuyLevel[]): number {
  const maxDp = Math.min(
    8,
    Math.max(0, ...levels.map(l => decimalPlaces(Number(l.price))))
  )
  if (maxDp <= 0) return 0
  return Math.pow(10, -maxDp)
}
function roundToTick(x: number, tick: number): number {
  if (!Number.isFinite(x) || !(tick > 0)) return x
  return Math.round(x / tick) * tick
}

/**
 * BUY WATERFALL (USD-based) with per-block average constraints.
 *
 * Rules:
 * - Only buys within 2% above the top level price are "candidate on-plan".
 * - Buys are processed oldest→newest for on-plan usage.
 * - The ladder never uses more than the planned USD total.
 * - For any depth k, once cumulative USD crosses U₁…k, the blended
 *   average cost must not exceed that block's planned average Aₖ.
 * - Off-plan recruitment (optional) uses cheapest-first, under the same
 *   average constraints.
 */
export function computeBuyFills(
  levels: BuyLevel[],
  trades: BuyTrade[],
  tolerance: number = 0.0,
  _opts?: { tick?: number; absTickEps?: number }
): BuyFillResult {
  const plannedTotal = levels.reduce(
    (sum, lvl) => sum + Number(lvl.allocation || 0),
    0
  )

  // No levels or no budget → nothing to fill
  if (!levels.length || !(plannedTotal > 0)) {
    return {
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanUsd: 0,
      plannedTotal,
      allocatedTotal: 0,
    }
  }

  // No trades → ladder exists but has no fills
  if (!trades.length) {
    return {
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanUsd: 0,
      plannedTotal,
      allocatedTotal: 0,
    }
  }

  const n = levels.length

  // ─────────────────────────────────────────────────────────
  // 1) Planned ladder metrics (U_i, T_i, cumulative, averages)
  // ─────────────────────────────────────────────────────────
  const plannedUsd: number[] = levels.map((l) =>
    Math.max(0, Number(l.allocation || 0))
  )
  const levelPrices: number[] = levels.map((l) => Number(l.price) || 0)

  const plannedTokens: number[] = plannedUsd.map((u, i) =>
    levelPrices[i] > 0 ? u / levelPrices[i] : 0
  )

  const cumUsd: number[] = new Array(n).fill(0)
  const cumTokens: number[] = new Array(n).fill(0)
  const targetAvg: number[] = new Array(n).fill(0)

  let uAcc = 0
  let tAcc = 0
  for (let i = 0; i < n; i++) {
    uAcc += plannedUsd[i]
    tAcc += plannedTokens[i]
    cumUsd[i] = uAcc
    cumTokens[i] = tAcc
    targetAvg[i] = tAcc > 0 ? uAcc / tAcc : 0
  }

  const plannedTotalUsd = cumUsd[n - 1] || 0
  if (!(plannedTotalUsd > 0)) {
    return {
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanUsd: 0,
      plannedTotal,
      allocatedTotal: 0,
    }
  }

  // Top price (shallowest level) and 2% on-plan band above it
  const topPrice = Math.max(...levelPrices.filter((p) => p > 0))
  if (!(topPrice > 0)) {
    return {
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanUsd: 0,
      plannedTotal,
      allocatedTotal: 0,
    }
  }

  const baseBandPct = 0.02
  const extraTol = tolerance > 0 ? tolerance : 0
  const bufferPct = baseBandPct + extraTol
  const onPlanPriceMax = topPrice * (1 + bufferPct)

  // ─────────────────────────────────────────────────────────
  // 2) Normalize trades → internal representation
  //    IMPORTANT: sort by time ASC so we use trades oldest→newest.
  // ─────────────────────────────────────────────────────────
  type InternalTrade = {
    price: number
    usdTotal: number
    usdAssigned: number
    usdRemaining: number
  }

  const internalTrades: InternalTrade[] = []
  let totalUsdAllTrades = 0

  const sortedBuys = trades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const ta = a.t.trade_time ? Date.parse(a.t.trade_time) : 0
      const tb = b.t.trade_time ? Date.parse(b.t.trade_time) : 0
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb
      }
      return a.idx - b.idx
    })

  for (const { t: tr } of sortedBuys) {
    const price = Number(tr.price)
    const qty = Number(tr.quantity)
    const fee = tr.fee != null ? Number(tr.fee) : 0
    const usdTotal = price * qty + (Number.isFinite(fee) ? fee : 0)

    if (!(usdTotal > 0) || !(price > 0) || !(qty > 0)) continue

    internalTrades.push({
      price,
      usdTotal,
      usdAssigned: 0,
      usdRemaining: usdTotal,
    })
    totalUsdAllTrades += usdTotal
  }

  if (!internalTrades.length) {
    return {
      allocatedUsd: levels.map(() => 0),
      fillPct: levels.map(() => 0),
      offPlanUsd: 0,
      plannedTotal,
      allocatedTotal: 0,
    }
  }

  // Split into candidate on-plan vs off-plan by price band
  const candidateOnPlan: InternalTrade[] = []
  const offPlanPool: InternalTrade[] = []

  for (const t of internalTrades) {
    if (t.price <= onPlanPriceMax) {
      candidateOnPlan.push(t)
    } else {
      offPlanPool.push(t)
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3) Global ladder assignment with per-block averages
  //    We always work within one "block" (1..k) at a time to keep
  //    the average constraint monotonic, then move deeper.
  // ─────────────────────────────────────────────────────────
  let ladderUsd = 0
  let ladderTokens = 0
  const EPS = 1e-9

  // Returns the index of the *next* block we are about to fill:
  // the smallest k such that ladderUsd < cumUsd[k].
  function nextBlockIdxForUsd(currentUsd: number): number | null {
    for (let k = 0; k < n; k++) {
      if (currentUsd < cumUsd[k] - EPS) {
        return k
      }
    }
    return null
  }

  function assignFromTrade(t: InternalTrade) {
    if (!(t.usdRemaining > 0)) return

    while (t.usdRemaining > 1e-9 && ladderUsd < plannedTotalUsd - EPS) {
      const blockIdx = nextBlockIdxForUsd(ladderUsd)
      if (blockIdx == null) break

      const allowedAvg = targetAvg[blockIdx]
      if (!(allowedAvg > 0)) break

      const blockCap = cumUsd[blockIdx] - ladderUsd
      const globalCap = plannedTotalUsd - ladderUsd
      const hi = Math.min(t.usdRemaining, blockCap, globalCap)

      if (!(hi > 1e-9)) break

      const price = t.price

      // Helper: blended average if we add x USD from this trade
      function avgIfAdd(x: number): number {
        const newUsd = ladderUsd + x
        const newTokens = ladderTokens + x / price
        return newUsd / newTokens
      }

      let x: number

      // If we can take the whole hi inside this block and still respect
      // the block's planned average, just take it.
      if (avgIfAdd(hi) <= allowedAvg + EPS) {
        x = hi
      } else {
        // Otherwise, find the largest x ∈ [0, hi] such that avg(x) ≤ allowedAvg.
        let lo = 0
        let hiLocal = hi
        for (let iter = 0; iter < 50; iter++) {
          const mid = (lo + hiLocal) / 2
          if (avgIfAdd(mid) <= allowedAvg + EPS) {
            lo = mid
          } else {
            hiLocal = mid
          }
        }
        x = lo
      }

      if (!(x > 1e-9)) {
        // This trade cannot add any more USD to this block without breaking
        // the block's average. We stop for this trade; cheaper trades later
        // may still help.
        break
      }

      ladderUsd += x
      ladderTokens += x / t.price
      t.usdAssigned += x
      t.usdRemaining -= x
    }
  }

  // Step 1: use candidate on-plan trades IN ORDER (oldest → newest)
  for (const t of candidateOnPlan) {
    assignFromTrade(t)
    if (ladderUsd >= plannedTotalUsd - EPS) break
  }

  // Step 2: optionally recruit from off-plan when under-funded (cheapest-first)
  if (ladderUsd < plannedTotalUsd - EPS && offPlanPool.length > 0) {
    offPlanPool.sort((a, b) => a.price - b.price)
    for (const t of offPlanPool) {
      assignFromTrade(t)
      if (ladderUsd >= plannedTotalUsd - EPS) break
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4) Distribute ladderUsd top-down to levels (UI waterfall)
  // ─────────────────────────────────────────────────────────
  const allocatedUsdByLevel: number[] = new Array(n).fill(0)
  let remainingForLevels = ladderUsd

  for (let i = 0; i < n; i++) {
    const planned = plannedUsd[i]
    if (!(planned > 0) || !(remainingForLevels > 0)) {
      allocatedUsdByLevel[i] = 0
      continue
    }
    const take = Math.min(planned, remainingForLevels)
    allocatedUsdByLevel[i] = take
    remainingForLevels -= take
  }

  const allocatedUsd = allocatedUsdByLevel.map((u) =>
    Number(u.toFixed(2))
  )

  const fillPct = allocatedUsd.map((u, i) => {
    const p = plannedUsd[i]
    return p > 0 ? Math.min(1, u / p) : 0
  })

  const allocatedTotal = allocatedUsd.reduce((s, v) => s + v, 0)
  const rawOffPlanUsd = Math.max(0, totalUsdAllTrades - allocatedTotal)
  const offPlanUsd = Number(rawOffPlanUsd.toFixed(2))

  return {
    allocatedUsd,
    fillPct,
    offPlanUsd,
    plannedTotal,
    allocatedTotal,
  }
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
  const plannedTokensTotal = levels.reduce(
    (s, l) => s + Number(l.planned_tokens || 0),
    0
  )

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
      .map((lv, idx) => ({
        idx,
        ok: price >= Number(lv.target_price) * (1 - tolerance),
      }))
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
