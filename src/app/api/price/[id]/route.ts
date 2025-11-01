// src/app/api/price/[id]/route.ts
// Adapter: preserves legacy JSON for components while using the new /api/prices core.

import { NextResponse } from "next/server";
// Phase 11: add lightweight observability
import { logInfo } from "../../../../server/lib/metrics";

export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = (params.id || "").toLowerCase();

  // Log adapter usage (lets us know when this legacy route is still called)
  logInfo("adapter_price_hit", { id });

  // Call the new batched endpoint with a single id
  const core = await fetch(
    `http://localhost:3000/api/prices?ids=${encodeURIComponent(id)}&currency=USD`,
    { cache: "no-store" }
  ).then(r => r.json());

  const row = core?.rows?.find((r: any) => r.id === id) ?? null;

  // Return EXACT legacy shape your UI expects
  const legacy = row ? {
    price: row.price,
    change_24h_pct: row.pct24h ?? null,
    price_24h: row.price_24h ?? null,
    captured_at: core.updatedAt,
    provider: row.source ?? "consensus",
    stale: !!row.stale
  } : {
    price: null,
    change_24h_pct: null,
    price_24h: null,
    captured_at: new Date().toISOString(),
    provider: "fallback",
    stale: true
  };

  const res = NextResponse.json(legacy);
  res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
  return res;
}
