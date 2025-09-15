import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { computeBuyFills, type BuyLevel, type BuyTrade } from '@/lib/planner'

export const runtime = 'nodejs'

// create a server-side Supabase client that reads/writes the auth cookies
function getServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )
}

// helper: sort level indices by price desc (shallow -> deep)
function byPriceDescIdx(levels: BuyLevel[]) {
  return levels
    .map((lv, i) => ({ i, p: Number(lv.price) }))
    .sort((a, b) => b.p - a.p)
    .map(x => x.i)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const coingeckoId = (url.searchParams.get('coingecko_id') || '').trim()
  const tol = Number(url.searchParams.get('tol') ?? '0.03')

  if (!coingeckoId) {
    return NextResponse.json({ error: 'pass ?coingecko_id=bitcoin (and optional &tol=0.03)' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // try signed-in user first
  const { data: auth } = await supabase.auth.getUser()
  let userId: string | null = auth?.user?.id ?? null

  // fallback: allow manual ?user_id=... or auto-detect latest user for this coin
  if (!userId) {
    const manual = url.searchParams.get('user_id')
    if (manual && manual.length > 0) {
      userId = manual
    } else {
      // last-resort: pick the most recent user that has an active buy planner for this coin (dev only)
      const { data: bpAny, error: eProbe } = await supabase
        .from('buy_planners')
        .select('user_id, started_at')
        .eq('coingecko_id', coingeckoId)
        .order('started_at', { ascending: false })
        .limit(1)
      if (!eProbe && bpAny && bpAny.length > 0) {
        userId = String(bpAny[0].user_id)
      }
    }
  }

  if (!userId) {
    return NextResponse.json({ error: 'no user. Sign in locally, or pass ?user_id=<uuid>' }, { status: 401 })
  }

  // active buy planner
  const { data: bp, error: e0 } = await supabase
    .from('buy_planners')
    .select('id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level,is_active,started_at')
    .eq('user_id', userId)
    .eq('coingecko_id', coingeckoId)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })
  if (!bp?.id) return NextResponse.json({ error: 'no active buy_planners row' }, { status: 404 })

  // planned levels (persisted), or synthesize from planner config if none saved
  const { data: lvlRows, error: eLvls } = await supabase
    .from('buy_levels')
    .select('level,price,allocation')
    .eq('user_id', userId)
    .eq('coingecko_id', coingeckoId)
    .eq('buy_planner_id', bp.id)
    .order('level', { ascending: true })

  let levels: BuyLevel[] = (lvlRows ?? []).map((r: any) => ({
    level: Number(r.level),
    drawdown_pct: 0,
    price: Number(r.price),
    allocation: Number(r.allocation),
    est_tokens: Number(r.price) > 0 ? Number(r.allocation) / Number(r.price) : 0,
  }))

  if (!levels.length) {
    const top = Number((bp as any).top_price || 0)
    const budget = Number((bp as any).budget_usd ?? (bp as any).total_budget ?? 0)
    const depth = ((bp as any).ladder_depth === 90 ? 90 : 70) as 70 | 90
    const growth = Number((bp as any).growth_per_level ?? 25)
    const tmp = await import('@/lib/planner')
    levels = tmp.buildBuyLevels(top, budget, depth, growth)
  }

  // buy trades tagged to this planner
  const { data: buysRaw, error: e1 } = await supabase
    .from('trades')
    .select('price,quantity,fee,trade_time,side,buy_planner_id')
    .eq('user_id', userId)
    .eq('coingecko_id', coingeckoId)
    .eq('side', 'buy')
    .eq('buy_planner_id', bp.id)
    .order('trade_time', { ascending: true })
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  const buys: BuyTrade[] = (buysRaw ?? []).map((t: any) => ({
    price: Number(t.price),
    quantity: Number(t.quantity),
    fee: Number(t.fee ?? 0),
    trade_time: String(t.trade_time),
  }))

  // Derive eligibility band per trade (for visibility)
  const order = byPriceDescIdx(levels)
  const eligibility_per_trade = buys.map(b => {
    const P = Number(b.price)
    let deepest = -1
    for (let k = 0; k < order.length; k++) {
      const i = order[k]
      if (P <= Number(levels[i].price) * (1 + tol)) deepest = k
    }
    const band = deepest >= 0 ? order.slice(0, deepest + 1).map(i => ({
      level: levels[i].level, price: levels[i].price
    })) : []
    return { trade_price: P, eligible_levels: band }
  })

  const fills = computeBuyFills(levels, buys, tol)

  return NextResponse.json({
    user_id: userId,
    coingecko_id: coingeckoId,
    tolerance: tol,
    levels,
    buys,
    eligibility_per_trade,
    result: fills,
  })
}

