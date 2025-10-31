// src/app/api/health/route.ts
import { NextResponse } from "next/server";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    node: process.version,
  });
}

