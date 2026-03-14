import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { getHistory } from '@/lib/dataCore'
import { mapToProvider, normalizeCoinId } from '@/server/db/coinRegistry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AnchorRow = {
  coingecko_id: string
  anchor_top_price: number | null
  pump_threshold_multiple: number | null
  force_manual_anchor: boolean | null
}

type TopPriceSource =
  | 'admin_anchor_forced'
  | 'auto_pump'
  | 'admin_anchor'
  | 'fallback_high'
  | null

type CycleMeta = {
  lowPrice: number
  lowTime: string
  highPrice: number
  highTime: string
}

type DebugMeta = {
  notes: string[]
  pointCount: number
  localLowCount: number
  fallbackMaxHigh: number | null
  fallbackMaxHighTime: string | null
  historyDebug: {
    requestedId: string
    canonicalId: string | null
    providerId: string | null
    aliases: string[]
    historyId: string | null
  }
}

type HistoryPoint = {
  t: number
  p: number
}

const DEFAULT_PUMP_MULTIPLE = 1.5
const HISTORY_DAYS = 365

function uniqueLower(values: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const key = String(value ?? '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }

  return out
}

function addProtocolAlias(id: string | null | undefined): string[] {
  const raw = String(id ?? '').trim().toLowerCase()
  if (!raw) return []

  if (raw.endsWith('-protocol')) {
    return [raw, raw.replace(/-protocol$/, '')]
  }

  return [raw, `${raw}-protocol`]
}

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })
}

async function resolveAliases(requestedId: string) {
  const raw = requestedId.trim().toLowerCase()

  let canonicalId: string | null = null
  let providerId: string | null = null

  try {
    canonicalId = await normalizeCoinId(raw)
  } catch {
    canonicalId = null
  }

  try {
    providerId = canonicalId ? await mapToProvider(canonicalId, 'coingecko') : null
  } catch {
    providerId = null
  }

  const aliases = uniqueLower([
    raw,
    canonicalId,
    providerId,
    ...addProtocolAlias(raw),
    ...addProtocolAlias(canonicalId),
    ...addProtocolAlias(providerId),
  ])

  return {
    raw,
    canonicalId: canonicalId ? canonicalId.toLowerCase() : null,
    providerId: providerId ? providerId.toLowerCase() : null,
    aliases,
  }
}

function hasAnchorConfig(row: AnchorRow) {
  return (
    Number.isFinite(Number(row.anchor_top_price)) ||
    Number.isFinite(Number(row.pump_threshold_multiple)) ||
    row.force_manual_anchor === true
  )
}

function pickAnchorRow(rows: AnchorRow[], raw: string, aliases: string[]) {
  if (!rows.length) return null

  const aliasRank = new Map<string, number>(aliases.map((id, idx) => [id, idx]))

  const pool = rows.some(hasAnchorConfig)
    ? rows.filter(hasAnchorConfig)
    : rows

  const ranked = [...pool].sort((a, b) => {
    const aId = String(a.coingecko_id || '').toLowerCase()
    const bId = String(b.coingecko_id || '').toLowerCase()

    const aExact = aId === raw ? 0 : 1
    const bExact = bId === raw ? 0 : 1
    if (aExact !== bExact) return aExact - bExact

    const aRank = aliasRank.get(aId) ?? 999
    const bRank = aliasRank.get(bId) ?? 999
    if (aRank !== bRank) return aRank - bRank

    return aId.localeCompare(bId)
  })

  return ranked[0] ?? null
}

async function loadAnchorRow(raw: string, aliases: string[], notes: string[]) {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    notes.push('anchor_row.client_missing')
    return null
  }

  if (!aliases.length) {
    notes.push('anchor_row.missing')
    return null
  }

  const { data, error } = await supabase
    .from('coin_anchors')
    .select('coingecko_id,anchor_top_price,pump_threshold_multiple,force_manual_anchor')
    .in('coingecko_id', aliases)

  if (error) {
    notes.push(`anchor_row.error:${error.message}`)
    return null
  }

  const rows = ((data ?? []) as AnchorRow[]).map((row) => ({
    ...row,
    coingecko_id: String(row.coingecko_id || '').toLowerCase(),
  }))

  if (!rows.length) {
    notes.push('anchor_row.missing')
    return null
  }

  const picked = pickAnchorRow(rows, raw, aliases)
  if (!picked) {
    notes.push('anchor_row.missing')
    return null
  }

  notes.push('anchor_row.ok')
  if (rows.length > 1) {
    notes.push(`anchor_row.aliases=${rows.map((row) => row.coingecko_id).join(',')}`)
    notes.push(`anchor_row.selected=${picked.coingecko_id}`)
  }

  return picked
}

function normalizePoints(points: unknown): HistoryPoint[] {
  if (!Array.isArray(points)) return []

  return points
    .map((point) => {
      const t = Number((point as any)?.t)
      const p = Number((point as any)?.p)
      return { t, p }
    })
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0)
    .sort((a, b) => a.t - b.t)
}

async function loadHistory(aliases: string[], currency: string, notes: string[]) {
  for (const id of aliases) {
    try {
      const payload = await getHistory(id, HISTORY_DAYS, 'daily', currency)
      const points = normalizePoints(payload?.points)

      if (points.length > 0) {
        notes.push(`history.id=${id}`)
        return { historyId: id, points }
      }

      notes.push(`history.empty:${id}`)
    } catch (error: any) {
      notes.push(`history.error:${id}:${error?.message ?? 'unknown'}`)
    }
  }

  return { historyId: null, points: [] as HistoryPoint[] }
}

