import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildBuyLevels,
  computeBuyFills,
  computeSellFills,
  type BuyTrade,
  type SellPlanLevelForFill,
  type SellTrade,
} from '@/lib/planner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function env(name: string) {
  return (process.env[name] ?? '').trim()
}

function canonId(id: string) {
  return (id || '').trim().toLowerCase()
}

function readCronSecret(req: NextRequest) {
  const url = new URL(req.url)
  const qs = (url.searchParams.get('secret') ?? '').trim()
  const hdr = (req.headers.get('x-cron-secret') ?? '').trim()
  return hdr || qs
}

function getSupabaseAdmin() {
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')
  const key =
    env('SUPABASE_SERVICE_ROLE_KEY') ||
    env('SUPABASE_SERVICE_ROLE') ||
    env('SUPABASE_SERVICE_KEY')

  if (!url || !key) throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// Uses NEW data core endpoint (server-to-server) with INTERNAL_BASE_URL.
type PricesPayload = { rows: Array<{ id: string; price: number | null }> }

async function getCorePrices(ids: string[], currency: string): Promise<Record<string, number>> {
  const clean = Array.from(new Set(ids.map(canonId).filter(Boolean)))
  if (!clean.length) return {}

  const base = env('INTERNAL_BASE_URL') || 'http://localhost:3000'
  const url =
    `${base}/api/prices?ids=` +
    encodeURIComponent(clean.join(',')) +
    `&currency=` +
    encodeURIComponent(currency)

  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Core prices failed: ${r.status} ${txt}`.slice(0, 300))
  }

  const json = (await r.json().catch(() => ({ rows: [] }))) as PricesPayload
  const map: Record<string, number> = {}
  for (const row of json.rows ?? []) {
    const id = canonId(String(row?.id ?? ''))
    if (!id) continue
    map[id] = Number(row?.price ?? 0)
  }
  return map
}

type BuyPlannerRow = {
  id: string
  coingecko_id: string
  top_price: number | null
  budget_usd: number | null
  total_budget: number | null
  ladder_depth: number | null
  growth_per_level: number | null
}

type SellPlannerRow = {
  id: string
  coingecko_id: string
}

type SellLevelRow = {
  sell_planner_id: string
  level: number
  price: number
  sell_tokens: number
}

type StateRow = {
  user_id: string
  last_alert_keys: string | null
  last_alert_count: number | null
}

async function sendResendEmail(args: { to: string; subject: string; text: string }) {
  const apiKey = env('RESEND_API_KEY')
  const from = env('NOTIFY_EMAIL_FROM')

  if (!apiKey || !from) {
    throw new Error('Email not configured (RESEND_API_KEY / NOTIFY_EMAIL_FROM).')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
    }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Resend failed: ${res.status} ${txt}`.slice(0, 600))
  }

  return res.json().catch(() => ({}))
}

function keysToHumanCoins(keys: string[]) {
  const out: string[] = []
  for (const k of keys) {
    const parts = String(k).split(':')
    const cid = parts.length >= 2 ? parts[1] : ''
    if (cid) out.push(cid)
  }
  return Array.from(new Set(out))
}

