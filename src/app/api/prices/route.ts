import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
import { logInfo } from "../../../server/lib/metrics";

// ─────────────────────────────────────────────────────────────
// Simple in-memory cache for /api/prices
// Dev terms: per-server Map keyed by (currency + ids) with TTL.
// Plain English: the kitchen writes fresh prices on a whiteboard so
// it doesn't call the supplier every single time a waiter asks.
// ─────────────────────────────────────────────────────────────

type PricesCacheEntry = {
  payload: any;        // the JSON we send back to the client
  expiresAt: number;   // timestamp in ms when this cache entry is no longer fresh
};

const PRICE_CACHE = new Map<string, PricesCacheEntry>();

// How long a cached price set is considered "fresh" (in ms).
// 10_000ms = 10 seconds.
// Dev: safe, short TTL that dramatically cuts vendor calls.
// Plain English: we reuse the same answer for up to ~10 seconds.
const PRICE_CACHE_TTL_MS = 10_000;

export const dynamic = "force-dynamic"; // avoid stale edge caching in dev

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawIds = searchParams.get("ids") || "";
    const currency = (searchParams.get("currency") || "USD").toUpperCase();

    const ids = rawIds
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // ─────────────────────────────────────────────────────────
    // Cache lookup: try to serve from memory if still "fresh"
    // ─────────────────────────────────────────────────────────
    const cacheKey = `${currency}:${rawIds}`;
    const now = Date.now();
    const cached = PRICE_CACHE.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      const cachedPayload = cached.payload;

      // Phase 10: minimal observability (cache hit)
      logInfo("prices_served", {
        ids,
        currency,
        count: cachedPayload.rows?.length ?? 0,
        stale_count: (cachedPayload.rows ?? []).filter(
          (r: any) => r.stale
        ).length,
        cache: "hit",
      });

      const res = NextResponse.json(cachedPayload, { status: 200 });
      // Short edge cache with SWR semantics (safe even with dynamic in dev)
      res
        .headers
        .set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      return res;
    }

    // ─────────────────────────────────────────────────────────
    // Cache miss or stale: call existing price service
    // ─────────────────────────────────────────────────────────
    const payload = await getConsensusPrices(ids, currency);

    // Store fresh payload in the in-memory cache
    PRICE_CACHE.set(cacheKey, {
      payload,
      expiresAt: now + PRICE_CACHE_TTL_MS,
    });

    // Phase 10: minimal observability (cache miss/refresh)
    logInfo("prices_served", {
      ids,
      currency,
      count: payload.rows?.length ?? 0,
      stale_count: (payload.rows ?? []).filter((r: any) => r.stale).length,
      cache: cached ? "refresh" : "miss",
    });

    const res = NextResponse.json(payload, { status: 200 });
    // Short edge cache with SWR semantics (safe even with dynamic in dev)
    res
      .headers
      .set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
    return res;
  } catch (err: any) {
    const payload = {
      rows: [],
      updatedAt: new Date().toISOString(),
      error: String(err?.message || err),
    };
    // Log the error once; keep UI stable (fail-soft)
    logInfo("prices_error", { error: payload.error });

    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
