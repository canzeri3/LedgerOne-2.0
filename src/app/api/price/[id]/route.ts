import { NextResponse } from 'next/server'

/**
 * GET /api/price/[id]
 * Normalized response:
 *   {
 *     price: number | null,   // current USD price
 *     pct24h: number | null,  // 24h change in percent (e.g., -0.82)
 *     abs24h: number | null,  // absolute USD change over 24h
 *     lastPrice: number | null, // yesterday's price implied by pct24h
 *     updatedAt: number | null, // epoch seconds when source last updated
 *     source: 'coingecko_simple' | 'coingecko_markets'
 *   }
 *
 * Notes:
 * - Primary source: /simple/price with include_24hr_change + include_last_updated_at
 * - Fallback: /coins/markets
 * - Always USD; no FX conversions.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params
  const id = decodeURIComponent(rawId || '').trim()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Optional CoinGecko demo key header
  const headers: Record<string, string> = {}
  const apiKey = process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY
  if (apiKey) headers['x-cg-demo-api-key'] = String(apiKey)

  // Helper to build final JSON
  const build = (price: number | null, pct24h: number | null, updatedAtSec: number | null, source: string) => {
    let lastPrice: number | null = null
    let abs24h: number | null = null

    if (price != null && Number.isFinite(price) && pct24h != null && Number.isFinite(pct24h)) {
      // P_now = P_prev * (1 + pct/100) → P_prev = P_now / (1 + pct/100)
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

  // Primary: simple/price
  try {
    const u = new URL('https://api.coingecko.com/api/v3/simple/price')
    u.searchParams.set('ids', id)
    u.searchParams.set('vs_currencies', 'usd')
    u.searchParams.set('include_24hr_change', 'true')
    u.searchParams.set('include_last_updated_at', 'true')
    u.searchParams.set('precision', 'full')

    const r = await fetch(u.toString(), {
      headers,
      next: { revalidate: 30 },
    })
    if (!r.ok) throw new Error(`simple/price upstream ${r.status}`)

    const j = await r.json()
    const row = j?.[id]
    const price = typeof row?.usd === 'number' ? row.usd : null
    const pct24h = typeof row?.usd_24h_change === 'number' ? row.usd_24h_change : null
    const updatedAtSec = typeof row?.last_updated_at === 'number' ? row.last_updated_at : null

    if (price == null) throw new Error('simple/price returned no USD price')

    return NextResponse.json(build(price, pct24h, updatedAtSec, 'coingecko_simple'), {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=30' },
    })
  } catch (primaryErr) {
    // Fallback: coins/markets
    try {
      const u2 = new URL('https://api.coingecko.com/api/v3/coins/markets')
      u2.searchParams.set('vs_currency', 'usd')
      u2.searchParams.set('ids', id)
      u2.searchParams.set('precision', 'full')

      const r2 = await fetch(u2.toString(), {
        headers,
        next: { revalidate: 30 },
      })
      if (!r2.ok) throw new Error(`markets upstream ${r2.status}`)

      const arr = await r2.json()
      const row = Array.isArray(arr) ? arr[0] : null
      const price =
        row && typeof row.current_price === 'number' ? row.current_price : null
      const pct24h =
        row && typeof row.price_change_percentage_24h === 'number'
          ? row.price_change_percentage_24h
          : null

      // markets returns ISO in row.last_updated — normalize to epoch seconds
      const updatedAtSec =
        row && typeof row.last_updated === 'string'
          ? Math.floor(new Date(row.last_updated).getTime() / 1000)
          : null

      if (price == null) throw new Error('markets returned no USD price')

      return NextResponse.json(build(price, pct24h, updatedAtSec, 'coingecko_markets'), {
        headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=30' },
      })
    } catch (fallbackErr) {
      return NextResponse.json(
        {
          price: null,
          pct24h: null,
          abs24h: null,
          lastPrice: null,
          updatedAt: null,
          source: 'none',
          error: String(
            primaryErr instanceof Error ? primaryErr.message : primaryErr
          ),
        },
        { status: 502 }
      )
    }
  }
}
