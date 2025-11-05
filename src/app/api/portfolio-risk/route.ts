// src/app/api/portfolio-risk/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Currency, Interval, IntRange, parseIdsCsv, badRequest } from '@/server/schemas/common'

/**
 * Portfolio Risk API (new data core only)
 * L2: portfolio covariance & annualized vol (portfolio-aware)
 * L3: tail activation share (Bollinger-style proxy)
 * L4: correlation vs BTC (90d window)
 * L5: liquidity tier mix (from snapshot ranks) → factor
 *
 * Server-to-server calls:
 *   - /api/price-history (REQUIRED)
 *   - /api/snapshot (OPTIONAL) – ranks for liquidity tiers
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// ---------- Types ----------
type HistoryPoint = { t: number; p: number | null }
type HistoryPayload = { id: string; currency: string; points: HistoryPoint[]; updatedAt?: string | null }
type SnapshotRow = { id: string; rank?: number | null }
type SnapshotPayload = { rows?: SnapshotRow[]; updatedAt?: string | null }

type Aligned = { ids: string[]; ts: number[]; prices: number[][] }

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

// ---------- Validation ----------
const RiskQuery = z.object({
  ids: z.string().min(1, 'ids required'),
  values: z.string().min(1, 'values required'),
  days: IntRange(30, 365).default(DEFAULT_DAYS),
  interval: Interval.default(DEFAULT_INTERVAL as any),
  currency: Currency.default(DEFAULT_CURRENCY),
  debug: z.enum(['0', '1']).optional(),
})

// ---------- Helpers ----------
function isFiniteNum(x: any): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}`)
  return (await r.json()) as T
}

async function fetchHistory(id: string, days: number, interval: 'hourly' | 'daily' | 'minute', currency: string): Promise<HistoryPayload | null> {
  const u = `${baseUrl()}/api/price-history?id=${encodeURIComponent(id)}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(interval)}&currency=${encodeURIComponent(currency)}`
  try {
    const j = await fetchJson<HistoryPayload>(u)
    if (!j || !Array.isArray(j.points)) return null
    return j
  } catch {
    return null
  }
}

// Optional snapshot (if you have it). If not, we’ll treat all as unranked safely.
async function fetchSnapshot(): Promise<SnapshotPayload | null> {
  const u = `${baseUrl()}/api/snapshot`
  try {
    const j = await fetchJson<SnapshotPayload>(u)
    if (!j || !Array.isArray(j.rows)) return null
    return j
  } catch {
    return null
  }
}

// Build rank map { id -> rank }
function toRankMap(snap: SnapshotPayload | null): Record<string, number | null> {
  const map: Record<string, number | null> = {}
  if (!snap?.rows) return map
  for (const r of snap.rows) {
    if (r && typeof r.id === 'string') {
      const rank = typeof r.rank === 'number' && isFiniteNum(r.rank) ? r.rank : null
      map[r.id.toLowerCase()] = rank
    }
  }
  return map
}

// Intersection align all series on common timestamps (exact equality).
function alignSeries(usable: { id: string; h: HistoryPayload }[]): Aligned | null {
  if (!usable.length) return null
  // Build a frequency map of timestamps
  const tsCount = new Map<number, number>()
  const tsPerId: number[][] = []
  for (const u of usable) {
    const tsArr = (u.h.points || []).map(p => p.t).filter(t => Number.isFinite(t))
    tsPerId.push(tsArr)
    for (const t of tsArr) tsCount.set(t, (tsCount.get(t) || 0) + 1)
  }
  // Keep only timestamps present in all series
  const target = usable.length
  const alignedTs = Array.from(tsCount.entries())
    .filter(([, c]) => c === target)
    .map(([t]) => t)
    .sort((a, b) => a - b)

  if (alignedTs.length < 25) return null // need at least ~25 points for stats

  // Create price matrix in the order of usable ids
  const tsIndex = new Map<number, number>()
  alignedTs.forEach((t, i) => tsIndex.set(t, i))
  const prices: number[][] = usable.map(() => new Array(alignedTs.length).fill(NaN))

  for (let i = 0; i < usable.length; i++) {
    const pts = usable[i].h.points
    for (const p of pts) {
      const idx = tsIndex.get(p.t)
      if (idx == null) continue
      const v = p.p
      prices[i][idx] = isFiniteNum(v) && v > 0 ? v : NaN
    }
  }

  // Drop any columns with NaN (should be none due to exact intersection, but be safe)
  const keepIdx: number[] = []
  colLoop: for (let c = 0; c < alignedTs.length; c++) {
    for (let r = 0; r < prices.length; r++) {
      if (!isFiniteNum(prices[r][c])) continue colLoop
    }
    keepIdx.push(c)
  }
  if (keepIdx.length < 25) return null

  const finalTs = keepIdx.map(i => alignedTs[i])
  const finalPrices = prices.map(row => keepIdx.map(i => row[i]))
  const ids = usable.map(u => u.id)

  return { ids, ts: finalTs, prices: finalPrices }
}

// Compute log returns for each series (drop first row).
function toLogReturns(prices: number[][]): number[][] | null {
  const n = prices.length
  if (!n) return null
  const m = prices[0].length
  if (m < 2) return null
  const rets: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = prices[i]
    const r: number[] = []
    for (let j = 1; j < m; j++) {
      const p0 = row[j - 1]
      const p1 = row[j]
      if (!isFiniteNum(p0) || !isFiniteNum(p1) || p0 <= 0 || p1 <= 0) return null
      r.push(Math.log(p1 / p0))
    }
    rets.push(r)
  }
  return rets
}

// Sample covariance matrix (assets x assets) from returns (assets x time)
function covariance(returns: number[][]): { cov: number[][]; var: number[]; mean: number[] } {
  const n = returns.length
  const T = returns[0]?.length ?? 0
  const mean = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let t = 0; t < T; t++) s += returns[i][t]
    mean[i] = s / T
  }
  const cov = Array.from({ length: n }, () => new Array(n).fill(0))
  const vari = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0
      for (let t = 0; t < T; t++) {
        s += (returns[i][t] - mean[i]) * (returns[j][t] - mean[j])
      }
      const val = s / (T - 1)
      cov[i][j] = val
      cov[j][i] = val
    }
    vari[i] = cov[i][i]
  }
  return { cov, var: vari, mean }
}

// Pearson correlation between two assets’ return series
function corr(a: number[], b: number[]): number {
  const T = a.length
  if (T !== b.length || T < 2) return NaN
  let am = 0, bm = 0
  for (let t = 0; t < T; t++) { am += a[t]; bm += b[t] }
  am /= T; bm /= T
  let num = 0, av = 0, bv = 0
  for (let t = 0; t < T; t++) {
    const da = a[t] - am
    const db = b[t] - bm
    num += da * db
    av += da * da
    bv += db * db
  }
  const den = Math.sqrt(av) * Math.sqrt(bv)
  return den > 0 ? num / den : NaN
}

// Simple Bollinger-band style tail activation (on prices):
// active if price < MA - k*std over short window. We approximate with returns:
// active if return < (mean - 2*std). Return share weighted by value weights.
function tailActivationShare(returns: number[][], weights: number[]): { share: number; perAsset: Record<string, number> } {
  const n = returns.length
  const T = returns[0]?.length ?? 0
  const per: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let t = 0; t < T; t++) m += returns[i][t]
    m /= T
    let v = 0
    for (let t = 0; t < T; t++) v += Math.pow(returns[i][t] - m, 2)
    v /= (T - 1)
    const sd = Math.sqrt(Math.max(v, 0))
    if (sd <= 0) { per[i] = 0; continue }
    let count = 0
    for (let t = 0; t < T; t++) {
      if (returns[i][t] < m - 2 * sd) count++
    }
    per[i] = count / T
  }
  // Value-weighted share
  const wsum = weights.reduce((a, b) => a + b, 0) || 1
  let share = 0
  for (let i = 0; i < n; i++) share += (weights[i] / wsum) * per[i]
  // Return both
  return { share, perAsset: {} as Record<string, number> }
}

// Liquidity tier from rank: Blue 1–2, Large 3–10, Medium 11–20, Small 21–50, else Unranked
function tierFromRank(rank: number | null | undefined): 'blue' | 'large' | 'medium' | 'small' | 'unranked' {
  if (rank == null || !isFiniteNum(rank)) return 'unranked'
  if (rank >= 1 && rank <= 2) return 'blue'
  if (rank <= 10) return 'large'
  if (rank <= 20) return 'medium'
  if (rank <= 50) return 'small'
  return 'unranked'
}

// Liquidity factor mapping (conservative, non-breaking): keep baseline 1.0, mildly upweight thinner tiers.
function liquidityFactorFromMix(mix: { blue: number; large: number; medium: number; small: number; unranked: number }): number {
  // weights should sum to 1; map to small adjustments
  const f =
    1.0
    + 0.00 * mix.blue
    + 0.02 * mix.large
    + 0.06 * mix.medium
    + 0.10 * mix.small
    + 0.12 * mix.unranked
  return Number.isFinite(f) ? f : 1.0
}

// ---------- GET handler ----------
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const parsed = RiskQuery.safeParse({
      ids: url.searchParams.get('ids') ?? '',
      values: url.searchParams.get('values') ?? '',
      days: url.searchParams.get('days') ?? String(DEFAULT_DAYS),
      interval: url.searchParams.get('interval') ?? DEFAULT_INTERVAL,
      currency: url.searchParams.get('currency') ?? DEFAULT_CURRENCY,
      debug: url.searchParams.get('debug') ?? '0',
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ...badRequest(parsed.error.errors.map(e => e.message).join('; ')), meta: { apiVersion: 'v1' } },
        { status: 400 }
      )
    }

    const ids = parseIdsCsv(parsed.data.ids, 100)
    const values = parsed.data.values.split(',').map(s => Number(s.trim()))
    if (ids.length === 0) {
      return NextResponse.json({ ...badRequest('no valid ids provided'), meta: { apiVersion: 'v1' } }, { status: 400 })
    }
    if (values.some(v => !Number.isFinite(v) || v < 0)) {
      return NextResponse.json({ ...badRequest('values must be non-negative numbers'), meta: { apiVersion: 'v1' } }, { status: 400 })
    }
    if (values.length !== ids.length) {
      return NextResponse.json({ ...badRequest('ids and values must have equal lengths'), meta: { apiVersion: 'v1' } }, { status: 400 })
    }

    const days = parsed.data.days
    const interval = parsed.data.interval
    const currency = parsed.data.currency
    const annFactor = (interval === 'hourly') ? ANN_FACTOR_BY_INTERVAL.hourly : ANN_FACTOR_BY_INTERVAL.daily
    const debug = parsed.data.debug === '1'

    // Histories (NEW core) — include BTC for correlation even if not in ids
    const uniqIds = Array.from(new Set([...ids, BTC_ID]))
    const histories = await Promise.all(uniqIds.map(i => fetchHistory(i, days, interval, currency)))
    const usable = uniqIds
      .map((id, i) => ({ id, h: histories[i]! }))
      .filter(x => x.h && Array.isArray(x.h.points) && x.h.points.length > 0)

    const missing = uniqIds.filter((id, i) => !histories[i] || !(histories[i]!.points?.length))

    const aligned = alignSeries(usable as any)
    if (!aligned) {
      return NextResponse.json({
        status: { ok: false, message: 'Failed to align series (too few overlapping timestamps).', missing },
        l2: { annVolPortfolio: null, annVol30d: null, diversification: 0, perAssetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
        l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
        l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
        l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
        cov: { ids: usable.map(u => u.id), window: { days, interval } },
        updatedAt: new Date().toISOString(),
        meta: { impl: IMPL_ID, apiVersion: 'v1' }
      }, { status: 200 })
    }

    const { ids: alignedIds, prices, ts } = aligned
    const returns = toLogReturns(prices)
    if (!returns) {
      return NextResponse.json({
        status: { ok: false, message: 'Too few aligned return observations (need ≥20).', missing },
        l2: { annVolPortfolio: null, annVol30d: null, diversification: 0, perAssetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
        l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
        l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
        l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
        cov: { ids: alignedIds, window: { days, interval } },
        updatedAt: new Date().toISOString(),
        meta: { impl: IMPL_ID, apiVersion: 'v1' }
      }, { status: 200 })
    }

    // Normalize value weights to sum to 1
    const totalValue = values.reduce((a, b) => a + Math.max(0, b), 0)
    const w = totalValue > 0 ? values.map(v => Math.max(0, v) / totalValue) : values.map(() => 0)

    // Covariance & per-asset vols
    const { cov, var: vari } = covariance(returns)
    const assetDailyVol = vari.map(v => Math.sqrt(Math.max(v, 0)))
    const perAssetAnnVols: Record<string, number> = {}
    for (let i = 0; i < alignedIds.length; i++) {
      perAssetAnnVols[alignedIds[i]] = assetDailyVol[i] * Math.sqrt(annFactor)
    }

    // Portfolio variance / vol
    // σ_p^2 = w^T Σ w
    const n = alignedIds.length
    const covW = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let j = 0; j < n; j++) s += cov[i][j] * w[j]
      covW[i] = s
    }
    let varP = 0
    for (let i = 0; i < n; i++) varP += w[i] * covW[i]
    const dailyVolP = Math.sqrt(Math.max(varP, 0))
    const annVolPortfolio = dailyVolP * Math.sqrt(annFactor)

    // Diversification proxy: 1 - (σ_p / sqrt(w·diag(Σ)·w))
    let num = 0
    for (let i = 0; i < n; i++) num += w[i] * vari[i]
    const naiveVol = Math.sqrt(Math.max(num, 0))
    const diversification = naiveVol > 0 ? Math.max(0, 1 - (dailyVolP / naiveVol)) : 0

    // Risk contribution (to stdev): RC_i = w_i * (Σ w)_i / σ_p
    const riskContrib: Record<string, number> = {}
    if (dailyVolP > 0) {
      for (let i = 0; i < n; i++) {
        riskContrib[alignedIds[i]] = (w[i] * covW[i]) / dailyVolP
      }
    } else {
      for (let i = 0; i < n; i++) riskContrib[alignedIds[i]] = 0
    }

    // L2 regime + multiplier (conservative baseline)
    const regime = 'normal'
    const multiplier = 1.0

    // L3 tail activation (simple Bollinger proxy on returns)
    const tail = tailActivationShare(returns, w)
    const l3_activationShare = tail.share
    const l3_perAsset: Record<string, number> = {}
    for (let i = 0; i < alignedIds.length; i++) l3_perAsset[alignedIds[i]] = 0 // kept minimal (proxy only)
    const l3_weightedTailActive = l3_activationShare > 0.2
    const l3_factor = 1.0 + Math.min(Math.max(l3_activationShare, 0), 1) * 0.25 // gentle upweight

    // L4 correlation vs BTC
    const idxBTC = alignedIds.indexOf(BTC_ID)
    let avgCorrVsBtc: number | null = null
    const l4_perAsset: Record<string, number> = {}
    if (idxBTC >= 0) {
      const btc = returns[idxBTC]
      let sum = 0, cnt = 0
      for (let i = 0; i < alignedIds.length; i++) {
        if (i === idxBTC) continue
        const c = corr(returns[i], btc)
        if (Number.isFinite(c)) { l4_perAsset[alignedIds[i]] = c; sum += c; cnt++ }
      }
      avgCorrVsBtc = cnt > 0 ? sum / cnt : null
    } else {
      avgCorrVsBtc = null
      for (let i = 0; i < alignedIds.length; i++) l4_perAsset[alignedIds[i]] = NaN
    }
    const l4_factor = avgCorrVsBtc != null ? (1.0 + Math.max(0, Math.min(avgCorrVsBtc, 1)) * 0.15) : 1.0

    // L5 liquidity factor via snapshot ranks
    const snap = await fetchSnapshot()
    const rankMap = toRankMap(snap)
    const tierWeights = { blue: 0, large: 0, medium: 0, small: 0, unranked: 0 }
    for (let i = 0; i < alignedIds.length; i++) {
      const id = alignedIds[i]
      const tier = tierFromRank(rankMap[id] ?? null)
      tierWeights[tier] += w[i]
    }
    const l5_factor = liquidityFactorFromMix(tierWeights)

    const resp = {
      status: { ok: true, message: 'ok' },
      l2: {
        annVolPortfolio,
        annVol30d: annVolPortfolio, // conservative alias; if you compute 30d elsewhere, replace here
        diversification,
        perAssetAnnVols,
        riskContrib,
        regime,
        multiplier,
      },
      l3: {
        activationShare: l3_activationShare,
        weightedTailActive: l3_weightedTailActive,
        factor: l3_factor,
        perAsset: l3_perAsset,
      },
      l4: {
        avgCorrVsBtc,
        factor: l4_factor,
        perAsset: l4_perAsset,
      },
      l5: {
        tierWeights,
        factor: l5_factor,
      },
      cov: {
        ids: alignedIds,
        window: { days, interval },
      },
      updatedAt: new Date().toISOString(),
      meta: { impl: IMPL_ID, apiVersion: 'v1', debug: debug ? { nObs: returns[0].length } : undefined },
    }

    // Post-checks (defensive)
    const l2 = resp.l2
    if (
      !isFiniteNum(l2.annVolPortfolio) ||
      !isFiniteNum(l2.annVol30d) ||
      !isFiniteNum(resp.l3.factor) ||
      !isFiniteNum(resp.l5.factor)
    ) {
      return NextResponse.json({
        status: { ok: false, message: 'Post-check failed: non-finite values in L2/L3/L5.' },
        l2: { annVolPortfolio: null, annVol30d: null, diversification: 0, perAssetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
        l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
        l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
        l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
        cov: resp.cov,
        updatedAt: resp.updatedAt,
        meta: { impl: IMPL_ID, apiVersion: 'v1', debug: resp.meta?.debug }
      }, { status: 200 })
    }

    return NextResponse.json(resp, { status: 200 })
  } catch (err: any) {
    // Always return JSON so CLI parsing never breaks on HTML
    return NextResponse.json({
      status: { ok: false, message: 'internal error' },
      error: String(err?.message || err),
      l2: { annVolPortfolio: null, annVol30d: null, diversification: 0, perAssetAnnVols: {}, riskContrib: {}, regime: 'normal', multiplier: 1.0 },
      l3: { activationShare: 0, weightedTailActive: false, factor: 1.0, perAsset: {} },
      l4: { avgCorrVsBtc: null, factor: 1.0, perAsset: {} },
      l5: { tierWeights: { blue: 0, large: 0, medium: 0, small: 0, unranked: 1 }, factor: 1.0 },
      cov: { ids: [], window: { days: DEFAULT_DAYS, interval: DEFAULT_INTERVAL } },
      updatedAt: new Date().toISOString(),
      meta: { impl: IMPL_ID, apiVersion: 'v1' }
    }, { status: 200 })
  }
}
