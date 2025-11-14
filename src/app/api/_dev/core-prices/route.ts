// src/app/api/_dev/core-prices/route.ts
// TEMP: disable this dev-only endpoint for production build.
// The real core price logic lives in src/server/services/priceService.ts
// and is used by the main NEW data core APIs (/api/prices, /api/price-history, etc).

import { NextResponse } from "next/server";

export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "DEV core-prices smoke-test endpoint is disabled in this build. Use /api/prices and /api/price-history instead.",
    },
    { status: 503 }
  );
}
