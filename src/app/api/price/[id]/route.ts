// src/app/api/price/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  ada: 'cardano',
  xrp: 'ripple',
  doge: 'dogecoin',
  bnb: 'binancecoin',
  avax: 'avalanche-2',
  dot: 'polkadot',
  matic: 'polygon-pos',
  link: 'chainlink',
  ltc: 'litecoin',
}

type Out = {
  price: number | null
  change_24h: number | null   // fraction (0.05 = +5%)
  captured_at: string | null
  provider: string | null
  stale: boolean
}

export async function GET(_req: Request, context: { params: { id: string } }) {
  const raw = (context?.params?.id || '').trim()
  if (!raw) {
    return NextResponse.json<Out>({
      price: null, change_24h: null, captured_at: null, provider: null, stale: true
    }, { status: 400 })
  }

  const lower = raw.toLowerCase()
  const id = SYMBOL_TO_COINGECKO[lower] ?? lower

  // latest snapshot
  const { data: latest, error: e1 } = await supabase
    .from('price_snapshots')
    .select('price,captured_at,provider')
    .eq('coingecko_id', id)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (e1) {
    return NextResponse.json<Out>({
      price: null, change_24h: null, captured_at: null, provider: null, stale: true,
    }, { status: 500 })
  }

  if (!latest) {
    return NextResponse.json<Out>({
      price: null, change_24h: null, captured_at: null, provider: null, stale: true
    })
  }

  const latestPrice = Number(latest.price)
  const capturedAtMs = new Date(String(latest.captured_at)).getTime()

  // nearest snapshot ≥24h earlier
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: prev } = await supabase
    .from('price_snapshots')
    .select('price,captured_at')
    .eq('coingecko_id', id)
    .lte('captured_at', sinceIso)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prevPrice = prev ? Number(prev.price) : null
  const change_24h = prevPrice && prevPrice > 0 ? (latestPrice - prevPrice) / prevPrice : null

  return NextResponse.json<Out>({
    price: Number.isFinite(latestPrice) ? latestPrice : null,
    change_24h,
    captured_at: String(latest.captured_at),
    provider: latest.provider ?? 'snapshot',
    stale: (Date.now() - capturedAtMs) > 10 * 60 * 1000
  })
}

