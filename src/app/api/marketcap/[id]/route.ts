export const runtime = 'nodejs'
export const revalidate = 0

import { NextResponse } from 'next/server'

async function fetchJson(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const u = new URL(req.url)
    const days = u.searchParams.get('days') ?? '365'
    const id = params.id
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${encodeURIComponent(days)}`
    const j = await fetchJson(url)
    const caps: [number, number][] = j?.market_caps ?? []
    const data = caps.map(([t, v]) => ({ t, v }))
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

