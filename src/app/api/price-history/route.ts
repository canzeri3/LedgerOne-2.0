// src/app/api/price-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
// map canonical id -> provider-specific id (e.g., trx -> tron for CoinGecko)
import { mapToProvider /*, normalizeCoinId*/ } from "@/server/db/coinRegistry";
import { cacheGet, cacheSet } from "@/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pt = { t: number; p: number };

const CG_BASE =
  process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

const HISTORY_HOT_TTL_SEC = 300; // 5 minutes
const HISTORY_LASTGOOD_TTL_SEC = 3600; // 1 hour

// ─────────────────────────────────────────────────────────────
// Supabase REST access for daily candles (coin_bars_daily)
// Phase 4B: DB-backed history layer for interval=daily
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE ??
  process.env.SUPABASE_SERVICE_KEY ??
  "";
const HAS_SUPABASE_ADMIN = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

type DailyBarRow = {
  id: string;
  currency: string;
  ts: string; // timestamptz
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | null;
};

/**
 * Fetch daily OHLC from coin_bars_daily for the last N days.
 * Returns [{t,p}] based on close, or null if DB is unavailable/empty.
 *
 * Dev: safe wrapper; never throws. If anything goes wrong, returns null and
 * caller falls back to existing CG + ttlCache logic.
 */
async function fetchDailyFromDb(
  canonicalId: string,
  currency: string,
  days: number
): Promise<Pt[] | null> {
  if (!HAS_SUPABASE_ADMIN) return null;

  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();

  const url =
    `${SUPABASE_URL}/rest/v1/coin_bars_daily` +
    `?select=ts,close` +
    `&id=eq.${encodeURIComponent(canonicalId)}` +
    `&currency=eq.${encodeURIComponent(currency)}` +
    `&ts=gte.${encodeURIComponent(fromIso)}` +
    `&order=ts.asc`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      // Fail soft: no DB result, caller will fall back.
      return null;
    }

    const data = (await res.json()) as DailyBarRow[];

    if (!Array.isArray(data) || data.length < 2) return null;

    return data.map((row) => ({
      t: new Date(row.ts).getTime(),
      p: Number(row.close),
    }));
  } catch {
    // Any network / JSON errors => treat as no data.
    return null;
  }
}

/**
 * Upsert daily bars into coin_bars_daily using Supabase REST.
 * We approximate OHLC = close for now (since CG daily gives one price per day).
 *
 * Dev: safe wrapper, never throws. Returns true on success, false on failure.
 * Plain English: after we ask Coingecko for a 30d daily report, we copy those
 * numbers into our own ledger so future calls can read from the DB first.
 */
/**
 * Upsert daily bars into coin_bars_daily using Supabase REST.
 * We approximate OHLC = close for now (since CG daily gives one price per day).
 *
 * Dev: safe wrapper, never throws. Returns true on success, false on failure.
 * Plain English: after we ask Coingecko for a 30d daily report, we copy those
 * numbers into our own ledger so future calls can read from the DB first.
 *
 * IMPORTANT: Before inserting we fetch existing days and only insert NEW ones.
 * This avoids primary-key conflicts even if upsert/on_conflict isn’t behaving.
 */
async function upsertDailyBars(
  canonicalId: string,
  currency: string,
  points: Pt[]
): Promise<boolean> {
  if (!HAS_SUPABASE_ADMIN) return false;
  if (!points.length) return true;

  // Normalize each timestamp to UTC midnight for that day so (id,currency,ts)
  // stays stable and matches your PRIMARY KEY.
  const normalizedRows = points.map((pt) => {
    const d = new Date(pt.t);
    const tsMidnight = new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        0,
        0,
        0,
        0
      )
    ).toISOString();

    const close = pt.p;
    return {
      id: canonicalId,
      currency,
      ts: tsMidnight,
      open: close,
      high: close,
      low: close,
      close,
      volume: null as number | null,
    };
  });

  try {
    // 1) Fetch existing candles for this id/currency so we can avoid
    // inserting duplicate (id,currency,ts) rows that would violate the PK.
    const existingUrl =
      `${SUPABASE_URL}/rest/v1/coin_bars_daily` +
      `?select=ts` +
      `&id=eq.${encodeURIComponent(canonicalId)}` +
      `&currency=eq.${encodeURIComponent(currency)}`;

    const existingRes = await fetch(existingUrl, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    let existingIsoSet = new Set<string>();
    if (existingRes.ok) {
      const existingData = (await existingRes.json()) as { ts: string }[];
      if (Array.isArray(existingData)) {
        existingIsoSet = new Set(
          existingData.map((row) => new Date(row.ts).toISOString())
        );
      }
    }

    // 2) Filter out rows whose ts already exists in the DB, so we only
    // insert NEW days and never hit a primary-key conflict.
    const rowsToInsert = normalizedRows.filter(
      (row) => !existingIsoSet.has(row.ts)
    );

    if (rowsToInsert.length === 0) {
      // Nothing new to write; treat as success.
      return true;
    }

    // 3) Insert only new rows (no on_conflict needed since we pre-filtered).
    const insertUrl = `${SUPABASE_URL}/rest/v1/coin_bars_daily`;
    const res = await fetch(insertUrl, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        // return=minimal avoids sending back the inserted rows
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rowsToInsert),
      cache: "no-store",
    });

    if (!res.ok) {
      // We don't throw: just fail-soft and let the caller use CG data.
      return false;
    }

    return true;
  } catch {
    return false;
  }
}


// ─────────────────────────────────────────────────────────────
// Coingecko + consensus helpers (existing Phase 4A logic)
// ─────────────────────────────────────────────────────────────

