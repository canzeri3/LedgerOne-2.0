// src/app/api/_metrics/route.ts
import { NextResponse } from "next/server";
// Relative import to avoid alias issues
import { snapshot } from "../../../server/obs";

export const revalidate = 0;

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN || "";
  const u = new URL(req.url);
  const provided =
    u.searchParams.get("token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (token && provided !== token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, metrics: snapshot() });
}
