// src/server/services/priceService.ts
// Robust, sanitized price fetcher with small in-memory cache + retries.
// Sources (in order):
// 1) CoinGecko simple/price (fast, multi-friendly, includes 24h change)
// 2) CoinGecko coins/markets (array endpoint; often succeeds when others are laggy)
// 3) CoinGecko coins/{id} (market_data detail; heavier but resilient)
// Any non-positive or NaN values are treated as null.
// Adds migration-aware alternate IDs (e.g., MATIC <-> POL).

const CG_BASE = process.env.COINGECKO_API_BASE?.trim() || 'https://api.coingecko.com/api/v3'

// --- small in-memory cache to reduce flakiness & rate pressure ---
type PriceObj = {
  price: number | null
  pct24h: number | null
  abs24h: number | null
  lastPrice: number | null
  updatedAt: number
  source: string
}
const cache = new Map<string, { t: number; v: PriceObj }>()
const TTL_MS = 20_000 // 20s stabilizes UI without getting stale

// Migration-aware alternates: if the primary id yields null, try these in order.
const ALT_IDS: Record<string, string[]> = {
  'matic-network': ['polygon-ecosystem-token'],      // MATIC -> POL as alternate
  'polygon-ecosystem-token': ['matic-network'],      // POL   -> MATIC as alternate
}

function now() { return Date.now() }
function isNumber(n: any): n is number { return typeof n === 'number' && Number.isFinite(n) }
function sanitizePrice(n: any): number | null {
  if (!isNumber(n)) return null
  if (n <= 0) return null
  return n
}
function sanitizePct(n: any): number | null {
  if (!isNumber(n)) return null
  return n
}
function jitter(mult = 1) { return (0.5 + Math.random()) * mult }
function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)) }

async function fetchJSON(url: string, init?: RequestInit, retries = 2, baseDelay = 140): Promise<any> {
  let attempt = 0
  for (;;) {
    try {
      const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' }, ...init })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (err) {
      if (attempt >= retries) throw err
      attempt += 1
      const delay = Math.ceil(baseDelay * Math.pow(2, attempt) * jitter())
      await sleep(delay)
    }
  }
}

// Source 1: simple/price (fast path)
async function fromSimple(id: string): Promise<PriceObj | null> {
  const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`
  const j = await fetchJSON(url)
  const rec = j?.[id]
  if (!rec) return null

  const price = sanitizePrice(rec?.usd)
  const pct24h = sanitizePct(rec?.usd_24h_change) // % value
  if (price == null && pct24h == null) return null

  return {
    price,
    pct24h,
    abs24h: null,
    lastPrice: null,
    updatedAt: now(),
    source: 'coingecko_simple',
  }
}

// Source 2: coins/markets (array; reliable for spot price/pct)
async function fromMarketsList(id: string): Promise<PriceObj | null> {
  const url = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}&price_change_percentage=24h&per_page=1&page=1&sparkline=false`
  const arr = await fetchJSON(url)
  const rec = Array.isArray(arr) && arr[0] ? arr[0] : null
  if (!rec) return null

  const price = sanitizePrice(rec?.current_price)
  const pct24h =
    sanitizePct(rec?.price_change_percentage_24h) ??
    sanitizePct(rec?.price_change_percentage_24h_in_currency?.usd)

  if (price == null && pct24h == null) return null

  return {
    price,
    pct24h,
    abs24h: null,
    lastPrice: null,
    updatedAt: now(),
    source: 'coingecko_markets',
  }
}

// Source 3: coins/{id} (detail with market_data)
async function fromMarketsDetail(id: string): Promise<PriceObj | null> {
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
  const j = await fetchJSON(url)
  const md = j?.market_data
  if (!md) return null

  const price = sanitizePrice(md?.current_price?.usd)
  const pct24h = sanitizePct(md?.price_change_percentage_24h)
  if (price == null && pct24h == null) return null

  return {
    price,
    pct24h,
    abs24h: null,
    lastPrice: null,
    updatedAt: now(),
    source: 'coingecko_markets_detail',
  }
}

/** Try all sources for a given canonical id. */
async function fetchAllForId(id: string): Promise<PriceObj | null> {
  let out: PriceObj | null = null
  try { out = await fromSimple(id) } catch {}
  if (!out) { try { out = await fromMarketsList(id) } catch {} }
  if (!out) { try { out = await fromMarketsDetail(id) } catch {} }
  return out
}

/**
 * getPrice(id) -> { price, pct24h, abs24h, lastPrice, updatedAt, source }
 * - Uses in-memory TTL cache to stabilize UI.
 * - Rejects zero/negative/NaN as null.
 * - Tries simple -> markets(list) -> markets(detail).
 * - If null AND an alternate id exists (migration), tries alternates before giving up.
 */
export async function getPrice(id: string): Promise<PriceObj> {
  const key = id.toLowerCase()
  const hit = cache.get(key)
  const t = now()
  if (hit && (t - hit.t) < TTL_MS) {
    return hit.v
  }

  // 1) Primary id
  let out: PriceObj | null = await fetchAllForId(key)

  // 2) Migration-aware alternates if still null
  if (!out && ALT_IDS[key]?.length) {
    for (const alt of ALT_IDS[key]) {
      out = await fetchAllForId(alt)
      if (out) break
    }
  }

  const result: PriceObj = out ?? {
    price: null,
    pct24h: null,
    abs24h: null,
    lastPrice: null,
    updatedAt: t,
    source: 'none',
  }

  cache.set(key, { t, v: result })
  return result
}
