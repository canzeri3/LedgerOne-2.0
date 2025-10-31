// src/app/api/_dev/core-prices/route.ts
// TEMP endpoint to smoke-test the core service during migration.
import { NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";

export const revalidate = 0;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const ids = (u.searchParams.get("ids") || "bitcoin,ethereum,trx")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const currency = (u.searchParams.get("currency") || "USD").toUpperCase();

  const data = await getConsensusPrices(ids, currency);
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
  return res;
}