function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro) h["x-cg-pro-api-key"] = pro;
  return h;
}

async function robustJsonFetch(
  url: string,
  init?: RequestInit,
  attempts = 3
): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, {
        ...init,
        cache: "no-store",
        headers: { ...(init?.headers || {}), ...cgHeaders() },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
    await new Promise((res) =>
      setTimeout(res, 120 + Math.random() * 120)
    );
  }
  throw lastErr;
}

/**
 * Fetch daily history for N days from Coingecko market_chart.
 * Returns [{t,p}] or [] if not available.
 */
async function fetchCgDaily(
  id: string,
  currency: string,
  days: number
): Promise<Pt[]> {
  // Coingecko supports interval=daily to compress to one point per day.
  const url =
    `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart` +
    `?vs_currency=${encodeURIComponent(currency.toLowerCase())}` +
    `&days=${encodeURIComponent(String(days))}` +
    `&interval=daily`;
  const j = await robustJsonFetch(url);
  const prices: [number, number][] = Array.isArray(j?.prices)
    ? j.prices
    : [];
  return prices.map(([t, p]) => ({ t, p }));
}

/**
 * Fallback: synthesize a 2-point history from consensus (now + 24h-ago)
 * for cases where CG history is not available.
 */
async function synthFromConsensus(
  canonicalId: string,
  currency: string
): Promise<Pt[]> {
  const { rows } = await getConsensusPrices([canonicalId], currency);
  const row = rows?.[0];
  if (
    !row ||
    typeof row.price !== "number" ||
    typeof row.price_24h !== "number"
  )
    return [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  return [
    { t: dayAgo, p: row.price_24h },
    { t: now, p: row.price },
  ];
}

export async function GET(req: NextRequest) {
  const begin = Date.now();
  const u = new URL(req.url);

  const idRaw = u.searchParams.get("id") || "";
  const canonicalId = idRaw.trim().toLowerCase();
  const daysParam = u.searchParams.get("days");
  const intervalParam = (u.searchParams.get("interval") || "")
    .toLowerCase() as "minute" | "hourly" | "daily" | "";
  const currency = (u.searchParams.get("currency") || "USD").toUpperCase();
  const debug = u.searchParams.get("debug") === "1";

  // Default handling: if days >= 20 and no interval specified, assume 'daily'
  const days = Math.max(1, Number(daysParam || "30"));
  const interval: "minute" | "hourly" | "daily" =
    intervalParam === "minute" ||
    intervalParam === "hourly" ||
    intervalParam === "daily"
      ? intervalParam
      : days >= 20
      ? "daily"
      : "hourly";

  const notes: string[] = [];

  if (!canonicalId) {
    return NextResponse.json(
      { id: "", currency, points: [], error: "missing_id" },
      { status: 400 }
    );
  }

  // Resolve provider-specific id for CoinGecko (e.g., trx -> tron). Non-breaking:
  // we still return canonicalId in the response.
  const cgId = (await mapToProvider(canonicalId, "coingecko")) ?? canonicalId;
  if (cgId !== canonicalId)
    notes.push(`map.coingecko:${canonicalId}->${cgId}`);

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
        // Phase 4B: try DB daily candles first
        if (HAS_SUPABASE_ADMIN) {
          const dbDaily = await fetchDailyFromDb(canonicalId, currency, days);

          if (dbDaily && dbDaily.length >= 2) {
            // Guardrail: only treat DB as a "hit" if it covers the requested window.
            // This prevents 1Y from looking identical to 90D when the DB only has ~90 days populated.
            const DAY_MS = 24 * 60 * 60 * 1000;
            const HOUR_MS = 60 * 60 * 1000;
            const windowStartMs = Date.now() - days * DAY_MS;

            // Allow a small tolerance (DB might not have an exact point at window start)
            const coverageOk = dbDaily[0].t <= windowStartMs + 36 * HOUR_MS;

            if (coverageOk) {
              notes.push("db.daily.hit");
              points = dbDaily;
            } else {
              // Partial DB coverage: fall back to CG for the full window and opportunistically backfill DB.
              notes.push("db.daily.partial");
              notes.push("db.daily.miss");
            }
          } else {
            notes.push("db.daily.miss");
          }
        } else {
          notes.push("db.disabled");
        }


        // If DB didn't satisfy, fall back to Coingecko daily path
        if (points.length === 0) {
          notes.push(`cg.daily(${days})`);
          const daily = await fetchCgDaily(cgId, currency, days); // mapped id here
          if (Array.isArray(daily) && daily.length >= 2) {
            points = daily;

            // New: opportunistic write into coin_bars_daily so future
            // daily requests can be served from DB, not CG.
            if (HAS_SUPABASE_ADMIN && notes.includes("db.daily.miss")) {
              const ok = await upsertDailyBars(
                canonicalId,
                currency,
                daily
              );
              if (ok) notes.push("db.daily.upsert.ok");
              else notes.push("db.daily.upsert.fail");
            }
          } else {
            notes.push("cg.daily.empty");
          }
        }
      } else {
        // For hourly/minute, we still attempt market_chart for <= 7d windows
        const cappedDays = Math.min(days, 7); // CG returns hourly granularity up to 7D reliably
        const url =
          `${CG_BASE}/coins/${encodeURIComponent(cgId)}/market_chart` + // mapped id here
          `?vs_currency=${encodeURIComponent(currency.toLowerCase())}` +
          `&days=${encodeURIComponent(String(cappedDays))}`;
        notes.push(`cg.generic(${cappedDays}d)`);
        const j = await robustJsonFetch(url);
        const prices: [number, number][] = Array.isArray(j?.prices)
          ? j.prices
          : [];
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
