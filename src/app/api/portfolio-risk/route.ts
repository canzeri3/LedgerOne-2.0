// src/app/api/portfolio-risk/route.ts
// Portfolio-aware risk (Option A): server compute + caching + bounded concurrency.
// - Uses ONLY new data core endpoints (/api/price-history) via INTERNAL_BASE_URL on server.
// - No UI changes here; this adds a clean contract the page can call later.
// - L2: value-weighted 30d annualized volatility from per-coin daily history.
// - L3: weighted tail activation (share of portfolio below 20d lower band).
//
// Request (GET):
//   /api/portfolio-risk?currency=USD&days=45&interval=daily&ids=bitcoin,ethereum,trx&values=64000,30000,6000
// Response (JSON): see bottom of handler for schema.

import { NextRequest, NextResponse } from 'next/server'

const isServer = () => typeof window === 'undefined'
function baseUrl(): string {
  if (isServer()) return process.env.INTERNAL_BASE_URL || 'http://localhost:3000'
  return ''
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}
function hashString(s: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

// tiny p-limit
function pLimit(concurrency: number) {
  let activeCount = 0
  const queue: (() => void)[] = []
  const next = () => {
    activeCount--
    if (queue.length) queue.shift()!()
  }
  const run = async <T>(fn: () => Promise<T>) => {
    if (activeCount >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    activeCount++
    try {
      return await fn()
    } finally {
      next()
    }
  }
  return run
}

// in-memory caches
type CacheEntry<T> = { value: T; exp: number }
const coinHistCache = new Map<string, CacheEntry<any>>()      // 6h TTL
const riskSnapshotCache = new Map<string, CacheEntry<any>>()  // 12h TTL
function getCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key)
  if (!hit) return null
  if (Date.now() > hit.exp) { map.delete(key); return null }
  return hit.value
}
function putCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  map.set(key, { value, exp: Date.now() + ttlMs })
}

// math
type Pt = { t: number; p: number }
function annVol30dFromDaily(points: Pt[]): number | null {
  if (!points || points.length < 31) return null
  const rets: number[] = []
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1].p
    const p1 = points[i].p
    if (p0 && p1 && p0 > 0) {
      const r = Math.log(p1 / p0)
      if (Number.isFinite(r)) rets.push(r)
    }
  }
  if (rets.length < 20) return null
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const varSum = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0)
  const stdev = Math.sqrt(varSum / Math.max(1, rets.length - 1))
  return clamp(stdev * Math.sqrt(365), 0, 5) // annualize & clamp
}
function smaSd20(points: Pt[]) {
  if (!points || points.length < 20) return { sma: null as number | null, sd: null as number | null }
  const last20 = points.slice(-20)
  const prices = last20.map(x => x.p).filter(p => typeof p === 'number') as number[]
  if (prices.length < 20) return { sma: null, sd: null }
  const sma = prices.reduce((a, b) => a + b, 0) / prices.length
  const mean = sma
  const varSum = prices.reduce((a, b) => a + (b - mean) * (b - mean), 0)
  const sd = Math.sqrt(varSum / Math.max(1, prices.length - 1))
  return { sma, sd }
}
function mapRegime(annVol: number | null): { regime: 'calm' | 'normal' | 'high' | 'stress', multiplier: number } {
  if (annVol == null) return { regime: 'normal', multiplier: 1.00 }
  if (annVol < 0.55) return { regime: 'calm', multiplier: 0.90 }
  if (annVol < 0.80) return { regime: 'normal', multiplier: 1.00 }
  if (annVol <= 1.10) return { regime: 'high', multiplier: 1.25 }
  return { regime: 'stress', multiplier: 1.60 }
}

