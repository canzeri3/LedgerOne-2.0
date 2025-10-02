import { NextResponse } from 'next/server'

/**
 * GET /api/coin-history?id=<coingecko_id>&days=<N|max>
 * - For standard windows (1,7,14,30,90,180,365) → use market_chart?days=...
 * - For custom/long windows (e.g., 259, 407) → use market_chart/range?from=..&to=..
 * - If the primary mode 4xx/5xx, fallback to the other mode automatically.
 * Returns: [{ t: msEpoch, v: price }]
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get('id') || '').trim()
    const daysParam = (searchParams.get('days') || '90').trim() // 'max' or number-as-string

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Helper to choose header (optional key)
    const headers: Record<string, string> = {}
    const apiKey = process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY
    // CoinGecko demo key header name
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey

    // Helpers
    const nowSec = Math.floor(Date.now() / 1000)
    const toJSON = (arr: [number, number][]) => arr.map(([t, v]) => ({ t, v }))

    const allowedDays = new Set([1, 7, 14, 30, 90, 180, 365])

    const fetchDays = async (daysStr: string) => {
      const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart`)
      url.searchParams.set('vs_currency', 'usd')
      url.searchParams.set('days', daysStr)
      // Use daily buckets for longer windows
      const n = Number(daysStr)
      if (daysStr === 'max' || (!Number.isNaN(n) && n >= 90)) {
        url.searchParams.set('interval', 'daily')
      }
      // Slightly better precision handling (optional)
      url.searchParams.set('precision', 'full')

      const r = await fetch(url.toString(), { headers, next: { revalidate: 300 } })
      if (!r.ok) throw new Error(`days(${daysStr}) upstream ${r.status}`)
      const j = await r.json()
      const prices: [number, number][] = j?.prices || []
      return toJSON(prices)
    }

    const fetchRange = async (fromSec: number, toSec: number) => {
      const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart/range`)
      url.searchParams.set('vs_currency', 'usd')
      url.searchParams.set('from', String(fromSec))
      url.searchParams.set('to', String(toSec))
      // Daily-ish spacing when the window is big (server decides, this is just a hint)
      // (Some CG deployments ignore this param; it's harmless to include.)
      url.searchParams.set('interval', 'daily')
      url.searchParams.set('precision', 'full')

      const r = await fetch(url.toString(), { headers, next: { revalidate: 300 } })
      if (!r.ok) throw new Error(`range(${fromSec}->${toSec}) upstream ${r.status}`)
      const j = await r.json()
      const prices: [number, number][] = j?.prices || []
      return toJSON(prices)
    }

    // Decide which method to use
    const numericDays = Number(daysParam)
    const isNumber = !Number.isNaN(numericDays)
    const shouldUseRange =
      (isNumber && (!allowedDays.has(numericDays) || numericDays > 365)) // custom/YTD/max-from-first-buy cases
      || false

    let out:
      | { t: number; v: number }[]
      | null = null

    // Primary path
    try {
      if (daysParam === 'max') {
        // Provider "max" — broadest history
        out = await fetchDays('max')
      } else if (shouldUseRange) {
        const fromSec = nowSec - numericDays * 86400
        out = await fetchRange(fromSec, nowSec)
      } else {
        out = await fetchDays(String(numericDays))
      }
    } catch (primaryErr) {
      // Fallback path: if days failed, try range; if range failed, try days('max')
      try {
        if (daysParam === 'max') {
          // days max failed → try range 10y (as a safe cap)
          const fromSec = nowSec - 10 * 365 * 86400
          out = await fetchRange(fromSec, nowSec)
        } else if (shouldUseRange) {
          // range failed → try closest allowed days bucket
          // choose 365 if >365, else 180/90 fallback
          const fallbackDays =
            numericDays > 365 ? 365 : numericDays > 180 ? 180 : 90
          out = await fetchDays(String(fallbackDays))
        } else {
          // days failed → try range for that span
          const fromSec = nowSec - numericDays * 86400
          out = await fetchRange(fromSec, nowSec)
        }
      } catch {
        // Final safety: return a clear 502 with details
        return NextResponse.json(
          {
            error: 'Upstream fetch failed',
            details: String(primaryErr instanceof Error ? primaryErr.message : primaryErr),
          },
          { status: 502 }
        )
      }
    }

    // Normalize, de-duplicate, and ensure ascending order
    const normalized = (out ?? [])
      .filter(p => p && typeof p.t === 'number' && typeof p.v === 'number')
      .sort((a, b) => a.t - b.t)
      .filter((p, i, arr) => (i === 0 ? true : p.t !== arr[i - 1].t))

    return NextResponse.json(normalized, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

