import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TOP_COIN_LIMIT = 500
const COINGECKO_PAGE_SIZE = 250

type Gecko = {
  id: string
  symbol: string
  name: string
  image?: string
  market_cap?: number | null
  market_cap_rank?: number | null
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 403 })
  }

  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const pages = Array.from(
      { length: Math.ceil(TOP_COIN_LIMIT / COINGECKO_PAGE_SIZE) },
      (_, index) => index + 1
    )

    const responses = await Promise.all(
      pages.map((page) => {
        const url =
          'https://api.coingecko.com/api/v3/coins/markets' +
          `?vs_currency=usd&order=market_cap_desc&per_page=${COINGECKO_PAGE_SIZE}&page=${page}&sparkline=false`

        return fetch(url, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
      })
    )

    for (const res of responses) {
      if (!res.ok) {
        const txt = await res.text()
        return NextResponse.json({ error: `CoinGecko ${res.status}: ${txt}` }, { status: 502 })
      }
    }

    const payloads = (await Promise.all(responses.map((res) => res.json()))) as Gecko[][]
    const deduped = Array.from(
      new Map(payloads.flat().map((coin) => [coin.id, coin])).values()
    )
      .sort((a, b) => {
        const ra = a.market_cap_rank ?? Number.MAX_SAFE_INTEGER
        const rb = b.market_cap_rank ?? Number.MAX_SAFE_INTEGER
        return ra - rb
      })
      .slice(0, TOP_COIN_LIMIT)

    const rows = deduped.map((c, i) => ({
      coingecko_id: c.id,
      symbol: c.symbol,
      name: c.name,
      image_url: c.image ?? null,
      market_cap: c.market_cap ?? null,
      rank: c.market_cap_rank ?? i + 1,
    }))

    const { data, error } = await supabaseAdmin
      .from('coins')
      .upsert(rows, { onConflict: 'coingecko_id' })
      .select('coingecko_id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      requested: TOP_COIN_LIMIT,
      pagesFetched: pages.length,
      upserted: data?.length ?? 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}