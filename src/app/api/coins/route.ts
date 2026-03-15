import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 200

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const rawLimit = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const order = (searchParams.get('order') ?? 'marketcap').toLowerCase()

  let query = supabase
    .from('coins')
    .select('coingecko_id, symbol, name, rank, market_cap_rank:rank')
    .not('rank', 'is', null)
    .limit(limit)

  if (order === 'marketcap') {
    query = query.order('rank', { ascending: true, nullsFirst: false })
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}