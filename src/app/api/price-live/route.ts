// src/app/api/price-live/route.ts
// Adapter: preserves legacy batched shape while using the new /api/prices core.

import { NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(req: Request) {
  const u = new URL(req.url);

  // Some legacy code used ?id=... multiple times; others used ?ids=comma,list
  const repeated = u.searchParams.getAll("id");
  const fromCsv = (u.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  const list = (repeated.length ? repeated : fromCsv).map(s => s.toLowerCase());
  const q = list.join(",");

  const core = await fetch(
    `http://localhost:3000/api/prices?ids=${encodeURIComponent(q)}&currency=USD`,
    { cache: "no-store" }
  ).then(r => r.json());

  // Legacy-style rows (adjust keys only if your UI expects different names)
  const rows = (core?.rows ?? []).map((r: any) => ({
    id: r.id,
    price: r.price,
    pct24h: r.pct24h ?? null,
    price_24h: r.price_24h ?? null,
    source: r.source ?? "consensus",
    stale: !!r.stale
  }));

  const payload = { rows, updatedAt: core.updatedAt };
  const res = NextResponse.json(payload);
  res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
  return res;
}
