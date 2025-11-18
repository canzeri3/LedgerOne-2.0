// src/app/api/price-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
// NEW: map canonical id -> provider-specific id (e.g., trx -> tron for CoinGecko)
import { mapToProvider /*, normalizeCoinId*/ } from "@/server/db/coinRegistry";
import { cacheGet, cacheSet } from "@/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pt = { t: number; p: number };

const CG_BASE = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

const HISTORY_HOT_TTL_SEC = 300; // 5 minutes
const HISTORY_LASTGOOD_TTL_SEC = 3600; // 1 hour

function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro) h["x-cg-pro-api-key"] = pro;
  return h;
}

async function robustJsonFetch(url: string, init?: RequestInit, attempts = 3): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { ...init, cache: "no-store", headers: { ...(init?.headers || {}), ...cgHeaders() } });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, 120 + Math.random() * 120));
  }
  throw lastErr;
}

/**
 * Fetch daily history for N days from Coingecko market_chart.
 * Returns [{t,p}] or [] if not available.
 */
async function fetchCgDaily(id: string, currency: string, days: number): Promise<Pt[]> {
  // Coingecko supports interval=daily to compress to one point per day
  const url =
    `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart` +
    `?vs_currency=${encodeURIComponent(currency.toLowerCase())}` +
    `&days=${encodeURIComponent(String(days))}&interval=daily`;
  const j = await robustJsonFetch(url);
  const prices: [number, number][] = Array.isArray(j?.prices) ? j.prices : [];
  // map [ms, price] → { t, p }
  return prices.map(([t, p]) => ({ t, p }));
}

/**
 * Fallback: synthesize two points from consensus live price and 24h price if available.
 */
async function synthFromConsensus(id: string, currency: string): Promise<Pt[] | null> {
  try {
    const { rows, updatedAt } = await getConsensusPrices([id], currency, { with24h: true });
    const r = rows?.[0];
    if (!r) return null;
    const now = Date.now();
    const lastMs = Date.parse(updatedAt || new Date().toISOString());
    const pNow = r.price ?? null;
    const p24 = r.price_24h ?? null;

    const pts: Pt[] = [];
    if (p24 != null) pts.push({ t: lastMs - 24 * 3600 * 1000, p: p24 });
    if (pNow != null) pts.push({ t: lastMs, p: pNow });
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const begin = Date.now();
  const u = new URL(req.url);

  const idRaw = u.searchParams.get("id") || "";
  const canonicalId = idRaw.trim().toLowerCase();
  const daysParam = u.searchParams.get("days");
  const intervalParam = (u.searchParams.get("interval") || "").toLowerCase() as "minute" | "hourly" | "daily" | "";
  const currency = (u.searchParams.get("currency") || "USD").toUpperCase();
  const debug = u.searchParams.get("debug") === "1";

  // Default handling: if days >= 20 and no interval specified, assume 'daily'
  const days = Math.max(1, Number(daysParam || "30"));
  const interval: "minute" | "hourly" | "daily" =
    intervalParam === "minute" || intervalParam === "hourly" || intervalParam === "daily"
      ? intervalParam
      : days >= 20
      ? "daily"
      : "hourly";

  const notes: string[] = [];

  if (!canonicalId) {
    return NextResponse.json({ id: "", currency, points: [], error: "missing_id" }, { status: 400 });
  }

  // NEW: resolve provider-specific id for CoinGecko (e.g., trx -> tron). Non-breaking: we still return canonicalId.
  // If no mapping exists, we simply fall back to canonicalId.
  const cgId = (await mapToProvider(canonicalId, "coingecko")) ?? canonicalId;
  if (cgId !== canonicalId) notes.push(`map.coingecko:${canonicalId}->${cgId}`);

  const hotKey = `history:hot:${currency}:${interval}:${days}:${cgId}`;
  const lastGoodKey = `history:lastgood:${currency}:${interval}:${days}:${cgId}`;

  let points: Pt[] = [];

  // First try hot cache (fresh within HISTORY_HOT_TTL_SEC)
  const cached = await cacheGet<Pt[]>(hotKey);
  if (cached && Array.isArray(cached) && cached.length >= 2) {
    notes.push("cache.hit");
    points = cached;
  } else {
    notes.push("cache.miss");
  }

  try {
    if (points.length === 0) {
      if (interval === "daily") {
        // Primary path for portfolio analytics: get 30–45 daily points
        notes.push(`cg.daily(${days})`);
        const daily = await fetchCgDaily(cgId, currency, days); // mapped id here
        if (Array.isArray(daily) && daily.length >= 2) {
          points = daily;
        } else {
          notes.push("cg.daily.empty");
        }
      } else {
        // (Optional) For hourly/minute, we still attempt market_chart for <= 7d windows
        const cappedDays = Math.min(days, 7); // CG returns hourly granularity up to 7D reliably
        const url =
          `${CG_BASE}/coins/${encodeURIComponent(cgId)}/market_chart` + // mapped id here
          `?vs_currency=${encodeURIComponent(currency.toLowerCase())}` +
          `&days=${encodeURIComponent(String(cappedDays))}`;
        notes.push(`cg.generic(${cappedDays}d)`);
        const j = await robustJsonFetch(url);
        const prices: [number, number][] = Array.isArray(j?.prices) ? j.prices : [];
        points = prices.map(([t, p]) => ({ t, p }));
      }
    }
  } catch (e: any) {
    notes.push(`cg.error:${String(e?.message || e)}`);
  }

  // On success, write hot + last-good cache entries
  if (points.length >= 2) {
    await cacheSet<Pt[]>(hotKey, points, HISTORY_HOT_TTL_SEC);
    await cacheSet<Pt[]>(lastGoodKey, points, HISTORY_LASTGOOD_TTL_SEC);
  }

  // Fallback: first try last-good cache, then synthesize from consensus (now + 24h-ago)
  if (points.length < 2) {
    const lastGood = await cacheGet<Pt[]>(lastGoodKey);
    if (lastGood && Array.isArray(lastGood) && lastGood.length >= 2) {
      notes.push("cache.lastgood");
      points = lastGood;
    } else {
      notes.push("consensus.synth");
      const synth = await synthFromConsensus(canonicalId, currency);
      if (Array.isArray(synth) && synth.length >= 2) {
        points = synth;
      }
    }
  }

  const body: any = {
    id: canonicalId, // keep canonical id in the response (unchanged contract)
    currency,
    points,
    updatedAt: new Date().toISOString(),
  };
  if (debug) body.debug = { dt: Date.now() - begin, notes, n: points.length };

  return NextResponse.json(body, { status: 200 });
}
