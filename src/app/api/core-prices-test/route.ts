// src/app/api/core-prices-test/route.ts
// Simple test endpoint that uses the Phase 3 service with RELATIVE imports
// (to avoid tsconfig path alias issues during debugging).

import { NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService"; // relative path (no @ alias)

export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ids = (u.searchParams.get("ids") || "bitcoin,ethereum,trx")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();

    const data = await getConsensusPrices(ids, currency);
    const res = NextResponse.json(data);
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

