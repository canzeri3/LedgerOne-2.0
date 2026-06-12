import { NextRequest, NextResponse } from 'next/server'
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from '@/server/ttlCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500
const HOT_TTL_SECONDS = 300
const LKG_TTL_SECONDS = 60 * 60 * 24
const RETRYABLE_SCHEMA_CACHE_CODES = new Set(['PGRST002', 'PGRST202', 'PGRST204'])

type CoinRow = {
  coingecko_id: string | null
  symbol: string | null
  name: string | null
  rank: number | null
  market_cap_rank: number | null
}

function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''

  if (!url || !key) {
    throw new Error('Missing Supabase URL or key for /api/coins')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema: 'public' },
  })
}

function isRetryableSchemaCacheError(error: PostgrestError) {
  const message = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()

  return (
    RETRYABLE_SCHEMA_CACHE_CODES.has(error.code) ||
    message.includes('schema cache') ||
    message.includes('retrying')
  )
}

type CoinOut = {
  coingecko_id: string | null
  symbol: string | null
  name: string | null
  rank: number | null
  market_cap_rank: number | null
}

function normalizeCoins(data: CoinRow[] | null): CoinOut[] {
  return (data ?? []).map((coin) => ({
    coingecko_id: coin.coingecko_id,
    symbol: coin.symbol,
    name: coin.name,
    rank: coin.rank,
    market_cap_rank: coin.market_cap_rank ?? coin.rank,
  }))
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchCoins(limit: number, order: string) {
  const supabase = getSupabaseServerClient()

  let query = supabase
    .from('coins')
    .select('coingecko_id, symbol, name, rank, market_cap_rank:rank')
    .not('rank', 'is', null)
    .limit(limit)

  if (order === 'marketcap' || order === 'rank') {
    query = query.order('rank', { ascending: true, nullsFirst: false })
  }

  return query
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const rawLimit = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const order = (searchParams.get('order') ?? 'marketcap').toLowerCase()

  const hotKey = `coins:list:${limit}:${order}`
  const lkgKey = `coins:list:lkg:${limit}:${order}`

  const hot = await cacheGet<CoinOut[]>(hotKey)
  if (hot) {
    return NextResponse.json(hot)
  }

  try {
    let { data, error } = await fetchCoins(limit, order)

    for (const backoffMs of [500, 1500]) {
      if (!error || !isRetryableSchemaCacheError(error)) break
      await wait(backoffMs)
      const retry = await fetchCoins(limit, order)
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[api/coins] Supabase full error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })

      const lkg = await cacheGet<CoinOut[]>(lkgKey)
      if (lkg) {
        console.warn('[api/coins] Serving last-known-good coins after Supabase error')
        return NextResponse.json(lkg)
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch coins',
          supabase: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        },
        { status: 500 }
      )
    }

    const coins = normalizeCoins((data ?? []) as CoinRow[])
    await cacheSet(hotKey, coins, HOT_TTL_SECONDS)
    await cacheSet(lkgKey, coins, LKG_TTL_SECONDS)

    return NextResponse.json(coins)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown /api/coins error'
    console.error('[api/coins] Server error:', message)

    const lkg = await cacheGet<CoinOut[]>(lkgKey)
    if (lkg) {
      console.warn('[api/coins] Serving last-known-good coins after server error')
      return NextResponse.json(lkg)
    }

    return NextResponse.json({ error: 'Failed to fetch coins', message }, { status: 500 })
  }
}
