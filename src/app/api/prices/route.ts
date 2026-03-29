import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
import { logInfo } from "../../../server/lib/metrics";

// ── Input validation constants ───────────────────────────────
const MAX_IDS = 50;
// CoinGecko IDs: lowercase alphanumeric + hyphens, 1–100 chars
const COIN_ID_RE = /^[a-z0-9][a-z0-9\-]{0,99}$/;

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

    // ── Input validation ─────────────────────────────────────
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Too many IDs — max ${MAX_IDS} per request` },
        { status: 400 }
      );
    }
    const invalidId = ids.find((id) => !COIN_ID_RE.test(id));
    if (invalidId) {
      return NextResponse.json(
        { error: `Invalid coin ID: "${invalidId}"` },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────
    // Cache lookup: try to serve from memory if still "fresh"
    // Sort IDs so bitcoin,ethereum and ethereum,bitcoin share one cache entry.
    // ─────────────────────────────────────────────────────────
    const sortedIds = [...ids].sort();
    const cacheKey = `${currency}:${sortedIds.join(",")}`;
    const now = Date.now();
    const cached = PRICE_CACHE.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      const cachedPayload = cached.payload;

      // Phase 10: minimal observability (cache hit)
      // SECURITY: never log the ids array — it reveals which coins a user holds.
      logInfo("prices_served", {
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
    // SECURITY: never log the ids array — it reveals which coins a user holds.
    logInfo("prices_served", {
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
