import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  // Lock in production by default; remove if you want to allow it live.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 403 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Supabase admin credentials are not configured.' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const url =
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false'

    const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `CoinGecko ${res.status}: ${txt}` }, { status: 502 })
    }

    type Gecko = {
      id: string
      symbol: string
      name: string
      image?: string
      market_cap?: number | null
      market_cap_rank?: number | null
    }

    const list: Gecko[] = await res.json()

    const rows = list.map((c, i) => ({
      coingecko_id: c.id,
      symbol: c.symbol,
      name: c.name,
      image_url: c.image ?? null,
      market_cap: c.market_cap ?? null,
      rank: c.market_cap_rank ?? i + 1, // fallback to list order if missing
    }))

    const { data, error } = await supabaseAdmin
      .from('coins')
      .upsert(rows, { onConflict: 'coingecko_id' })
      .select('coingecko_id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ upserted: data?.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