// history fetch (with micro-cache + retries)
type HistPayload = { id?: string; currency?: string; points: Pt[]; updatedAt?: string }
async function fetchHistory(id: string, days: number, interval: 'daily' | 'hourly' | 'minute', currency: string): Promise<HistPayload | null> {
  const key = `hist:${id}:${days}:${interval}:${currency}`
  const cached = getCache<HistPayload>(coinHistCache, key)
  if (cached) return cached

  const url = `${baseUrl()}/api/price-history?id=${encodeURIComponent(id)}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(interval)}&currency=${encodeURIComponent(currency)}`
  let lastErr: any = null
  for (const delay of [0, 250, 500]) {
    if (delay) await new Promise(r => setTimeout(r, delay))
    try {
      const r = await fetch(url, { cache: 'no-store' as RequestCache })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as HistPayload
      if (!j || !Array.isArray(j.points)) throw new Error('bad payload')
      putCache(coinHistCache, key, j, 6 * 60 * 60 * 1000) // 6h
      return j
    } catch (e) {
      lastErr = e
    }
  }
  console.warn(`[portfolio-risk] history fetch failed for ${id}`, lastErr)
  return null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const currency = (searchParams.get('currency') || 'USD').toUpperCase()
    const days = Number(searchParams.get('days') || 45)
    const interval = (searchParams.get('interval') || 'daily') as 'daily' | 'hourly' | 'minute'
    const idsParam = (searchParams.get('ids') || '').trim()
    const valuesParam = (searchParams.get('values') || '').trim()

    const ids = idsParam
      ? idsParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : []

    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids are required (comma-separated coin ids)' }, { status: 400 })
    }

    // parse values → weights (equal-weight fallback)
    let values: number[] = []
    if (valuesParam.length) {
      values = valuesParam.split(',').map(s => Number(s.trim())).map(n => (Number.isFinite(n) && n >= 0 ? n : 0))
    }
    if (values.length !== ids.length) {
      values = Array.from({ length: ids.length }, () => 1)
    }
    const totalVal = values.reduce((a, b) => a + b, 0)
    const weights = ids.map((id, i) => ({ id, w: totalVal > 0 ? values[i] / totalVal : 1 / ids.length }))

    const allocStr = JSON.stringify(weights.map(x => [x.id, Number(x.w.toFixed(8))]))
    const allocHash = hashString(`${currency}:${days}:${interval}:${allocStr}`)

    // top-level snapshot cache (12h)
    const riskKey = `risk:v2:${currency}:${days}:${interval}:${allocHash}`
    const cached = getCache<any>(riskSnapshotCache, riskKey)
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'max-age=300, stale-while-revalidate=3600' } })
    }

    // fetch histories with bounded concurrency
    const run = pLimit(4)
    const results = await Promise.all(
      weights.map(w =>
        run(async () => ({ id: w.id, w: w.w, hist: await fetchHistory(w.id, days, interval, currency) }))
      )
    )

    const missing: string[] = []
    let sumW = 0
    const avail = results.filter(r => {
      const ok = !!r.hist && Array.isArray(r.hist!.points) && r.hist!.points.length >= 20
      if (!ok) missing.push(r.id)
      return ok
    })
    avail.forEach(r => (sumW += r.w))
    const rows = avail.map(r => ({ id: r.id, w: sumW > 0 ? r.w / sumW : 0, pts: r.hist!.points }))

    // align by common tail (min length)
    const minLen = rows.reduce((m, r) => Math.min(m, r.pts.length), Infinity)
    const aligned = rows.map(r => r.pts.slice(-minLen))

    // per-coin daily log returns
    const coinRets: number[][] = aligned.map(pts => {
      const rets: number[] = []
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1].p
     const p1 = pts[i].p
        if (p0 && p1 && p0 > 0) {
          const r = Math.log(p1 / p0)
          rets.push(Number.isFinite(r) ? r : 0)
        } else {
          rets.push(0)
        }
      }
      return rets
    })

    // portfolio daily returns
    const W = rows.map(r => r.w)
    const T = coinRets[0]?.length ?? 0
    const portRets: number[] = []
    for (let t = 0; t < T; t++) {
      let rp = 0
      for (let i = 0; i < coinRets.length; i++) rp += (W[i] || 0) * (coinRets[i][t] || 0)
      portRets.push(rp)
    }

    // L2
    let annVol30d: number | null = null
    if (portRets.length >= 30) {
      const last30 = portRets.slice(-30)
      const mean = last30.reduce((a, b) => a + b, 0) / last30.length
      const varSum = last30.reduce((a, b) => a + (b - mean) * (b - mean), 0)
      const stdev = Math.sqrt(varSum / Math.max(1, last30.length - 1))
      annVol30d = clamp(stdev * Math.sqrt(365), 0, 5)
    }
    const { regime, multiplier } = mapRegime(annVol30d)

    // L3
    let tailShare = 0
    for (let i = 0; i < rows.length; i++) {
      const pts = rows[i].pts
      const { sma, sd } = smaSd20(pts)
      const lastP = pts.length ? pts[pts.length - 1].p : null
      if (sma != null && sd != null && lastP != null) {
        const lb = sma - 2 * sd
        const inTail = lastP < lb ? 1 : 0
        tailShare += rows[i].w * inTail
      }
    }
    tailShare = clamp(tailShare, 0, 1)
    const weightedTailActive = tailShare >= 0.35
    const tailFactor = weightedTailActive ? 1.35 : 1.00

    const payload = {
      updatedAt: new Date().toISOString(),
      config: { days, interval },
      l2: { annVol30d, regime, multiplier },
      l3: { weightedTailActive, activationShare: tailShare, factor: tailFactor },
      inputs: {
        ids: rows.map(r => r.id),
        weights: Object.fromEntries(rows.map(r => [r.id, Number(r.w.toFixed(6))])),
        allocHash
      },
      version: 'risk.v2.1',
      internals: missing.length ? { missing } : undefined
    }

    putCache(riskSnapshotCache, riskKey, payload, 12 * 60 * 60 * 1000) // 12h TTL
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'max-age=300, stale-while-revalidate=3600' } })
  } catch (e: any) {
    console.error('[portfolio-risk] error', e)
    return NextResponse.json({ error: 'internal_error', message: String(e?.message || e) }, { status: 500 })
  }
}
