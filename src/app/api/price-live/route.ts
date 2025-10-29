// src/app/api/price-live/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getPrice } from '@/server/services/priceService'
import { normalizeCoinId } from '@/server/ids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 4.10-compliant, robust batched price endpoint.
 * Strategy:
 * 1) Normalize symbols -> canonical CG IDs.
 * 2) Try CoinGecko multi in chunks.
 * 3) Fallback per-id via getPrice with bounded concurrency + retries.
 * 4) Reject non-positive (<=0) prices as null.
 */

const CG_BASE = process.env.COINGECKO_API_BASE?.trim() || 'https://api.coingecko.com/api/v3'
const MULTI_CHUNK = 50
const INTER_CHUNK_DELAY = 120
const FALLBACK_CONCURRENCY = 4
const MAX_RETRIES = 2
const BASE_DELAY_MS = 160

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function jitter(mult = 1) { return (0.5 + Math.random()) * mult }
function isNum(n: any): n is number { return typeof n === 'number' && Number.isFinite(n) }
function sanitizePrice(n: any): number | null {
  if (!isNum(n)) return null
  if (n <= 0) return null
  return n
}

type Row = { id: string; price: number | null; pct24h: number | null; abs24h: number | null; source: string | null }

async function fetchMultiChunk(canonIds: string[]): Promise<Map<string, { price: number | null; pct24h: number | null }>> {
  const out = new Map<string, { price: number | null; pct24h: number | null }>()
  if (canonIds.length === 0) return out

  const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(canonIds.join(','))}&vs_currencies=usd&include_24hr_change=true`
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } })
    if (!r.ok) return out
    const j = await r.json() as Record<string, { usd?: number; usd_24h_change?: number }>
    for (const id of canonIds) {
      const rec = j?.[id]
      const price = sanitizePrice(rec?.usd)
      const pct = isNum(rec?.usd_24h_change) ? rec.usd_24h_change : null
      if (price != null || pct != null) out.set(id, { price, pct24h: pct })
    }
  } catch { /* ignore; fallback will handle */ }
  return out
}

async function fetchOneFallback(originalId: string, canonicalId: string): Promise<Row> {
  let attempt = 0
  for (;;) {
    try {
      const res = (await getPrice(canonicalId)) as any
      const price = sanitizePrice(
        isNum(res) ? res : (isNum(res?.price) ? res.price : null)
      )
      const pct24h = isNum(res?.pct24h)
        ? res.pct24h
        : (isNum(res?.change_24h_pct) ? res.change_24h_pct : (isNum(res?.change_24h_percent) ? res.change_24h_percent : null))
      const abs24h = isNum(res?.abs24h) ? res.abs24h : (isNum(res?.change_24h) ? res.change_24h : null)
      return {
        id: originalId,
        price,
        pct24h: pct24h ?? null,
        abs24h: abs24h ?? null,
        source: (price != null ? (res?.source ?? 'unknown') : 'none'),
      }
    } catch {
      if (attempt >= MAX_RETRIES) {
        return { id: originalId, price: null, pct24h: null, abs24h: null, source: 'none' }
      }
      attempt += 1
      const delay = Math.ceil(BASE_DELAY_MS * Math.pow(2, attempt) * jitter())
      await sleep(delay)
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = (searchParams.get('ids') || '').trim()

  if (!raw) {
    return NextResponse.json(
      { rows: [], updatedAt: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const originals = Array.from(
    new Set(
      raw.split(',').map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase())
    )
  )

  // Build mapping original -> canonical id
  const canonByOriginal = new Map<string, string>()
  for (const o of originals) canonByOriginal.set(o, normalizeCoinId(o))

  // 1) Multi endpoint (in chunks)
  const uniqueCanon = Array.from(new Set(Array.from(canonByOriginal.values())))
  const chunks: string[][] = []
  for (let i = 0; i < uniqueCanon.length; i += MULTI_CHUNK) {
    chunks.push(uniqueCanon.slice(i, i + MULTI_CHUNK))
  }

  const multiMap = new Map<string, { price: number | null; pct24h: number | null }>()
  for (let i = 0; i < chunks.length; i++) {
    const m = await fetchMultiChunk(chunks[i])
    m.forEach((v, k) => multiMap.set(k, v))
    if (i < chunks.length - 1) await sleep(INTER_CHUNK_DELAY * jitter())
  }

  const rows: Row[] = new Array(originals.length)
  const unresolved: Array<{ original: string; canonical: string; idx: number }> = []

  originals.forEach((orig, idx) => {
    const canon = canonByOriginal.get(orig)!
    const found = multiMap.get(canon)
    if (found && (found.price != null || found.pct24h != null)) {
      rows[idx] = {
        id: orig,
        price: sanitizePrice(found.price),
        pct24h: found.pct24h,
        abs24h: null,
        source: found.price != null ? 'coingecko_simple' : 'coingecko_simple',
      }
    } else {
      unresolved.push({ original: orig, canonical: canon, idx })
    }
  })

  // 2) Fallback per-id with bounded concurrency
  if (unresolved.length) {
    let cursor = 0
    const results: Array<Row | undefined> = new Array(unresolved.length)
    async function worker() {
      while (cursor < unresolved.length) {
        const me = cursor++
        const u = unresolved[me]
        results[me] = await fetchOneFallback(u.original, u.canonical)
      }
    }
    const workers = Array.from({ length: Math.min(FALLBACK_CONCURRENCY, unresolved.length) }, () => worker())
    await Promise.all(workers)
    for (let i = 0; i < unresolved.length; i++) {
      const u = unresolved[i]
      rows[u.idx] = results[i]!
    }
  }

  return NextResponse.json(
    { rows, updatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
