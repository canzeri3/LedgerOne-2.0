import { NextResponse } from 'next/server'
import { computeBuyFills, type BuyLevel, type BuyTrade } from '@/lib/planner'

export const runtime = 'nodejs'

export async function GET() {
  const levels: BuyLevel[] = [
    { level: 1, drawdown_pct: 0,  price: 50, allocation: 500, est_tokens: 10 },
    { level: 2, drawdown_pct: 20, price: 40, allocation: 500, est_tokens: 12.5 },
  ]

  // A: buy at the higher level → no spillover into lower level
  const caseA: BuyTrade[] = [
    { price: 50, quantity: 20, fee: 0, trade_time: '2025-01-01T00:00:00Z' },
  ]

  // B: buy below both levels → backfills higher, then fills lower
  const caseB: BuyTrade[] = [
    { price: 40, quantity: 22.5, fee: 0, trade_time: '2025-01-02T00:00:00Z' },
  ]

  const resA = computeBuyFills(levels, caseA)
  const resB = computeBuyFills(levels, caseB)

  return NextResponse.json({
    caseA: { allocatedUsd: resA.allocatedUsd, fillPct: resA.fillPct, offPlanUsd: resA.offPlanUsd },
    caseB: { allocatedUsd: resB.allocatedUsd, fillPct: resB.fillPct, offPlanUsd: resB.offPlanUsd },
  })
}

