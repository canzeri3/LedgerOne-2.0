// src/app/api/portfolio-risk/route.ts
import { NextRequest, NextResponse } from 'next/server'

/**
 * Portfolio Risk API
 * - L2 (Σ): Portfolio covariance & annualized vol (portfolio-aware)
 * - L3 (Tail): Value-weighted tail activation share (Bollinger-style)
 * - L4 (Correlation): Value-weighted 90d correlation vs BTC + factor mapping
 * - L5 (Liquidity): Rank-tier mix (snapshot) → liquidity factor (proxy)
 *
 * NEW DATA CORE ONLY:
 *   - /api/price-history (server-to-server) via INTERNAL_BASE_URL
 *   - /api/snapshot (optional, if you have it) for ranks
 *
 * Non-breaking for existing UI: we only ADD .l4 and .l5 blocks.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type HistoryPoint = { t: number; p: number | null }
type HistoryPayload = { id: string; currency: string; points: HistoryPoint[] }
type SnapshotRow = { id: string; rank?: number | null }
type SnapshotPayload = { rows?: SnapshotRow[] }

const DEFAULT_DAYS = 90
const DEFAULT_INTERVAL = 'daily'
const DEFAULT_CURRENCY = 'USD'
const ANN_FACTOR_BY_INTERVAL: Record<string, number> = {
  daily: 365,
  hourly: 24 * 365,
}

const IMPL_ID = 'portfolio-risk Σ+Tail+Corr+Liq vC1'
const BTC_ID = 'bitcoin'

const baseUrl = () => (process.env.INTERNAL_BASE_URL?.trim() || 'http://localhost:3000')

async function fetchHistory(id: string, days: number, interval: string, currency: string): Promise<HistoryPayload | null> {
  const url = `${baseUrl()}/api/price-history?id=${encodeURIComponent(id)}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(interval)}&currency=${encodeURIComponent(currency)}`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const j = (await res.json()) as HistoryPayload
    if (!j?.points?.length) return null
    return j
  } catch {
    return null
  }
}

async function fetchSnapshot(ids: string[]): Promise<Map<string, number | null> | null> {
  if (!ids.length) return new Map()
  const url = `${baseUrl()}/api/snapshot?ids=${encodeURIComponent(ids.join(','))}`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const j = (await res.json()) as SnapshotPayload
    const m = new Map<string, number | null>()
    for (const r of j.rows ?? []) m.set(r.id, (typeof r.rank === 'number') ? r.rank : null)
    return m
  } catch {
    return null
  }
}

// Intersect timestamps across series; return aligned price matrix [asset][time]
function alignSeries(series: { id: string; h: HistoryPayload }[]): { ids: string[]; ts: number[]; prices: number[][] } | null {
  if (!series.length) return null
  const maps = series.map(s => {
    const m = new Map<number, number>()
    for (const pt of s.h.points) if (pt?.p != null && Number.isFinite(pt.p)) m.set(pt.t, Number(pt.p))
    return m
  })
  let keys = Array.from(maps[0].keys())
  for (let i = 1; i < maps.length; i++) {
    const si = new Set(maps[i].keys())
    keys = keys.filter(k => si.has(k))
  }
  keys.sort((a, b) => a - b)
  if (keys.length < 2) return null
  const prices = maps.map(m => keys.map(k => m.get(k)!))
  const ids = series.map(s => s.id)
  return { ids, ts: keys, prices }
}

// Prices -> log returns [asset][t], drop any column containing NaN
function toLogReturns(priceRows: number[][]): number[][] | null {
  if (!priceRows.length) return null
  const nAssets = priceRows.length
  const nTime = priceRows[0].length
  if (nTime < 2) return null
  const rets: number[][] = Array.from({ length: nAssets }, () => [])
  for (let i = 0; i < nAssets; i++) {
    const row = priceRows[i]
    for (let t = 1; t < nTime; t++) {
      const p0 = row[t - 1], p1 = row[t]
      const r = (p0 > 0 && p1 > 0 && Number.isFinite(p0) && Number.isFinite(p1)) ? Math.log(p1 / p0) : Number.NaN
      rets[i].push(r)
    }
  }
  const T = rets[0].length
  const keep: number[] = []
  for (let c = 0; c < T; c++) {
    let ok = true
    for (let i = 0; i < nAssets; i++) if (!Number.isFinite(rets[i][c])) { ok = false; break }
    if (ok) keep.push(c)
  }
  if (keep.length < 20) return null
  return rets.map(row => keep.map(c => row[c]))
}

// Unbiased sample covariance
function covarianceMatrix(rets: number[][]): number[][] {
  const n = rets.length
  const T = rets[0]?.length ?? 0
  if (n === 0 || T < 2) return Array.from({ length: Math.max(1, n) }, () => Array(Math.max(1, n)).fill(0))
  const means = rets.map(r => r.reduce((a, b) => a + b, 0) / T)
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0
      for (let t = 0; t < T; t++) sum += (rets[i][t] - means[i]) * (rets[j][t] - means[j])
      const v = sum / (T - 1)
      cov[i][j] = v
      cov[j][i] = v
    }
  }
  return cov
}

// Light shrinkage towards diagonal
function shrinkDiag(cov: number[][], lambda = 0.05): number[][] {
  const n = cov.length
  const out: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const target = i === j ? cov[i][i] : 0
    out[i][j] = (1 - lambda) * cov[i][j] + lambda * target
  }
  return out
}

const dot = (a: number[], b: number[]) => a.reduce((s, ai, i) => s + ai * b[i], 0)
function matVec(C: number[][], v: number[]): number[] {
  const n = C.length, out = new Array(n).fill(0)
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += C[i][j] * v[j]; out[i] = s }
  return out
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const stdev = (xs: number[]) => {
  const m = mean(xs)
  const vs = xs.reduce((a, b) => a + (b - m) * (b - m), 0)
  return Math.sqrt(vs / Math.max(1, xs.length - 1))
}

function isFiniteNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const idsParam = (url.searchParams.get('ids') || '').trim()
  const valuesParam = (url.searchParams.get('values') || '').trim()
  const days = Number(url.searchParams.get('days') || DEFAULT_DAYS)
  const interval = url.searchParams.get('interval') || DEFAULT_INTERVAL
  const currency = url.searchParams.get('currency') || DEFAULT_CURRENCY
  const annFactor = ANN_FACTOR_BY_INTERVAL[interval] ?? ANN_FACTOR_BY_INTERVAL.daily
  const debug = url.searchParams.get('debug') === '1'

  const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean) : []
  const values = valuesParam ? valuesParam.split(',').map(s => Number(s.trim())) : []

  if (ids.length === 0 || ids.length !== values.length) {
    return NextResponse.json({ status: { ok: false, message: 'ids and values must be provided with equal lengths' }, meta: { impl: IMPL_ID } }, { status: 400 })
  }

  // Normalize value weights
  const totalValue = values.reduce((a, b) => a + Math.max(0, b), 0)
  const wInput = totalValue > 0 ? values.map(v => Math.max(0, v) / totalValue) : values.map(() => 0)

  // Histories (NEW core) — include BTC for correlation even if not in ids
  const uniqIds = Array.from(new Set([...ids, BTC_ID]))
  const histories = await Promise.all(uniqIds.map(id => fetchHistory(id, days, interval, currency)))
  const usable: { id: string; h: HistoryPayload }[] = []
  const missing: string[] = []
  histories.forEach((h, i) => (h?.points?.length ? usable.push({ id: uniqIds[i], h }) : missing.push(uniqIds[i])))

  // We need ≥ 2 portfolio assets for L2; and BTC history for L4
  const havePortfolioAssets = usable.filter(u => ids.includes(u.id)).length
  const haveBTC = usable.some(u => u.id === BTC_ID)

  if (havePortfolioAssets < 1 || !haveBTC) {
    return NextResponse.json({
      status: { ok: false, message: 'Insufficient history (need portfolio assets + BTC).', missing },
      l2: { annVolPortfolio: null, annVol30d: null, diversificationRatio: null, assetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
      l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
      l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
      l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
      cov: { ids: usable.map(u => u.id), window: { days, interval } },
      updatedAt: new Date().toISOString(),
      meta: { impl: IMPL_ID }
    }, { status: 200 })
  }

  const aligned = alignSeries(usable)
  if (!aligned) {
    return NextResponse.json({
      status: { ok: false, message: 'Failed to align series (too few overlapping timestamps).', missing },
      l2: { annVolPortfolio: null, annVol30d: null, diversificationRatio: null, assetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
      l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
      l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
      l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
      cov: { ids: usable.map(u => u.id), window: { days, interval } },
      updatedAt: new Date().toISOString(),
      meta: { impl: IMPL_ID }
    }, { status: 200 })
  }

  const { ids: alignedIds, prices, ts } = aligned
  const returns = toLogReturns(prices)
  if (!returns) {
    return NextResponse.json({
      status: { ok: false, message: 'Too few aligned return observations (need ≥20).', missing },
      l2: { annVolPortfolio: null, annVol30d: null, diversificationRatio: null, assetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
      l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
      l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
      l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
      cov: { ids: alignedIds, window: { days, interval } },
      updatedAt: new Date().toISOString(),
      meta: { impl: IMPL_ID }
    }, { status: 200 })
  }

  // Map original weights to aligned ids and renormalize (portfolio assets only)
  const idToW = new Map<string, number>()
  for (let i = 0; i < ids.length; i++) idToW.set(ids[i], wInput[i])
  const wUsable = alignedIds.map(id => (ids.includes(id) ? (idToW.get(id) ?? 0) : 0))
  const wSum = wUsable.reduce((a, b) => a + b, 0)
  const w = (wSum > 0 ? wUsable.map(x => x / wSum) : wUsable).map(Number)

  // ---------- L2 (Σ-based portfolio volatility) ----------
  let cov = shrinkDiag(covarianceMatrix(returns), 0.05)

  // Per-asset vols (annualized) — use already-declared annFactor
  const assetAnnVols: Record<string, number> = {}
  for (let i = 0; i < cov.length; i++) {
    const dailyVar = Math.max(0, cov[i][i])
    const dailySd = Math.sqrt(dailyVar)
    const annVol = dailySd * Math.sqrt(annFactor)
    assetAnnVols[alignedIds[i]] = Number(annVol)
  }

  // Portfolio variance (daily) and annualized vol (portfolio assets only)
  const Cw = matVec(cov, w)
  const portVarDaily = Math.max(0, dot(w, Cw))
  const portVolAnn = Math.sqrt(portVarDaily) * Math.sqrt(annFactor)

  if (!isFiniteNum(portVolAnn)) {
    return NextResponse.json({
      status: { ok: false, message: 'Numerical issue computing portfolio volatility.', missing },
      l2: { annVolPortfolio: null, annVol30d: null, diversificationRatio: null, assetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
      l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
      l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
      l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
      cov: { ids: alignedIds, window: { days, interval } },
      updatedAt: new Date().toISOString(),
      meta: { impl: IMPL_ID, debug: { alignedPoints: returns[0]?.length ?? 0, weightsUsed: w } }
    }, { status: 200 })
  }

  // Diversification ratio (annualized)
  const sumWiSigmaAnn = w.reduce((acc, wi, i) => acc + wi * (Math.sqrt(Math.max(0, cov[i][i])) * Math.sqrt(annFactor)), 0)
  const diversificationRatio = portVolAnn > 0 ? (sumWiSigmaAnn / portVolAnn) : null

  // Risk contributions (normalized)
  const mcDaily = portVarDaily > 0 ? Cw.map(x => x / Math.sqrt(portVarDaily)) : Cw.map(() => 0)
  const rcRaw: Record<string, number> = {}
  let rcSum = 0
  for (let i = 0; i < w.length; i++) { const rc = w[i] * mcDaily[i]; rcRaw[alignedIds[i]] = rc; rcSum += rc }
  const riskContrib: Record<string, number> = {}
  for (const k of Object.keys(rcRaw)) riskContrib[k] = rcSum > 0 ? rcRaw[k] / rcSum : 0

  // Regime mapping (same bands)
  let regime: 'calm' | 'normal' | 'high' | 'stress' = 'normal'
  let multiplier = 1.0
  if (portVolAnn < 0.55) { regime = 'calm';   multiplier = 0.90 }
  else if (portVolAnn < 0.80) { regime = 'normal'; multiplier = 1.00 }
  else if (portVolAnn <= 1.10) { regime = 'high';   multiplier = 1.25 }
  else { regime = 'stress'; multiplier = 1.60 }
  multiplier = Math.max(0.7, Math.min(2.0, multiplier))

  // ---------- L3 (Tail: Bollinger-style; value-weighted activation share) ----------
  const perAssetTail: Record<string, { last: number; sma20: number; sd20: number; bbLower: number; active: boolean }> = {}
  let activationShare = 0
  for (let i = 0; i < alignedIds.length; i++) {
    if (!ids.includes(alignedIds[i])) continue // only portfolio assets contribute to share
    const row = prices[i]
    const n = row.length
    let last = NaN, sma20 = NaN, sd20 = NaN, bbLower = NaN, active = false
    if (n >= 21) {
      last = row[n - 1]
      const slice = row.slice(n - 20)
      sma20 = mean(slice)
      sd20 = stdev(slice)
      bbLower = sma20 - 2 * sd20
      active = (isFiniteNum(last) && isFiniteNum(bbLower) && last < bbLower)
    }
    perAssetTail[alignedIds[i]] = { last: Number(last), sma20: Number(sma20), sd20: Number(sd20), bbLower: Number(bbLower), active }
    if (active && isFiniteNum(w[alignedIds.indexOf(alignedIds[i])])) {
      activationShare += w[alignedIds.indexOf(alignedIds[i])]
    }
  }
  activationShare = Math.max(0, Math.min(1, activationShare))
  const weightedTailActive = activationShare > 0
  const tailFactor = weightedTailActive ? 1.35 : 1.00

  // ---------- L4 (Correlation: value-weighted corr vs BTC) ----------
  const btcIdx = alignedIds.indexOf(BTC_ID)
  let avgCorrVsBtc: number | null = null
  const perAssetCorr: Record<string, number> = {}
  if (btcIdx >= 0) {
    const T = returns[0]?.length ?? 0
    const muB = mean(returns[btcIdx])
    const sdB = stdev(returns[btcIdx])
    for (let i = 0; i < alignedIds.length; i++) {
      const muI = mean(returns[i])
      const sdI = stdev(returns[i])
      let covIB = 0
      for (let t = 0; t < T; t++) covIB += (returns[i][t] - muI) * (returns[btcIdx][t] - muB)
      const covAdj = covIB / Math.max(1, T - 1)
      const corr = (sdI > 0 && sdB > 0) ? (covAdj / (sdI * sdB)) : 0
      perAssetCorr[alignedIds[i]] = Number(corr)
    }
    // value-weighted mean across portfolio assets only
    let sumW = 0, acc = 0
    for (let i = 0; i < alignedIds.length; i++) {
      if (!ids.includes(alignedIds[i])) continue
      const wi = w[i]
      if (wi > 0 && Number.isFinite(wi)) { sumW += wi; acc += wi * (perAssetCorr[alignedIds[i]] ?? 0) }
    }
    avgCorrVsBtc = (sumW > 0) ? (acc / sumW) : null
  }

  // Correlation → factor mapping
  const corrFactor = (c: number | null): number => {
    if (c == null || !Number.isFinite(c)) return 1.00
    if (c <= 0.40) return 1.00
    if (c <= 0.60) return 1.05
    if (c <= 0.80) return 1.15
    return 1.25
  }
  const l4Factor = corrFactor(avgCorrVsBtc)

  // ---------- L5 (Liquidity: rank-proxy mix → factor) ----------
  // BlueChip 1–2, Large 3–10, Medium 11–20, Small 21–50, Unranked >50 or null
  const ranks = await fetchSnapshot(ids) // portfolio assets only
  let blue = 0, large = 0, medium = 0, small = 0, unranked = 0
  for (let i = 0; i < alignedIds.length; i++) {
    const id = alignedIds[i]
    if (!ids.includes(id)) continue
    const wi = w[i]
    const r = ranks?.get(id) ?? null
    if (r == null) { unranked += wi; continue }
    if (r >= 1 && r <= 2) blue += wi
    else if (r >= 3 && r <= 10) large += wi
    else if (r >= 11 && r <= 20) medium += wi
    else if (r >= 21 && r <= 50) small += wi
    else unranked += wi
  }
  const sumTiers = blue + large + medium + small + unranked
  if (sumTiers > 0) {
    blue /= sumTiers; large /= sumTiers; medium /= sumTiers; small /= sumTiers; unranked /= sumTiers
  }

  // Smooth additive liquidity penalty
  const liquidityFactor =
    1.0
    + 0.20 * large
    + 0.35 * medium
    + 0.55 * small
    + 0.65 * unranked

  // ---------- Compose response ----------
  const resp = {
    status: { ok: true, missing },
    l2: {
      annVolPortfolio: Number(portVolAnn),
      diversificationRatio: diversificationRatio == null ? null : Number(diversificationRatio),
      assetAnnVols,
      riskContrib,
      annVol30d: Number(portVolAnn),
      regime, multiplier: Number(multiplier)
    },
    l3: {
      activationShare: Number(activationShare),
      weightedTailActive,
      factor: Number(tailFactor),
      perAsset: perAssetTail
    },
    l4: {
      avgCorrVsBtc: (avgCorrVsBtc == null ? null : Number(avgCorrVsBtc)),
      factor: Number(l4Factor),
      perAsset: perAssetCorr
    },
    l5: {
      tierWeights: { blue: Number(blue), large: Number(large), medium: Number(medium), small: Number(small), unranked: Number(unranked) },
      factor: Number(liquidityFactor)
    },
    cov: { ids: alignedIds, window: { days, interval } },
    updatedAt: new Date().toISOString(),
    meta: {
      impl: IMPL_ID,
      debug: debug ? {
        alignedPoints: returns[0]?.length ?? 0,
        timestampsKept: (returns[0]?.length ?? 0) + 1,
        firstTs: ts?.[0], lastTs: ts?.[ts.length - 1],
        weightsUsed: w,
        portVarDaily, annFactor, portVolAnn, sumWiSigmaAnn,
        tail: { activationShare, weightedTailActive, tailFactor },
        corr: { avgCorrVsBtc, l4Factor },
        liq: { blue, large, medium, small, unranked, liquidityFactor }
      } : undefined
    }
  }

  // Defensive: never ok:true with non-finite critical numbers
  const l2 = resp.l2 as any
  if (!isFiniteNum(l2.annVolPortfolio) || !isFiniteNum(l2.annVol30d) || !isFiniteNum(resp.l2.multiplier) || !isFiniteNum(resp.l3.factor) || !isFiniteNum(resp.l5.factor)) {
    return NextResponse.json({
      status: { ok: false, message: 'Post-check failed: non-finite values in L2/L3/L5.', missing },
      l2: { annVolPortfolio: null, annVol30d: null, diversificationRatio: null, assetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
      l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
      l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
      l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
      cov: resp.cov,
      updatedAt: resp.updatedAt,
      meta: { impl: IMPL_ID, debug: resp.meta.debug }
    }, { status: 200 })
  }

  return NextResponse.json(resp, { status: 200 })
}
