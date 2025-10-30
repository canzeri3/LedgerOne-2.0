// src/app/api/price-live/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = { id: string; price: number | null }

/** Small, robust fetch with retry/backoff. Mirrors /api/price/[id] semantics. */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  tries = 2,
  timeoutMs = 5000
) {
  let lastErr: unknown = null
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(to)
      if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        lastErr = new Error(`Upstream ${r.status}`)
      } else {
        return r
      }
    } catch (e) {
      lastErr = e
    }
    await new Promise(res => setTimeout(res, 400 + Math.random() * 250))
  }
  throw lastErr ?? new Error('Upstream error')
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const idsParam = u.searchParams.get('ids') || ''
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)

    if (ids.length === 0) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'private, no-store' } })
    }

    // Fan out to our existing per-coin endpoint with retry
    const rows: Row[] = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetchWithRetry(`${u.origin}/api/price/${encodeURIComponent(id)}`, { cache: 'no-store' })
          if (!r.ok) throw new Error(String(r.status))
          const j: any = await r.json()
          const price = Number(j?.price ?? j?.current_price ?? j?.v)
          return { id, price: Number.isFinite(price) ? price : null }
        } catch {
          // If one coin fails after retries, return null for that id (never break the whole set)
          return { id, price: null }
        }
      })
    )

    return NextResponse.json(rows, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Price-Live': 'ok',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
