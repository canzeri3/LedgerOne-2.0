import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";
import { logInfo } from "../../../server/lib/metrics";
import { z } from "zod";
import { Currency, parseIdsCsv, badRequest } from "@/server/schemas/common";

export const dynamic = "force-dynamic"; // avoid stale edge caching in dev

const PriceQuery = z.object({
  ids: z.string().min(1, "ids required"),
  currency: Currency.default("USD"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawIds = searchParams.get("ids") ?? "";
    const rawCurrency = searchParams.get("currency") ?? "USD";

    const parsed = PriceQuery.safeParse({ ids: rawIds, currency: rawCurrency });
    if (!parsed.success) {
      return NextResponse.json(
        { ...badRequest(parsed.error.errors.map(e => e.message).join("; ")), meta: { apiVersion: "v1" } },
        { status: 400 }
      );
    }

    const ids = parseIdsCsv(parsed.data.ids, 200);
    if (ids.length === 0) {
      return NextResponse.json(
        { ...badRequest("no valid ids provided"), meta: { apiVersion: "v1" } },
        { status: 400 }
      );
    }

    const currency = parsed.data.currency;

    const payload = await getConsensusPrices(ids, currency, { with24h: true });

    // Non-breaking: ensure meta.apiVersion is present
    const body = {
      ...payload,
      meta: { ...(payload as any).meta, apiVersion: "v1" },
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
    return res;
  } catch (err: any) {
    const payload = {
      rows: [],
      updatedAt: new Date().toISOString(),
      error: String(err?.message || err),
      meta: { apiVersion: "v1" },
    };
    logInfo("prices_error", { error: payload.error });

    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
