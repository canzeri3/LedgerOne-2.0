import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
import { logInfo } from "../../../server/lib/metrics";

export const dynamic = "force-dynamic"; // avoid stale edge caching in dev

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawIds = searchParams.get("ids") || "";
    const currency = (searchParams.get("currency") || "USD").toUpperCase();

    const ids = rawIds
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const payload = await getConsensusPrices(ids, currency);

    // Phase 10: minimal observability
    logInfo("prices_served", {
      ids,
      currency,
      count: payload.rows?.length ?? 0,
      stale_count: (payload.rows ?? []).filter(r => r.stale).length,
    });

    const res = NextResponse.json(payload, { status: 200 });
    // Short edge cache with SWR semantics (safe even with dynamic in dev)
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
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
