// src/app/api/price-history/route.ts
export const runtime = 'nodejs';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

// IMPORTANT: use relative imports (no "@/") inside route handlers to avoid dev alias quirks
import { robustJsonFetch } from "../../../server/lib/http";
import { cacheGet, cacheSet } from "../../../server/ttlCache";
import { mapToProvider, normalizeCoinId } from "../../../server/db/coinRegistry";
import { count, time, recordError } from "../../../server/obs";
import { getConsensusPrices } from "../../../server/services/priceService";

type Point = { t: number; p: number };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NOW = () => Date.now();

const CG_BASE = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro  = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro)  h["x-cg-pro-api-key"]  = pro;
  return h;
}

function hotKey(id: string, currency: string, days: number, interval: string) {
  return `hist:${currency}:${id}:${days}:${interval}`;
}
function lastGoodKey(id: string, currency: string, days: number, interval: string) {
  return `hist:lastgood:${currency}:${id}:${days}:${interval}`;
}

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
    .map((row) => ({ t: Number(row?.[0] ?? NaN), p: Number(row?.[1] ?? NaN) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0);
}

/** Build 2 points (tNow & ~tNow-24h) from /simple/price. Returns [] if not finite. */
function synthesize24hFromSimplePrice(cgSimple: any, cgId: string, currency: string): Point[] {
  const row = cgSimple?.[cgId];
  const now = Number(row?.[currency.toLowerCase()]);
  const pct = Number(row?.[`${currency.toLowerCase()}_24h_change`]); // percent number

  if (!Number.isFinite(now) || now <= 0) return [];
  const tNow = NOW();
  const t24  = tNow - ONE_DAY_MS;

  if (Number.isFinite(pct)) {
    const p24 = now / (1 + pct / 100);
    if (Number.isFinite(p24) && p24 > 0) return [{ t: t24, p: p24 }, { t: tNow, p: now }];
  }
  return [{ t: t24, p: now }, { t: tNow, p: now }];
}

/** Select the correct row by id (not index). */
function pickRowById(rows: any[], canonicalId: string) {
  if (!Array.isArray(rows)) return null;
  return rows.find(r => (r?.id || "").toLowerCase() === canonicalId) ?? null;
}

function twoPointsFromConsensusRow(row: any, notes: string[], tag: string): Point[] {
  const pNow = Number(row?.price);
  const p24  = Number(row?.price_24h);
  const pct  = Number(row?.pct24h);

  if (!Number.isFinite(pNow) || pNow <= 0) { notes.push(`${tag}: pNow not finite`); return []; }

  let p24Use: number;
  if (Number.isFinite(p24) && p24 > 0) {
    p24Use = p24;
  } else if (Number.isFinite(pct)) {
    const inv = pNow / (1 + pct / 100);
    p24Use = Number.isFinite(inv) && inv > 0 ? inv : pNow;
  } else {
    p24Use = pNow;
  }

  const tNow = NOW();
  const t24  = tNow - ONE_DAY_MS;
  return [{ t: t24, p: p24Use }, { t: tNow, p: pNow }];
}

/** 2-point synth from internal HTTP (/api/prices) — finds row by id and uses longer timeout. */
async function synthesizeFromInternalHTTP(originBase: string, canonicalId: string, currency: string, notes: string[]): Promise<Point[]> {
  try {
    const url = `${originBase}/api/prices?ids=${encodeURIComponent(canonicalId)}&currency=${encodeURIComponent(currency)}`;
    const data = await robustJsonFetch<any>(url, {}, { timeoutMs: 2500, attempts: 4, backoffBaseMs: 180 });
    const row = pickRowById(data?.rows, canonicalId);
    return twoPointsFromConsensusRow(row, notes, "internal-http");
  } catch (e: any) {
    notes.push(`internal-http failed: ${String(e?.message || e)}`);
    return [];
  }
}

/** 2-point synth by calling core directly (no HTTP) — finds row by id.
 *  🚫 Avoid recursion: disable 24h lookup when called from /api/price-history.
 */
async function synthesizeFromCore(canonicalId: string, currency: string, notes: string[]): Promise<Point[]> {
  try {
    const payload = await getConsensusPrices([canonicalId], currency, { with24h: false });
    const row = pickRowById(payload?.rows, canonicalId);
    return twoPointsFromConsensusRow(row, notes, "core");
  } catch (e: any) {
    notes.push(`core call failed: ${String(e?.message || e)}`);
    return [];
  }
}

/** 2-point synth using the **last-good** consensus cache written by priceService — finds row by id. */
async function synthesizeFromLastGoodCache(canonicalId: string, currency: string, notes: string[]): Promise<Point[]> {
  try {
    const singleKey = `price:live:lastgood:${currency}:${canonicalId}`;
    const cached = await cacheGet<{ rows?: any[] }>(singleKey);
    const row = pickRowById(cached?.rows, canonicalId);
    const pts = twoPointsFromConsensusRow(row, notes, "last-good-cache");
    if (pts.length >= 2) return pts;

    notes.push("last-good-cache: single-id miss or non-finite");
    return [];
  } catch (e: any) {
    notes.push(`last-good-cache failed: ${String(e?.message || e)}`);
    return [];
  }
}

// ✅ Export GET as a const (avoids some build edge cases)
export const GET = async (req: NextRequest) => {
  const nowIso = new Date().toISOString();
  const debugPath: string[] = [];
  const debugNotes: string[] = [];

  try {
    const u = new URL(req.url);
    const rawId = (u.searchParams.get("id") || "").trim().toLowerCase();
    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();
    const days = Math.max(1, Math.min(90, Number(u.searchParams.get("days") || 1)));
    const preferInterval = u.searchParams.get("interval") || (days <= 1 ? "minute" : "hourly");
    const wantDebug = u.searchParams.get("debug") === "1";
    const originBase = `${u.protocol}//${u.host}`;

    if (!rawId) {
      return NextResponse.json({ id: null, currency, points: [], updatedAt: nowIso }, { status: 200 });
    }

    // Canonicalize and map to Coingecko (guard TRX→tron)
    const canonical = (await normalizeCoinId(rawId)) ?? rawId;
    let cgId = (await mapToProvider(canonical, "coingecko")) ?? canonical;
    if (cgId === "trx") cgId = "tron";

    const hot = hotKey(canonical, currency, days, preferInterval);
    const lkg = lastGoodKey(canonical, currency, days, preferInterval);

    // Hot cache
    const cached = await cacheGet<{ id: string; currency: string; points: Point[]; updatedAt: string }>(hot);
    if (cached) {
      const res = NextResponse.json(wantDebug ? { ...cached, debug: { path: ["hot-cache"] } } : cached);
      res.headers.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
      return res;
    }

    let points: Point[] = [];

    // 1) CG preferred interval
    try {
      const data = await time("provider.cg.market_chart.ms", () =>
        fetchCgMarketChart(cgId, currency, days, preferInterval)
      );
      count("provider.cg.market_chart.calls", 1);
      points = normalizePoints(data);
      if (points.length) debugPath.push(`cg.market_chart:${preferInterval}`);
    } catch { debugNotes.push("market_chart preferred failed"); }

    // 2) CG hourly fallback
    if (points.length === 0 && preferInterval !== "hourly") {
      try {
        const alt = await time("provider.cg.market_chart.ms", () =>
          fetchCgMarketChart(cgId, currency, days, "hourly")
        );
        count("provider.cg.market_chart.calls", 1);
        points = normalizePoints(alt);
        if (points.length) debugPath.push("cg.market_chart:hourly");
      } catch { debugNotes.push("market_chart hourly failed"); }
    }

    // 3) CG simple/price synth (days == 1)
    if (points.length === 0 && days === 1) {
      try {
        const simp = await time("provider.cg.simple_price.ms", () =>
          fetchCgSimplePrice(cgId, currency)
        );
        count("provider.cg.simple_price.calls", 1);
        const synth = synthesize24hFromSimplePrice(simp, cgId, currency);
        if (synth.length >= 2) {
          points = synth;
          debugPath.push("cg.simple_price.synth");
        } else {
          debugNotes.push("simple_price synth empty");
        }
      } catch { debugNotes.push("simple_price failed"); }
    }

    // 4) Internal HTTP synth (by id)
    if (points.length === 0 && days === 1) {
      const synthHTTP = await synthesizeFromInternalHTTP(originBase, canonical, currency, debugNotes);
      if (synthHTTP.length >= 2) {
        points = synthHTTP;
        debugPath.push("internal.consensus.synth.http");
        count("history.internal_consensus.fallback", 1);
      }
    }

    // 5) Core direct synth (no HTTP) — with24h:false prevents recursion
    if (points.length === 0 && days === 1) {
      const synthCore = await synthesizeFromCore(canonical, currency, debugNotes);
      if (synthCore.length >= 2) {
        points = synthCore;
        debugPath.push("internal.consensus.synth.core");
        count("history.internal_consensus.fallback", 1);
      }
    }

    // 6) Last-good consensus cache synth (by id)
    if (points.length === 0 && days === 1) {
      const synthLKG = await synthesizeFromLastGoodCache(canonical, currency, debugNotes);
      if (synthLKG.length >= 2) {
        points = synthLKG;
        debugPath.push("internal.consensus.synth.lastgood");
      }
    }

    // 7) Last-good history payload fallback
    if (points.length === 0) {
      const lastGood = await cacheGet<{ id: string; currency: string; points: Point[]; updatedAt: string }>(lkg);
      if (lastGood && lastGood.points?.length >= 2) {
        const payload = { ...lastGood, id: canonical, stale: true };
        const res = NextResponse.json(
          wantDebug ? { ...payload, debug: { path: [...debugPath, "last-good"], notes: debugNotes } } : payload
        );
        res.headers.set("Cache-Control", "public, s-maxage=10, stale-while-revalidate=60");
        return res;
      }
      const payload = { id: canonical, currency, points: [], updatedAt: nowIso, error: "history_unavailable" };
      return NextResponse.json(wantDebug ? { ...payload, debug: { path: debugPath, notes: debugNotes } } : payload, { status: 200 });
    }

    // Cache & return
    const payload = { id: canonical, currency, points, updatedAt: nowIso };
    await cacheSet(hot, payload, 20);
    await cacheSet(lkg, payload, 300);

    const res = NextResponse.json(
      wantDebug ? { ...payload, debug: { path: debugPath, notes: debugNotes } } : payload
    );
    res.headers.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    return res;
  } catch (_err) {
    recordError("price-history route error");
    return NextResponse.json(
      { id: null, currency: "USD", points: [], updatedAt: new Date().toISOString(), error: "history_unavailable" },
      { status: 200 }
    );
  }
};
