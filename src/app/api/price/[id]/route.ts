// src/app/api/price/[id]/route.ts
import { NextResponse } from 'next/server'
import { getPrice } from '@/server/services/priceService'
import { normalizeCoinId } from '@/server/ids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const raw = ctx.params?.id
  if (!raw) {
    return NextResponse.json(
      {
        price: null,
        pct24h: null,
        abs24h: null,
        lastPrice: null,
        updatedAt: null,
        source: 'none',
        error: 'missing id',
      },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const id = normalizeCoinId(raw)

  try {
    const data = await getPrice(id) // returns an object { price, pct24h, ... }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json(
      {
        price: null,
        pct24h: null,
        abs24h: null,
        lastPrice: null,
        updatedAt: null,
        source: 'none',
        error: 'fetch_failed',
      },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
