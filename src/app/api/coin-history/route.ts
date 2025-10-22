import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TV = { t: number; v: number }
type CacheEntry = { data: TV[]; expiresAt: number }

const CG_BASE = 'https://api.coingecko.com/api/v3'
const allowedDays = new Set([1, 7, 14, 30, 90, 180, 365])

// --- cache + inflight (per process) ---
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<TV[]>>()

const nowSec = () => Math.floor(Date.now() / 1000)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

function cacheKey(id: string, days: string, fromTs?: number) {
  return `${id}::${days}${fromTs ? `::from-${fromTs}` : ''}`
}
function setCache(key: string, data: TV[], ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}
function getCache(key: string): TV[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) { cache.delete(key); return null }
  return hit.data
}

// --- Supabase: earliest BUY timestamp (ms) for signed-in user ---
async function getUserFirstBuyTsMs(coinId: string): Promise<number | null> {
  const store = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        // use getAll per @supabase/ssr docs for Next 14/15
        getAll() { return store.getAll() },
        setAll() {/* not needed here */},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Adjust these if your column names differ
  const cols = ['filled_at', 'executed_at', 'created_at']
  for (const col of cols) {
    const { data, error } = await supabase
      .from('trades')
      .select(col)
      .eq('coingecko_id', coinId)
      .in('side', ['buy', 'BUY'])
      .not(col, 'is', null)
      .order(col, { ascending: true })
      .limit(1)
    if (!error && data?.length) {
      const ms = Date.parse((data[0] as any)[col])
      if (Number.isFinite(ms)) return ms
    }
  }
  return null
}

// --- CoinGecko helpers ---
function withKeys(url: URL) {
  const apiKey = process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY || ''
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['x-cg-pro-api-key'] = apiKey // harmless if not pro
    url.searchParams.set('x_cg_demo_api_key', apiKey) // for demo/free
  }
  return { url, headers }
}

async function fetchJsonWithRetry(url: URL, headers: Record<string, string>, attempts = 4, timeoutMs = 15_000) {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url.toString(), { headers, next: { revalidate: 300 }, signal: controller.signal })
      clearTimeout(to)
      if (res.ok) return await res.json()
      const body = await res.text().catch(() => '')
      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
        const backoff = clamp(700 * 2 ** i, 700, 4000) + Math.floor(Math.random() * 250)
        await sleep(backoff)
        continue
      }
      throw new Error(`Upstream ${res.status}${body ? `: ${body.slice(0, 240)}` : ''}`)
    } catch (e: any) {
      clearTimeout(to)
      lastErr = e?.name === 'AbortError' ? new Error('Upstream timeout') : e
      if (i < attempts - 1) {
        const backoff = clamp(600 * 2 ** i, 600, 3500) + Math.floor(Math.random() * 200)
        await sleep(backoff)
      }
    }
  }
  throw lastErr || new Error('Unknown upstream error')
}

function normalize(arr: any): TV[] {
  const prices: [number, number][] = Array.isArray(arr?.prices) ? arr.prices : []
  const out = prices
    .filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([t, v]) => ({ t, v } as TV))
    .sort((a, b) => a.t - b.t)

  const dedup: TV[] = []
  for (let i = 0; i < out.length; i++) {
    if (i === 0 || out[i].t !== out[i - 1].t) dedup.push(out[i])
  }
  return dedup
}

async function fetchDays(id: string, daysStr: string): Promise<TV[]> {
  const url = new URL(`${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart`)
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('days', daysStr)
  const n = Number(daysStr)
  if (daysStr === 'max' || (!Number.isNaN(n) && n >= 90)) url.searchParams.set('interval', 'daily')
  url.searchParams.set('precision', 'full')
  const { url: u, headers } = withKeys(url)
  return normalize(await fetchJsonWithRetry(u, headers))
}

async function fetchRange(id: string, fromSec: number, toSec: number): Promise<TV[]> {
  const url = new URL(`${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart/range`)
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('from', String(fromSec))
  url.searchParams.set('to', String(toSec))
  url.searchParams.set('interval', 'daily')
  url.searchParams.set('precision', 'full')
  const { url: u, headers } = withKeys(url)
  return normalize(await fetchJsonWithRetry(u, headers))
}

