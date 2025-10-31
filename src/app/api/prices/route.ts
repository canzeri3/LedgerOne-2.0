// src/app/api/prices/route.ts
// Batched prices endpoint for your app + adapters.
// Consumes the Phase 3 core service; short edge cache headers for snappy UX.

import { NextResponse } from "next/server";
// Use a RELATIVE import to avoid alias issues during migration.
// If your @ alias is configured, you can switch to: import { getConsensusPrices } from "@/server/services/priceService";
import { getConsensusPrices } from "../../../server/services/priceService";

export const revalidate = 0;           // don't use Next cache; we control caching via headers
// export const runtime = "nodejs";    // (implicit) keep Node runtime because Redis/provider libs aren't edge-safe

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const idsParam = u.searchParams.get("ids") ?? "";
    const currency = (u.searchParams.get("currency") ?? "USD").toUpperCase();

    // Normalize & validate ids
    const ids = idsParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Always return a valid payload (never 4xx on empty ids)
    if (ids.length === 0) {
      const empty = { rows: [], updatedAt: new Date().toISOString() };
      const res = NextResponse.json(empty, { status: 200 });
      res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      return res;
    }

    const data = await getConsensusPrices(ids, currency);

    const res = NextResponse.json(data, { status: 200 });
    // Short TTL, allow stale-while-revalidate so users see instant data while we refresh
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
    return res;
  } catch (err: any) {
    // Fail-soft contract: return an empty but valid payload to avoid crashing pages
    const fallback = { rows: [], updatedAt: new Date().toISOString(), error: String(err?.message || err) };
    const res = NextResponse.json(fallback, { status: 200 });
    res.headers.set("Cache-Control", "public, s-maxage=2, stale-while-revalidate=15");
    return res;
  }
}