export async function GET(req: NextRequest) {
  const started = Date.now()

  try {
    const expected = env('CRON_SECRET')
    const provided = readCronSecret(req)
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const dry = url.searchParams.get('dry') === '1'
    const force = url.searchParams.get('force') === '1'
    const onlyUserId = (url.searchParams.get('userId') ?? '').trim() || null
    const testEmail = (url.searchParams.get('testEmail') ?? '').trim() || null

    if (testEmail) {
      const base = env('INTERNAL_BASE_URL') || 'http://localhost:3000'
      const subject = 'LedgerOne · Test Alert'
      const text = `Bitcoin trigger.\n\nOpen LedgerOne to review: ${base}`
      if (!dry) await sendResendEmail({ to: testEmail, subject, text })
      return NextResponse.json(
        { ok: true, mode: 'testEmail', dry, sent: dry ? 0 : 1, to: testEmail },
        { status: 200 }
      )
    }

    const supabase = getSupabaseAdmin()

    let userIds: string[] = []
    if (onlyUserId) {
      userIds = [onlyUserId]
    } else {
      const [buys, sells] = await Promise.all([
        supabase.from('buy_planners').select('user_id').eq('is_active', true).limit(2000),
        supabase.from('sell_planners').select('user_id').limit(2000),
      ])

      const set = new Set<string>()
      for (const r of (buys.data ?? []) as any[]) if (r?.user_id) set.add(String(r.user_id))
      for (const r of (sells.data ?? []) as any[]) if (r?.user_id) set.add(String(r.user_id))
      userIds = Array.from(set)
    }

    let processedUsers = 0
    let sent = 0
    const errors: Array<{ user_id: string; message: string }> = []

    for (const userId of userIds) {
      processedUsers++

      try {
        const u = await supabase.auth.admin.getUserById(userId)
        const toEmail = (u.data?.user?.email ?? '').trim()
        if (!toEmail) continue

        const { data: buyPlanners, error: eBuy } = await supabase
          .from('buy_planners')
          .select('id,coingecko_id,top_price,budget_usd,total_budget,ladder_depth,growth_per_level')
          .eq('user_id', userId)
          .eq('is_active', true)
        if (eBuy) throw new Error(eBuy.message)

        const { data: sellPlanners, error: eSell } = await supabase
          .from('sell_planners')
          .select('id,coingecko_id')
          .eq('user_id', userId)
        if (eSell) throw new Error(eSell.message)

        const buys = ((buyPlanners ?? []) as any[]).map((r) => ({
          id: String(r.id),
          coingecko_id: canonId(String(r.coingecko_id)),
          top_price: r.top_price != null ? Number(r.top_price) : null,
          budget_usd: r.budget_usd != null ? Number(r.budget_usd) : null,
          total_budget: r.total_budget != null ? Number(r.total_budget) : null,
          ladder_depth: r.ladder_depth != null ? Number(r.ladder_depth) : null,
          growth_per_level: r.growth_per_level != null ? Number(r.growth_per_level) : null,
        })) as BuyPlannerRow[]

        const sells = ((sellPlanners ?? []) as any[]).map((r) => ({
          id: String(r.id),
          coingecko_id: canonId(String(r.coingecko_id)),
        })) as SellPlannerRow[]

        const buyPlannerIds = buys.map((b) => b.id)
        const sellPlannerIds = sells.map((s) => s.id)

        const coinIds = Array.from(
          new Set<string>([...buys.map((b) => b.coingecko_id), ...sells.map((s) => s.coingecko_id)].filter(Boolean))
        )

        const priceMap = await getCorePrices(coinIds, 'USD')

        let buyTrades: Array<BuyTrade & { buy_planner_id: string }> = []
        let sellTrades: Array<SellTrade & { sell_planner_id: string }> = []

        if (buyPlannerIds.length) {
          const { data, error } = await supabase
            .from('trades')
            .select('buy_planner_id,price,quantity,fee,trade_time,side')
            .eq('user_id', userId)
            .eq('side', 'buy')
            .in('buy_planner_id', buyPlannerIds)
          if (error) throw new Error(error.message)

          buyTrades = ((data ?? []) as any[]).map((t) => ({
            buy_planner_id: String(t.buy_planner_id),
            trade_time: String(t.trade_time ?? ''),
            price: Number(t.price),
            quantity: Number(t.quantity),
            fee: t.fee != null ? Number(t.fee) : 0,
          }))
        }

        if (sellPlannerIds.length) {
          const { data, error } = await supabase
            .from('trades')
            .select('sell_planner_id,price,quantity,fee,trade_time,side')
            .eq('user_id', userId)
            .eq('side', 'sell')
            .in('sell_planner_id', sellPlannerIds)
          if (error) throw new Error(error.message)

          sellTrades = ((data ?? []) as any[]).map((t) => ({
            sell_planner_id: String(t.sell_planner_id),
            trade_time: String(t.trade_time ?? ''),
            price: Number(t.price),
            quantity: Number(t.quantity),
            fee: t.fee != null ? Number(t.fee) : 0,
          }))
        }

        let sellLevels: SellLevelRow[] = []
        if (sellPlannerIds.length) {
          const { data, error } = await supabase
            .from('sell_levels')
            .select('sell_planner_id,level,price,sell_tokens')
            .in('sell_planner_id', sellPlannerIds)
            .order('level', { ascending: true })
          if (error) throw new Error(error.message)

          sellLevels = ((data ?? []) as any[]).map((r) => ({
            sell_planner_id: String(r.sell_planner_id),
            level: Number(r.level),
            price: Number(r.price),
            sell_tokens: Number(r.sell_tokens),
          }))
        }

        const currentKeys: string[] = []

        // BUY ladder alerts + cycle alerts
        for (const bp of buys) {
          const cid = bp.coingecko_id
          const live = Number(priceMap[cid] ?? 0)
          const top = Number(bp.top_price ?? 0)
          const budget = Number(bp.budget_usd ?? bp.total_budget ?? 0)

          if (live > 0 && top > 0 && live > top) {
            currentKeys.push(`CYCLE:${cid}:${bp.id}`)
          }

          const depthRaw = Number(bp.ladder_depth ?? 70)
          const depth = (depthRaw === 90 ? 90 : depthRaw === 75 ? 75 : 70) as 70 | 75 | 90
          const growth = Number(bp.growth_per_level ?? 1.25)

          const levels = buildBuyLevels(top, budget, depth, growth)
          if (!levels.length || !(live > 0)) continue

          const myBuys = buyTrades
            .filter((t) => t.buy_planner_id === bp.id)
            .map((t) => ({ trade_time: t.trade_time, price: t.price, quantity: t.quantity, fee: t.fee }))

          const fills = computeBuyFills(levels, myBuys, 0.0)

          const hit = levels.some((lv, i) => {
            const p = Number((lv as any).price ?? 0)
            if (!(p > 0)) return false
            const near = Math.abs(live - p) / p <= 0.015
            const notFilled = Number(fills.fillPct?.[i] ?? 0) < 1.0
            return near && notFilled
          })

          if (hit) currentKeys.push(`BUY:${cid}:${bp.id}`)
        }

        // SELL ladder alerts (per planner) — SINGLE, CORRECT BLOCK
        for (const sp of sells) {
          const cid = sp.coingecko_id
          const live = Number(priceMap[cid] ?? 0)
          if (!(live > 0)) continue

          const lvls: SellPlanLevelForFill[] = sellLevels
            .filter((r) => r.sell_planner_id === sp.id)
            .map((r) => ({
              target_price: Number(r.price),
              planned_tokens: Number(r.sell_tokens),
            }))

          if (!lvls.length) continue

          const mySells = sellTrades
            .filter((t) => t.sell_planner_id === sp.id)
            .map((t) => ({ trade_time: t.trade_time, price: t.price, quantity: t.quantity, fee: t.fee }))

          const fills = computeSellFills(lvls, mySells, 0.0)

          const hit = lvls.some((lv, i) => {
            const p = Number(lv.target_price)
            if (!(p > 0)) return false
            const near = Math.abs(live - p) / p <= 0.03
            const notFilled = Number(fills.fillPct?.[i] ?? 0) < 1.0
            return near && notFilled
          })

          if (hit) currentKeys.push(`SELL:${cid}:${sp.id}`)
        }

        currentKeys.sort()

        const { data: stateRow, error: eState } = await supabase
          .from('notification_state')
          .select('user_id,last_alert_keys,last_alert_count')
          .eq('user_id', userId)
          .maybeSingle()

        if (eState) throw new Error(`notification_state read failed: ${eState.message}`)

        const st = (stateRow as any as StateRow | null) ?? null
        const prevKeys = (st?.last_alert_keys ?? '').trim()
          ? String(st?.last_alert_keys).split('|').filter(Boolean)
          : []
        const prevSet = new Set(prevKeys)
        const newKeys = currentKeys.filter((k) => !prevSet.has(k))

        const isFirstRun = !st
        const hasNew = newKeys.length > 0
        const shouldSend = (!isFirstRun && hasNew) || (force && hasNew)

        if (shouldSend && !dry) {
          const base = env('INTERNAL_BASE_URL') || 'http://localhost:3000'
          const coins = keysToHumanCoins(newKeys).slice(0, 3)

          const headline =
            coins.length === 1
              ? `${coins[0]} trigger.`
              : `${coins.length} triggers: ${coins.join(', ')}.`

          const subject = 'LedgerOne · Alert'
          const text = `${headline}\n\nOpen LedgerOne to review: ${base}/planner`

          await sendResendEmail({ to: toEmail, subject, text })
          sent++
        }

        const { error: upErr } = await supabase
          .from('notification_state')
          .upsert(
            {
              user_id: userId,
              last_alert_keys: currentKeys.join('|'),
              last_alert_count: currentKeys.length,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: 'user_id' } as any
          )

        if (upErr) throw new Error(`notification_state upsert failed: ${upErr.message}`)
      } catch (e: any) {
        errors.push({
          user_id: userId,
          message: String(e?.message ?? e ?? 'Unknown error'),
        })
      }
    }

    return NextResponse.json(
      {
        ok: true,
        processedUsers,
        sent,
        errorsCount: errors.length,
        errors,
        ms: Date.now() - started,
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e ?? 'Unknown error') },
      { status: 500 }
    )
  }
}
