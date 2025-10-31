import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";

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
    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { rows: [], updatedAt: new Date().toISOString(), error: String(err?.message || err) },
      { status: 200 } // fail-soft: keep UI stable
    );
  }
}
