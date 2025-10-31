// src/app/api/snapshot/route.ts
// Single-call snapshot for pages (dashboard/portfolio). Start minimal: prices only.
// Later we can add server-side aggregates (totals, allocations, pnl) without touching UIs.

import { NextResponse } from "next/server";
// Use relative import to avoid alias surprises during migration.
import { getConsensusPrices } from "../../../server/services/priceService";

export const revalidate = 0;
// Keep Node runtime (implicit). Do NOT set edge because providers/redis are Node APIs.

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);

    // Accept both ?ids=comma,list and multiple ?id=
    const repeated = u.searchParams.getAll("id");
    const fromCsv = (u.searchParams.get("ids") || "bitcoin,ethereum,trx")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const ids = (repeated.length ? repeated : fromCsv)
      .map(s => s.toLowerCase())
      .filter(Boolean);

    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();

    // Core batched prices
    const { rows, updatedAt } = await getConsensusPrices(ids, currency);

    // Room to grow: add server-side aggregates here later (e.g., portfolio totals)
    const payload = {
      updatedAt,
      currency,
      prices: rows,            // [{ id, price, price_24h, pct24h, source, stale, quality }]
      // holdings: [],         // (future) attach user holdings if you choose to compute server-side
      // totals: { ... },      // (future) server-side computed totals/pnl/allocations
    };

    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
    return res;
  } catch (err: any) {
    const fallback = {
      updatedAt: new Date().toISOString(),
      currency: "USD",
      prices: [],
      error: String(err?.message || err),
    };
    const res = NextResponse.json(fallback, { status: 200 });
    res.headers.set("Cache-Control", "public, s-maxage=2, stale-while-revalidate=15");
    return res;
  }
}

