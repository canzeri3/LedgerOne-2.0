export const runtime = 'nodejs';

import { NextResponse } from "next/server";
// Relative import so it works in both Node runtime and dev
import { getConsensusPrices } from "../../../server/services/priceService";

export const revalidate = 0;

function parseIds(u: URL): string[] {
  // Support both ?ids=a,b,c and ?id=a&id=b
  const idsParam = u.searchParams.get("ids");
  const listFromIds = idsParam
    ? idsParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const listFromMulti = u.searchParams
    .getAll("id")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out = [...listFromIds, ...listFromMulti];
  // de-dupe while preserving order
  return Array.from(new Set(out));
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ids = parseIds(u);
    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();

    // If no ids provided, return empty (don’t throw)
    if (ids.length === 0) {
      const empty = { rows: [], updatedAt: new Date().toISOString() };
      const res = NextResponse.json(empty);
      res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=20");
      return res;
    }

    const payload = await getConsensusPrices(ids, currency);

    const res = NextResponse.json(payload);
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=20");
    return res;
  } catch (_err) {
    // Fail-soft: never crash pages
    const res = NextResponse.json({ rows: [], updatedAt: new Date().toISOString() });
    res.headers.set("Cache-Control", "public, s-maxage=2, stale-while-revalidate=10");
    return res;
  }
}
