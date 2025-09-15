import { NextResponse } from 'next/server'

export const revalidate = 300 // ~5 min ISR cache

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
      cache: 'force-cache',
      ...opts,
    })
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const fromStr = url.searchParams.get('from')
  const toStr = url.searchParams.get('to')

  if (!id || !fromStr) {
    return NextResponse.json({ points: [], reason: 'missing_params' }, { status: 200 })
  }

  const nowMs = Date.now()
  const fromMs = Number(fromStr)
  const toMs = toStr ? Number(toStr) : nowMs

  if (!Number.isFinite(fromMs) || fromMs <= 0 || fromMs > nowMs) {
    return NextResponse.json({ points: [], reason: 'invalid_from' }, { status: 200 })
  }
  const safeTo = Number.isFinite(toMs) && toMs > fromMs ? toMs : nowMs

  // 1) Try precise RANGE endpoint
  const fromSec = Math.floor(fromMs / 1000)
  const toSec = Math.floor(safeTo / 1000)
  const rangeURL = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id
  )}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`

  let points: { t: number; v: number }[] = []
  const rangeData = await fetchJSON<{ prices: [number, number][] }>(rangeURL)
  if (Array.isArray(rangeData?.prices)) {
    points = rangeData!.prices.map(([t, p]) => ({ t, v: Number(p) }))
  }

  // 2) Fallback to DAYS if range came back thin
  if (points.length < 2) {
    const days = Math.max(1, Math.ceil((safeTo - fromMs) / (24 * 60 * 60 * 1000)))
    const interval = days > 90 ? 'daily' : 'hourly'
    const daysURL = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
      id
    )}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
    const daysData = await fetchJSON<{ prices: [number, number][] }>(daysURL)
    if (Array.isArray(daysData?.prices)) {
      points = daysData!.prices
        .map(([t, p]) => ({ t, v: Number(p) }))
        .filter(p => p.t >= fromMs)
        .sort((a, b) => a.t - b.t)
    }
  }

  // 3) Final fallback: simple/price → synthesize two points
  if (points.length < 2) {
    const spURL = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      id
    )}&vs_currencies=usd`
    const sp = await fetchJSON<Record<string, { usd: number }>>(spURL, { cache: 'no-store' })
    const last = sp && sp[id]?.usd
    if (typeof last === 'number' && isFinite(last)) {
      const nearNow = Date.now()
      points = [
        { t: Math.max(fromMs, nearNow - 1000), v: last },
        { t: nearNow, v: last },
      ]
    } else {
      // As an absolute last resort, return a tiny flat line at 0 (still renders an empty axis)
      const nearNow = Date.now()
      points = [
        { t: Math.max(fromMs, nearNow - 1000), v: 0 },
        { t: nearNow, v: 0 },
      ]
    }
  }

  return NextResponse.json({ points })
}

