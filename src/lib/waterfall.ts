export type PlanLevel = {
  level: number              // 1..N (1 = shallowest)
  depth_pct: number          // e.g., 10, 20, ...
  price: number              // target price
  planned_usd: number        // slice of base budget
  filled_usd: number         // allocated from buys
  filled_pct: number         // filled_usd / planned_usd
}

export type BuildPlanInput = {
  startPrice: number
  baseBudget: number
  stepPct: number            // e.g., 10
  depthPct: number           // e.g., 70
  includeExtraDeep: boolean  // add -80/-90
}

export function buildPlan({ startPrice, baseBudget, stepPct, depthPct, includeExtraDeep }: BuildPlanInput): PlanLevel[] {
  if (startPrice <= 0 || baseBudget <= 0) return []

  const depths: number[] = []
  for (let d = stepPct; d <= depthPct + 1e-9; d += stepPct) depths.push(Number(d.toFixed(4)))
  if (includeExtraDeep) {
    if (!depths.includes(80)) depths.push(80)
    if (!depths.includes(90)) depths.push(90)
  }
  depths.sort((a, b) => a - b)

  const n = depths.length || 1
  const perLevel = baseBudget / n

  return depths.map((d, i) => {
    const price = startPrice * (1 - d / 100)
    return {
      level: i + 1,
      depth_pct: d,
      price: Number(price.toFixed(8)),
      planned_usd: Number(perLevel.toFixed(2)),
      filled_usd: 0,
      filled_pct: 0
    }
  })
}

export type Buy = { price: number; qty: number; fee?: number | null }

/**
 * Waterfall allocation:
 * - A BUY is eligible for a level if buy_price <= level_price * (1 + tol)
 * - Allocate each BUY's USD starting from the shallowest eligible level,
 *   filling level's remaining planned_usd, then "waterfall" the leftover to deeper levels.
 */
export function allocateBuysToPlan(plan: PlanLevel[], buys: Buy[], tolPct = 5): PlanLevel[] {
  if (!plan.length || !buys.length) return plan
  const tol = tolPct / 100
  const levels = plan.map(l => ({ ...l, filled_usd: 0, filled_pct: 0 }))

  // sort levels shallow->deep just to be explicit
  levels.sort((a, b) => a.level - b.level)

  // sort buys oldest->newest (optional)
  const orderedBuys = [...buys].sort((a, b) => a.price - b.price) // price-sorted works well for eligibility; time sort also fine

  for (const b of orderedBuys) {
    let usd = b.price * b.qty + (b.fee ? b.fee : 0)
    if (!(usd > 0)) continue

    // find index of first eligible level (shallowest)
    let startIdx = levels.findIndex(l => b.price <= l.price * (1 + tol))
    if (startIdx === -1) continue // buy was above shallowest eligible

    for (let i = startIdx; i < levels.length && usd > 0; i++) {
      const l = levels[i]
      const remaining = Math.max(0, l.planned_usd - l.filled_usd)
      if (remaining <= 0) continue
      const take = Math.min(remaining, usd)
      l.filled_usd += take
      usd -= take
    }
  }

  for (const l of levels) {
    l.filled_pct = l.planned_usd > 0 ? Math.min(1, l.filled_usd / l.planned_usd) : 0
  }
  return levels
}

