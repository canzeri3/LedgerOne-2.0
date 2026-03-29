export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { snapshot } from "../../../server/obs"; // relative (no @/)

export const revalidate = 0;

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN || "";
  // Fail closed: if METRICS_TOKEN is not configured, block all access.
  // An unset token means the env var was forgotten — open access would be worse.
  const u = new URL(req.url);
  const provided =
    u.searchParams.get("token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!token || provided !== token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, metrics: snapshot() });
}