function getLocalLowIndices(points: HistoryPoint[]) {
  const lows: number[] = []

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1].p
    const curr = points[i].p
    const next = points[i + 1].p

    if (curr <= prev && curr < next) {
      lows.push(i)
    }
  }

  return lows
}

function findPumpCycle(points: HistoryPoint[], pumpMultiple: number, localLowIndices: number[]) {
  for (let i = localLowIndices.length - 1; i >= 0; i -= 1) {
    const lowIdx = localLowIndices[i]
    const low = points[lowIdx]

    let peakIdx = -1
    let peakPrice = -Infinity

    for (let j = lowIdx + 1; j < points.length; j += 1) {
      if (points[j].p > peakPrice) {
        peakPrice = points[j].p
        peakIdx = j
      }
    }

    if (peakIdx > lowIdx && peakPrice >= low.p * pumpMultiple) {
      return { lowIdx, peakIdx }
    }
  }

  return null
}

function getFallbackHigh(points: HistoryPoint[]) {
  if (!points.length) return null

  let best = points[0]
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].p > best.p) best = points[i]
  }

  return best
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const requestedId = String(url.searchParams.get('id') || '').trim().toLowerCase()
  const currency = String(url.searchParams.get('currency') || 'USD').trim().toUpperCase()
  const wantDebug = ['1', 'true', 'yes', 'on'].includes(
    String(url.searchParams.get('debug') || '').trim().toLowerCase()
  )

  if (!requestedId) {
    return NextResponse.json(
      { error: 'Missing id' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const notes: string[] = []
  const { raw, canonicalId, providerId, aliases } = await resolveAliases(requestedId)

  const anchorRow = await loadAnchorRow(raw, aliases, notes)

  const adminTopPrice = Number.isFinite(Number(anchorRow?.anchor_top_price))
    ? Number(anchorRow?.anchor_top_price)
    : null

  const pumpMultiple =
    Number.isFinite(Number(anchorRow?.pump_threshold_multiple)) &&
    Number(anchorRow?.pump_threshold_multiple) > 0
      ? Number(anchorRow?.pump_threshold_multiple)
      : DEFAULT_PUMP_MULTIPLE

  notes.push(`pumpMultiple=${pumpMultiple.toFixed(4)}`)

  let topPrice: number | null = null
  let source: TopPriceSource = null
  let autoTopPrice: number | null = null
  let cycle: CycleMeta | null = null
  let pointCount = 0
  let localLowCount = 0
  let fallbackMaxHigh: number | null = null
  let fallbackMaxHighTime: string | null = null
  let historyId: string | null = null

  if (anchorRow?.force_manual_anchor === true && adminTopPrice && adminTopPrice > 0) {
    topPrice = adminTopPrice
    source = 'admin_anchor_forced'
    notes.push('topPrice.source=admin_anchor_forced')
  } else {
    const history = await loadHistory(aliases, currency, notes)
    historyId = history.historyId
    const points = history.points
    pointCount = points.length

    if (!points.length) {
      notes.push('history.empty')
    } else {
      const localLows = getLocalLowIndices(points)
      localLowCount = localLows.length
      notes.push(`localLows=${localLows.length}`)

      const cycleMatch = findPumpCycle(points, pumpMultiple, localLows)
      const fallbackHigh = getFallbackHigh(points)

      fallbackMaxHigh = fallbackHigh?.p ?? null
      fallbackMaxHighTime = fallbackHigh ? new Date(fallbackHigh.t).toISOString() : null

      if (cycleMatch) {
        const low = points[cycleMatch.lowIdx]
        const high = points[cycleMatch.peakIdx]

        autoTopPrice = high.p
        topPrice = high.p
        source = 'auto_pump'
        cycle = {
          lowPrice: low.p,
          lowTime: new Date(low.t).toISOString(),
          highPrice: high.p,
          highTime: new Date(high.t).toISOString(),
        }

        notes.push(`auto_pump_peak_from_low_idx=${cycleMatch.lowIdx};peak_idx=${cycleMatch.peakIdx}`)
        notes.push('topPrice.source=auto_pump')
      } else if (adminTopPrice && adminTopPrice > 0) {
        topPrice = adminTopPrice
        source = 'admin_anchor'
        notes.push('topPrice.source=admin_anchor_fallback')
      } else if (fallbackHigh && fallbackHigh.p > 0) {
        topPrice = fallbackHigh.p
        source = 'fallback_high'
        notes.push('topPrice.source=fallback_high')
      }
    }
  }

  if (!topPrice && adminTopPrice && adminTopPrice > 0) {
    topPrice = adminTopPrice
    source = anchorRow?.force_manual_anchor ? 'admin_anchor_forced' : 'admin_anchor'
    notes.push('topPrice.source=admin_anchor_post_history_fallback')
  }

  const body: {
    id: string
    currency: string
    topPrice: number | null
    source: TopPriceSource
    adminTopPrice: number | null
    autoTopPrice: number | null
    pumpMultiple: number
    asOf: string
    cycle: CycleMeta | null
    debug?: DebugMeta
  } = {
    id: requestedId,
    currency,
    topPrice,
    source,
    adminTopPrice,
    autoTopPrice,
    pumpMultiple,
    asOf: new Date().toISOString(),
    cycle,
  }

  if (wantDebug) {
    body.debug = {
      notes,
      pointCount,
      localLowCount,
      fallbackMaxHigh,
      fallbackMaxHighTime,
      historyDebug: {
        requestedId,
        canonicalId,
        providerId,
        aliases,
        historyId,
      },
    }
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  })
}