// src/app/api/price-history/route.ts
// Robust history proxy with API-key support, interval fallback, simple/price synthesis,
// and last-good caching so charts never go empty.

import { NextResponse } from "next/server";
import { robustJsonFetch } from "../../../server/lib/http";
import { cacheGet, cacheSet } from "../../../server/ttlCache";
import { mapToProvider, normalizeCoinId } from "../../../server/db/coinRegistry";

export const revalidate = 0;

type Point = { t: number; p: number };

const NOW = () => Date.now();

function hotKey(id: string, currency: string, days: number, interval: string) {
  return `hist:${currency}:${id}:${days}:${interval}`;
}
function lastGoodKey(id: string, currency: string, days: number, interval: string) {
  return `hist:lastgood:${currency}:${id}:${days}:${interval}`;
}

function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro  = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro)  h["x-cg-pro-api-key"]  = pro;
  return h;
}

const CG_BASE = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

async function fetchCgMarketChart(cgId: string, currency: string, days: number, interval: string) {
  const url = `${CG_BASE}/coins/${encodeURIComponent(cgId)}/market_chart?vs_currency=${encodeURIComponent(
    currency.toLowerCase()
  )}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(interval)}`;

  return await robustJsonFetch<any>(
    url,
    { headers: cgHeaders() },
    { timeoutMs: 2500, attempts: 3, backoffBaseMs: 180, backoffJitterMs: 140 }
  );
}

async function fetchCgSimplePrice(cgId: string, currency: string) {
  const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(
    cgId
  )}&vs_currencies=${encodeURIComponent(currency.toLowerCase())}&include_24hr_change=true`;

  return await robustJsonFetch<any>(
    url,
    { headers: cgHeaders() },
    { timeoutMs: 2000, attempts: 3, backoffBaseMs: 150, backoffJitterMs: 120 }
  );
}

function normalizePoints(data: any): Point[] {
  const arr: any[] = Array.isArray(data?.prices) ? data.prices : [];
  return arr
    .map((row) => ({ t: Number(row?.[0] ?? 0), p: Number(row?.[1] ?? NaN) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p));
}

/** Synthesize a tiny 24h series from simple/price (now + ~24h ago) */
function synthesize24hFromSimplePrice(cgSimple: any, cgId: string, currency: string): Point[] {
  const row = cgSimple?.[cgId];
  const nowPrice = Number(row?.[currency.toLowerCase()]);
  const pct = Number(row?.[`${currency.toLowerCase()}_24h_change`]); // e.g., 1.5 means +1.5%
  if (!Number.isFinite(nowPrice)) return [];

  // If pct is finite, derive 24h-ago price. Otherwise just emit a flat line.
  let p24: number | null = null;
  if (Number.isFinite(pct)) {
    p24 = nowPrice / (1 + pct / 100); // invert pct change
  }
  const tNow = NOW();
  const t24  = tNow - 24 * 60 * 60 * 1000;

  if (Number.isFinite(p24 as number)) {
    return [
      { t: t24, p: p24 as number },
      { t: tNow, p: nowPrice },
    ];
  }
  // Fallback: single point (dup now at 24h) to avoid empty chart
  return [
    { t: t24, p: nowPrice },
    { t: tNow, p: nowPrice },
  ];
}

export async function GET(req: Request) {
  const nowIso = new Date().toISOString();

  try {
    const u = new URL(req.url);
    const rawId = (u.searchParams.get("id") || "").trim().toLowerCase();
    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();
    const days = Math.max(1, Math.min(90, Number(u.searchParams.get("days") || 1)));
    const preferInterval = u.searchParams.get("interval") || (days <= 1 ? "minute" : "hourly");

    if (!rawId) {
      return NextResponse.json({ id: null, currency, points: [], updatedAt: nowIso }, { status: 200 });
    }

    // Canonicalize and map to Coingecko external id (trx -> tron)
    const canonical = (await normalizeCoinId(rawId)) ?? rawId;
    const cgId = (await mapToProvider(canonical, "coingecko")) ?? canonical;

    const hot = hotKey(canonical, currency, days, preferInterval);
    const lkg = lastGoodKey(canonical, currency, days, preferInterval);

    // Serve hot cache if present
    const cached = await cacheGet<{ id: string; currency: string; points: Point[]; updatedAt: string }>(hot);
    if (cached) {
      const res = NextResponse.json(cached);
      res.headers.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
      return res;
    }

    // 1) Try preferred interval
    let points: Point[] = [];
    try {
      const data = await fetchCgMarketChart(cgId, currency, days, preferInterval);
      points = normalizePoints(data);
    } catch {}

    // 2) If empty and not already hourly, try hourly
    if (points.length === 0 && preferInterval !== "hourly") {
      try {
        const alt = await fetchCgMarketChart(cgId, currency, days, "hourly");
        points = normalizePoints(alt);
      } catch {}
    }

    // 3) If still empty AND days === 1, synthesize using /simple/price (now + 24h)
    if (points.length === 0 && days === 1) {
      try {
        const simp = await fetchCgSimplePrice(cgId, currency);
        points = synthesize24hFromSimplePrice(simp, cgId, currency);
      } catch {}
    }

    // 4) If still empty, try last-good
    if (points.length === 0) {
      const lastGood = await cacheGet<{ id: string; currency: string; points: Point[]; updatedAt: string }>(lkg);
      if (lastGood) {
        const res = NextResponse.json({ ...lastGood, stale: true });
        res.headers.set("Cache-Control", "public, s-maxage=10, stale-while-revalidate=60");
        return res;
      }
      // Final soft-fail
      return NextResponse.json(
        { id: null, currency, points: [], updatedAt: nowIso, error: "history_unavailable" },
        { status: 200 }
      );
    }

    const payload = { id: canonical, currency, points, updatedAt: nowIso };
    await cacheSet(hot, payload, 20);   // hot
    await cacheSet(lkg, payload, 300);  // last-good

    const res = NextResponse.json(payload);
    res.headers.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    return res;
  } catch {
    return NextResponse.json(
      { id: null, currency: "USD", points: [], updatedAt: nowIso, error: "history_unavailable" },
      { status: 200 }
    );
  }
}
