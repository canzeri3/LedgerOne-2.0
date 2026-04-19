import { NextResponse } from 'next/server'

export const revalidate = 0

const SUPPORTED = new Set(['CAD', 'USD', 'EUR', 'CHF', 'MXN', 'JPY'])
const FX_API_BASE = 'https://api.frankfurter.dev/v2'

function normalizeCurrency(value: string | null, fallback: string) {
  const code = String(value || fallback).trim().toUpperCase()
  return SUPPORTED.has(code) ? code : fallback
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const from = normalizeCurrency(url.searchParams.get('from'), 'USD')
    const to = normalizeCurrency(url.searchParams.get('to'), 'CAD')

    if (from === to) {
      const res = NextResponse.json({ ok: true, from, to, rate: 1, source: 'identity' })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    const upstream = `${FX_API_BASE}/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`
    const fxRes = await fetch(upstream, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    if (!fxRes.ok) {
      return NextResponse.json(
        { ok: false, error: `fx_upstream_${fxRes.status}` },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const data = await fxRes.json()
    const rate = Number(data?.rate)

    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { ok: false, error: 'invalid_fx_rate' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const res = NextResponse.json({
      ok: true,
      from,
      to,
      rate,
      source: 'frankfurter',
      date: typeof data?.date === 'string' ? data.date : null,
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err || 'fx_route_failed') },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
