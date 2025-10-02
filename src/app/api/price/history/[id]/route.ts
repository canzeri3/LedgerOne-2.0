import { NextResponse } from 'next/server'

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params
  const id = decodeURIComponent(rawId ?? '')
  const url = new URL(req.url)
  const from = url.searchParams.get('from') // ms since epoch
  const now = Date.now()

  let days = 90
  if (from) {
    const fromMs = Number(from)
    if (Number.isFinite(fromMs) && fromMs > 0 && fromMs < now) {
      const diffDays = Math.ceil((now - fromMs) / (1000 * 60 * 60 * 24))
      days = Math.max(1, diffDays)
    }
  }

  const interval = days > 90 ? 'daily' : 'hourly'
  const api = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`

  try {
    const resp = await fetch(api, { headers: { accept: 'application/json' }, cache: 'no-store' })
    if (!resp.ok) {
      // Graceful fallback: empty series
      return NextResponse.json({ points: [], days, interval }, { status: 200 })
    }
    const json = await resp.json()
    const prices = Array.isArray(json?.prices) ? (json.prices as [number, number][]) : []
    const points = prices.map(([t, p]) => ({ t, price: Number(p) }))
    return NextResponse.json({ points, days, interval })
  } catch {
    return NextResponse.json({ points: [], days, interval }, { status: 200 })
  }
}

