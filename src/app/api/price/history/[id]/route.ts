export const runtime = 'nodejs';

import { NextResponse } from "next/server";

export const revalidate = 0;

/**
 * Legacy shim for /api/price/history/[id]
 * Proxies to the new canonical route: /api/price-history?id=<id>&currency=<>&days=<>&interval=<>
 */
export async function GET(
  req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const id = (ctx.params?.id || "").trim().toLowerCase();
    const u = new URL(req.url);

    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();
    const days = u.searchParams.get("days") || "1";
    const interval = u.searchParams.get("interval") || "";

    const target = new URL(`${u.origin}/api/price-history`);
    target.searchParams.set("id", id);
    target.searchParams.set("currency", currency);
    if (days) target.searchParams.set("days", days);
    if (interval) target.searchParams.set("interval", interval);

    const r = await fetch(target.toString(), { cache: "no-store" });
    const body = await r.text();

    const res = new NextResponse(body, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
    // propagate reasonable cache hints
    res.headers.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    return res;
  } catch {
    return NextResponse.json(
      { id: null, currency: "USD", points: [], updatedAt: new Date().toISOString(), error: "history_unavailable" },
      { status: 200 }
    );
  }
}
