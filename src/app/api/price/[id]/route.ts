import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PriceOut = {
  price: number | null
  pct24h: number | null
  abs24h: number | null
  lastPrice: number | null
  updatedAt: number | null
  source: 'coingecko_simple' | 'coingecko_markets' | 'cache' | 'none'
}

const cache = new Map<string, { data: PriceOut; expiresAt: number; staleAt: number }>()
const inflight = new Map<string, Promise<PriceOut>>()

const now = () => Date.now()

function build(price: number | null, pct24h: number | null, updatedAtSec: number | null, source: PriceOut['source']): PriceOut {
  let lastPrice: number | null = null
  let abs24h: number | null = null
  if (price != null && Number.isFinite(price) && pct24h != null && Number.isFinite(pct24h)) {
    lastPrice = price / (1 + pct24h / 100)
    abs24h = price - lastPrice
  }
  return {
    price: price != null && Number.isFinite(price) ? price : null,
    pct24h: pct24h != null && Number.isFinite(pct24h) ? pct24h : null,
    abs24h: abs24h ?? null,
    lastPrice: lastPrice ?? null,
    updatedAt: updatedAtSec ?? null,
    source,
  }
}

function withHeaders() {
  const headers: Record<string, string> = {}
  const apiKey = process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY
  if (apiKey) headers['x-cg-demo-api-key'] = String(apiKey)
  return headers
}

/**
 * Minimal, robust upstream fetch:
 * - cache: 'no-store' to avoid any Next ISR/dedupe surprises in dev
 * - 3 attempts, exponential backoff, 5s per-attempt hard timeout
 * - retries on 429/5xx only; otherwise bubbles the error
 */
async function fetchJsonWithRetry(url: URL, attempts = 3, timeoutMs = 5000): Promise<any> {
  let lastErr: any
  const headers = withHeaders()
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const r = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
        cache: 'no-store', // ← important: avoid ISR-ish behavior during dev bursts
      })
      clearTimeout(to)
      if (r.ok) return await r.json()

      const body = await r.text().catch(() => '')
      // Retry only on rate limit or server errors
      if ((r.status === 429 || (r.status >= 500 && r.status <= 599)) && i < attempts - 1) {
        await new Promise(res => setTimeout(res, Math.min(2000 * 2 ** i, 6000)))
        continue
      }
      throw new Error(`Upstream ${r.status}${body ? `: ${body.slice(0, 180)}` : ''}`)
    } catch (e: any) {
      clearTimeout(to)
      lastErr = e?.name === 'AbortError' ? new Error('Upstream timeout') : e
      if (i < attempts - 1) {
        // small jittered backoff between attempts
        await new Promise(res => setTimeout(res, 600 + Math.floor(Math.random() * 400)))
      }
    }
  }
  throw lastErr || new Error('Unknown upstream error')
}

async function primarySimple(id: string): Promise<PriceOut> {
  const u = new URL('https://api.coingecko.com/api/v3/simple/price')
  u.searchParams.set('ids', id)
  u.searchParams.set('vs_currencies', 'usd')
  u.searchParams.set('include_24hr_change', 'true')
  u.searchParams.set('include_last_updated_at', 'true')
  u.searchParams.set('precision', 'full')
  const j = await fetchJsonWithRetry(u)
  const row = j?.[id]
  const price = typeof row?.usd === 'number' ? row.usd : null
  if (price == null) throw new Error('simple/price returned no USD price')
  const pct24h = typeof row?.usd_24h_change === 'number' ? row.usd_24h_change : null
  const updatedAtSec = typeof row?.last_updated_at === 'number' ? row.last_updated_at : null
  return build(price, pct24h, updatedAtSec, 'coingecko_simple')
}

async function fallbackMarkets(id: string): Promise<PriceOut> {
  const u = new URL('https://api.coingecko.com/api/v3/coins/markets')
  u.searchParams.set('vs_currency', 'usd')
  u.searchParams.set('ids', id)
  u.searchParams.set('precision', 'full')
  const arr = await fetchJsonWithRetry(u)
  const row = Array.isArray(arr) ? arr[0] : null
  const price = row && typeof row.current_price === 'number' ? row.current_price : null
  if (price == null) throw new Error('markets returned no USD price')
  const pct24h = row && typeof row.price_change_percentage_24h === 'number' ? row.price_change_percentage_24h : null
  const updatedAtSec = row && typeof row.last_updated === 'string' ? Math.floor(new Date(row.last_updated).getTime() / 1000) : null
  return build(price, pct24h, updatedAtSec, 'coingecko_markets')
}

const FRESH_TTL_MS = 60_000      // serve from cache instantly for 60s
const STALE_TTL_MS = 5 * 60_000  // allow stale if upstream fails for up to 5 minutes

// 👇 await params in dev (Next 15 requires this for dynamic APIs)
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params
  const id = decodeURIComponent(raw || '').trim()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Return fresh cache if available
  const hit = cache.get(id)
  if (hit && now() < hit.expiresAt) {
    return NextResponse.json(hit.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
        'X-Price-Cache': 'fresh',
      },
    })
  }

  // Deduplicate concurrent requests for the same id
  if (inflight.has(id)) {
    try {
      const data = await inflight.get(id)!
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
          'X-Price-Cache': 'shared',
        },
      })
    } catch {
      // fallthrough to new attempt below
    }
  }

  const work = (async (): Promise<PriceOut> => {
    try {
      return await primarySimple(id)
    } catch {
      return await fallbackMarkets(id)
    }
  })()

  inflight.set(id, work)
  try {
    const data = await work
    cache.set(id, { data, expiresAt: now() + FRESH_TTL_MS, staleAt: now() + STALE_TTL_MS })
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    })
  } catch (err: any) {
    // Serve stale if we can
    const stale = cache.get(id)
    if (stale && now() < stale.staleAt) {
      const data = { ...stale.data, source: 'cache' as const }
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Price-Cache': 'stale',
        },
      })
    }
    return NextResponse.json(
      {
        price: null,
        pct24h: null,
        abs24h: null,
        lastPrice: null,
        updatedAt: null,
        source: 'none' as const,
        error: String(err?.message || err),
      },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    )
  } finally {
    inflight.delete(id)
  }
}
