import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type HistoryPoint = { t: number; p: number | null }

type AnchorRow = {
  coingecko_id: string
  anchor_top_price: number | null
  pump_threshold_multiple: number | null
  force_manual_anchor: boolean | null
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   - internal base URL for dataCore server-to-server calls
   - Supabase admin client for coin_anchors
   - price-history fetch
   - auto-pump cycle detection
────────────────────────────────────────────────────────────── */

function getInternalBaseUrl() {
  return process.env.INTERNAL_BASE_URL || 'http://localhost:3000'
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables are not configured.')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

async function fetchHistory(
  id: string,
  currency: string,
  days: number,
  debugNotes: string[]
): Promise<{ points: HistoryPoint[]; debug: any }> {
  const base = getInternalBaseUrl()
  const url = `${base}/api/price-history?id=${encodeURIComponent(
    id
  )}&days=${days}&interval=daily&currency=${encodeURIComponent(currency)}`

  const res = await fetch(url, {
    // no caching; we want freshest daily history for cycle detection
    cache: 'no-store',
  })

  if (!res.ok) {
    debugNotes.push(`history.fetch_error:status=${res.status}`)
    return { points: [], debug: null }
  }

  const json = await res.json()
  const points = (json?.points ?? []) as HistoryPoint[]
  return { points, debug: json?.debug ?? null }
}

/**
 * Find a local-low →  pump-multiple high cycle.
 *
 * - uses daily lows (wicks) (we trust /api/price-history "p" as low)
 * - walks LOWS from *newest* backwards until one has a pump≥ multiple
 * - returns autoTopPrice and a cycle struct if found
 */
function findPumpCycle(
  points: HistoryPoint[],
  pumpMultiple: number,
  debugNotes: string[]
): {
  autoTopPrice: number | null
  cycle:
    | {
        lowPrice: number
        lowTime: string
        highPrice: number
        highTime: string
      }
    | null
  fallbackMaxHigh: number | null
  fallbackMaxHighTime: string | null
  localLowCount: number
} {
  const n = points.length
  if (!n) {
    debugNotes.push('history.empty')
    return {
      autoTopPrice: null,
      cycle: null,
      fallbackMaxHigh: null,
      fallbackMaxHighTime: null,
      localLowCount: 0,
    }
  }

  const localLowIdxs: number[] = []
  let fallbackMaxHigh = 0
  let fallbackMaxHighTime: string | null = null

  for (let i = 0; i < n; i++) {
    const p = points[i].p
    if (p != null && p > 0 && p > fallbackMaxHigh) {
      fallbackMaxHigh = p
      fallbackMaxHighTime = new Date(points[i].t).toISOString()
    }

    if (i === 0 || i === n - 1) continue
    const pPrev = points[i - 1].p
    const pCur = points[i].p
    const pNext = points[i + 1].p
    if (pCur == null || pCur <= 0) continue

    // local low: equal/lower than neighbors (we're using lows, not closes)
    if (
      (pPrev == null || pCur <= pPrev) &&
      (pNext == null || pCur <= pNext)
    ) {
      localLowIdxs.push(i)
    }
  }

  const localLowCount = localLowIdxs.length
  debugNotes.push(`localLows=${localLowCount}`)

  let autoTopPrice: number | null = null
  let cycle: {
    lowPrice: number
    lowTime: string
    highPrice: number
    highTime: string
  } | null = null

  // Walk lows from newest back until we find one with a qualifying pump
  for (let li = localLowIdxs.length - 1; li >= 0; li--) {
    const lowIdx = localLowIdxs[li]
    const lowPoint = points[lowIdx]
    const L = lowPoint.p
    if (L == null || L <= 0) continue

    const threshold = L * pumpMultiple

    for (let j = lowIdx + 1; j < n; j++) {
      const hp = points[j].p
      if (hp == null || hp <= 0) continue
      if (hp >= threshold) {
        autoTopPrice = hp
        cycle = {
          lowPrice: L,
          lowTime: new Date(lowPoint.t).toISOString(),
          highPrice: hp,
          highTime: new Date(points[j].t).toISOString(),
        }
        debugNotes.push(`auto_pump_found_from_low_idx=${lowIdx}`)
        li = -1 // break outer loop
        break
      }
    }
  }

  if (!autoTopPrice && fallbackMaxHigh) {
    debugNotes.push('auto_pump.none_fallback_max_high_used_for_debug_only')
  }

  return {
    autoTopPrice,
    cycle,
    fallbackMaxHigh: fallbackMaxHigh || null,
    fallbackMaxHighTime,
    localLowCount,
  }
}

/* ─────────────────────────────────────────────────────────────
   GET /api/planner/user-top-price
   Query:
     - id:        coingecko id (e.g. bitcoin, near-protocol)
     - currency:  quote currency (default USD)
     - debug=1    to include internal notes
   Response:
     {
       id,
       currency,
       topPrice,
       source,          // "auto_pump" | "admin_anchor_forced" | "admin_anchor" | "none"
       adminTopPrice,
       autoTopPrice,
       pumpMultiple,
       asOf,
       cycle: { lowPrice, lowTime, highPrice, highTime } | null,
       debug: { notes[], pointCount, localLowCount, fallbackMaxHigh, fallbackMaxHighTime }
     }
────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const currency = (url.searchParams.get('currency') || 'USD').toUpperCase()
  const debugFlag = url.searchParams.get('debug') === '1'

  if (!id) {
    return NextResponse.json(
      { error: 'Missing id (coingecko id).' },
      { status: 400 }
    )
  }

  const debugNotes: string[] = []

  // ── 1) Load anchor_row (admin config for this coin) ────────────────────────
  let anchor: AnchorRow | null = null
  let pumpMultiple = 1.5

  try {
    const supabase = getSupabaseAdmin()

    // Handle the NEAR case gracefully: near vs near-protocol
    const altId =
      id.endsWith('-protocol') && id.includes('-')
        ? id.replace('-protocol', '')
        : null

    let query = supabase
      .from('coin_anchors')
      .select(
        'coingecko_id,anchor_top_price,pump_threshold_multiple,force_manual_anchor'
      )

    if (altId) {
      query = query.or(`coingecko_id.eq.${id},coingecko_id.eq.${altId}`)
    } else {
      query = query.eq('coingecko_id', id)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      debugNotes.push(`anchor_row.error:${error.message}`)
    } else if (data) {
      anchor = data as AnchorRow
      debugNotes.push('anchor_row.ok')

      if (
        data.pump_threshold_multiple != null &&
        !Number.isNaN(Number(data.pump_threshold_multiple)) &&
        Number(data.pump_threshold_multiple) > 1.0
      ) {
        pumpMultiple = Number(data.pump_threshold_multiple)
      }
    } else {
      debugNotes.push('anchor_row.missing')
    }
  } catch (e: any) {
    debugNotes.push(`anchor_row.exception:${e?.message ?? 'unknown'}`)
  }

  debugNotes.push(`pumpMultiple=${pumpMultiple.toFixed(4)}`)

  // ── 2) Load daily history (dataCore) & detect pump cycle ───────────────────
  const { points, debug: historyDebug } = await fetchHistory(
    id,
    currency,
    365,
    debugNotes
  )

  const {
    autoTopPrice,
    cycle,
    fallbackMaxHigh,
    fallbackMaxHighTime,
    localLowCount,
  } = findPumpCycle(points, pumpMultiple, debugNotes)

  const pointCount = points.length

  // ── 3) Priority tree for effective top price ───────────────────────────────
    const adminTopPrice =
    anchor && typeof anchor.anchor_top_price === 'number'
      ? anchor.anchor_top_price
      : null
  const forceManual = !!anchor?.force_manual_anchor

  let topPrice: number | null = null
  let source:
    | 'auto_pump'
    | 'admin_anchor_forced'
    | 'admin_anchor'
    | 'fallback_high'
    | 'none' = 'none'

  if (forceManual && adminTopPrice && adminTopPrice > 0) {
    // 1) Force manual override: admin top wins over auto
    topPrice = adminTopPrice
    source = 'admin_anchor_forced'
    debugNotes.push('topPrice.source=admin_anchor_forced')
  } else if (autoTopPrice && autoTopPrice > 0) {
    // 2) Auto pump cycle if available
    topPrice = autoTopPrice
    source = 'auto_pump'
    debugNotes.push('topPrice.source=auto_pump')
  } else if (adminTopPrice && adminTopPrice > 0) {
    // 3) Fallback to admin manual value if auto not available
    topPrice = adminTopPrice
    source = 'admin_anchor'
    debugNotes.push('topPrice.source=admin_anchor_fallback')
  } else if (fallbackMaxHigh && fallbackMaxHigh > 0) {
    // 4) Hard fallback: use max high seen in the sampled window
    topPrice = fallbackMaxHigh
    source = 'fallback_high'
    debugNotes.push('topPrice.source=fallback_high')
  } else {
    // 5) No usable price yet
    topPrice = null
    source = 'none'
    debugNotes.push('topPrice.source=none')
  }


  const payload: any = {
    id,
    currency,
    topPrice,
    source,
    adminTopPrice,
    autoTopPrice: autoTopPrice ?? null,
    pumpMultiple,
    asOf: new Date().toISOString(),
    cycle,
    debug: {
      notes: debugNotes,
      pointCount,
      localLowCount,
      fallbackMaxHigh,
      fallbackMaxHighTime,
      historyDebug,
    },
  }

  // If not in debug mode, you can trim some internals later; for now we always
  // return full payload because you’re using it for curl-based validation.
  if (!debugFlag) {
    // You *could* strip historyDebug/notes here, but leaving as-is is fine.
  }

  return NextResponse.json(payload)
}