// chunked concurrent (safer settings for CG)
async function fetchChunkedConcurrent(id: string, fromSec: number, toSec: number, chunkDays = 120, concurrency = 2) {
  const chunk = chunkDays * 86400
  const jobs: Array<{ from: number; to: number; idx: number }> = []
  let cursor = fromSec, idx = 0
  while (cursor < toSec) {
    const end = Math.min(toSec, cursor + chunk)
    jobs.push({ from: cursor, to: end, idx: idx++ })
    cursor = end
  }
  const results: TV[][] = new Array(jobs.length)
  let next = 0, active = 0

  async function runOne(i: number) {
    const j = jobs[i]
    try {
      results[j.idx] = await fetchRange(id, j.from, j.to)
    } catch {
      // retry once after a short nap
      await sleep(500)
      try { results[j.idx] = await fetchRange(id, j.from, j.to) } catch { results[j.idx] = [] }
    }
  }

  await new Promise<void>((resolve) => {
    const pump = () => {
      while (active < concurrency && next < jobs.length) {
        active++
        const i = next++
        runOne(i).finally(() => { active--; pump() })
      }
      if (active === 0 && next >= jobs.length) resolve()
    }
    pump()
  })

  const merged: TV[] = []
  for (const arr of results) if (arr) merged.push(...arr)
  merged.sort((a, b) => a.t - b.t)
  const dedup: TV[] = []
  for (let i = 0; i < merged.length; i++) if (i === 0 || merged[i].t !== merged[i - 1].t) dedup.push(merged[i])
  return dedup
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = (searchParams.get('id') || '').trim()
  const daysParam = (searchParams.get('days') || '90').trim()
  const inspect = searchParams.get('inspect') === '1'
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

  // days=max → start from user's first BUY if available
  let userFromSec: number | undefined
  if (daysParam === 'max') {
    try {
      const ms = await getUserFirstBuyTsMs(id)
      if (ms && Number.isFinite(ms)) userFromSec = Math.floor(ms / 1000)
    } catch {}
  }

  const key = cacheKey(id, daysParam, userFromSec)
  const cached = getCache(key)
  if (cached && !inspect) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    })
  }
  if (inflight.has(key) && !inspect) {
    try {
      const data = await inflight.get(key)!
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      })
    } catch {}
  }

  const work = (async (): Promise<{ data: TV[]; meta: Record<string, any> }> => {
    const meta: Record<string, any> = { id, daysParam }
    const now = nowSec()

    try {
      if (daysParam === 'max') {
        meta.mode = userFromSec ? 'user-first-buy' : 'provider-max'
        if (userFromSec) {
          meta.from = userFromSec
          const data = await fetchChunkedConcurrent(id, userFromSec, now, 120, 2)
          if (data.length) return { data, meta }
          meta.fallback = 'provider-max'
        }
        try {
          const data = await fetchDays(id, 'max')
          if (data.length) return { data, meta }
          meta.fallback = 'chunked-14y'
        } catch {
          meta.fallback = 'chunked-14y'
        }
        // ~14 years
        const from = now - 14 * 365 * 86400
        meta.from = from
        const data = await fetchChunkedConcurrent(id, from, now, 120, 2)
        if (data.length) return { data, meta }
        meta.fallback = 'last-365'
        const last365 = await fetchDays(id, '365')
        return { data: last365, meta }
      }

      // custom long window
      const n = Number(daysParam)
      if (!Number.isNaN(n) && (!allowedDays.has(n) || n > 365)) {
        meta.mode = 'chunked-custom'
        const from = now - n * 86400
        meta.from = from
        const data = await fetchChunkedConcurrent(id, from, now, 120, 2)
        if (data.length) return { data, meta }
        meta.fallback = '365'
        return { data: await fetchDays(id, '365'), meta }
      }

      // short/allowed windows
      meta.mode = 'days'
      try {
        const data = await fetchDays(id, String(n))
        return { data, meta }
      } catch {
        const from = now - n * 86400
        meta.fallback = 'range'
        return { data: await fetchRange(id, from, now), meta }
      }
    } catch (e: any) {
      meta.error = e?.message || 'unknown'
      // final guard: give at least 90d
      const data = await fetchDays(id, '90').catch(() => [] as TV[])
      return { data, meta }
    }
  })()

  inflight.set(key, work.then(x => x.data))
  try {
    const { data, meta } = await work
    if (!inspect) setCache(key, data, daysParam === 'max' ? 30 * 60 * 1000 : 5 * 60 * 1000)

    // normal mode → array only (what your chart expects)
    if (!inspect) {
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      })
    }

    // inspect mode → show metadata for debugging
    return NextResponse.json({ ok: true, meta, sample: data.slice(0, 3) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err: any) {
    console.error('[coin-history] error', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    )
  } finally {
    inflight.delete(key)
  }
}

