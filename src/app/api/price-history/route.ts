// src/app/api/price-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
// NEW: map canonical id -> provider-specific id (e.g., trx -> tron for CoinGecko)
import { mapToProvider /*, normalizeCoinId*/ } from "@/server/db/coinRegistry";
import { z } from "zod";
import { CoinId, Currency, Interval, IntRange, badRequest } from "@/server/schemas/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pt = { t: number; p: number };

const CG_BASE = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

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
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(
    currency.toLowerCase()
  )}&days=${encodeURIComponent(String(days))}&interval=daily`;
  const j = await robustJsonFetch(url);
  const prices: any[] = Array.isArray(j?.prices) ? j.prices : [];
  return prices
    .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([t, v]) => ({ t, p: Number(v) as number }));
}

async function fetchCgRange(id: string, currency: string, fromSec: number, toSec: number): Promise<Pt[]> {
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart/range?vs_currency=${encodeURIComponent(
    currency.toLowerCase()
  )}&from=${fromSec}&to=${toSec}`;
  const j = await robustJsonFetch(url);
  const prices: any[] = Array.isArray(j?.prices) ? j.prices : [];
  return prices
    .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([t, v]) => ({ t, p: Number(v) as number }));
}

const Query = z.object({
  id: CoinId,
  days: z
    .union([z.literal("max"), IntRange(1, 3650)]) // generous upper bound; UI picks sane windows
    .transform((v) => (typeof v === "string" ? v : Number(v))),
  interval: Interval.optional(),
  currency: Currency.default("USD"),
  debug: z.enum(["0", "1"]).optional(),
});

export async function GET(req: NextRequest) {
  const u = new URL(req.url);

  const idRaw = u.searchParams.get("id") ?? "";
  const daysParam = u.searchParams.get("days") ?? "30";
  const intervalParam = (u.searchParams.get("interval") || "").toLowerCase();
  const currencyParam = u.searchParams.get("currency") ?? "USD";
  const debugParam = u.searchParams.get("debug") ?? "0";

  const parsed = Query.safeParse({
    id: idRaw,
    days: daysParam === "max" ? "max" : daysParam,
    interval: intervalParam || undefined,
    currency: currencyParam,
    debug: debugParam,
  });

  if (!parsed.success) {
    return NextResponse.json(
      badRequest(parsed.error.errors.map(e => e.message).join("; ")),
      { status: 400 }
    );
  }

  const canonicalId = parsed.data.id;
  const daysVal = parsed.data.days;
  const interval: "minute" | "hourly" | "daily" =
    parsed.data.interval ??
    (typeof daysVal === "number" && daysVal >= 20 ? "daily" : "hourly");
  const currency = parsed.data.currency;
  const debug = parsed.data.debug === "1";

  const notes: string[] = [];

  // Provider id mapping (non-breaking; response id stays canonical)
  const cgId = (await mapToProvider(canonicalId, "coingecko")) ?? canonicalId;
  if (cgId !== canonicalId) notes.push(`map.coingecko:${canonicalId}->${cgId}`);

  let points: Pt[] = [];
  const begin = Date.now();

  if (typeof daysVal === "number") {
    if (interval === "daily") {
      points = await fetchCgDaily(cgId, currency, daysVal);
    } else {
      // hourly/minute -> use range (approximate: past N days to now)
      const to = Math.floor(Date.now() / 1000);
      const from = Math.max(0, to - Math.floor(daysVal * 86400));
      const range = await fetchCgRange(cgId, currency, from, to);
      points = range;
    }
  } else {
    // days=max path: fall back to range far back in time (e.g., 10y)
    const to = Math.floor(Date.now() / 1000);
    const from = Math.max(0, to - 3650 * 86400);
    const synth = await fetchCgRange(cgId, currency, from, to);
    if (Array.isArray(synth) && synth.length >= 2) {
      points = synth;
    }
  }

  const body: any = {
    id: canonicalId,
    currency,
    points,
    updatedAt: new Date().toISOString(),
    meta: { apiVersion: "v1" },
  };
  if (debug) body.debug = { dt: Date.now() - begin, notes, n: points.length };

  return NextResponse.json(body, { status: 200 });
}
