import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";

const CG_BASE = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro  = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro)  h["x-cg-pro-api-key"]  = pro;
  return h;
}

type Pt = { t: number; p: number };

async function robustJson(url: string, init: RequestInit, attempts = 2, timeoutMs = 2000): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
      clearTimeout(to);
      if (r.ok) return r.json();
      lastErr = new Error(`HTTP ${r.status} for ${url}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(res => setTimeout(res, 150 + Math.random() * 100));
  }
  throw lastErr;
}

// Try Coingecko market_chart (minute/hourly) for 1d
async function fetchCgMarketChart(id: string, currency: string, interval: "minute" | "hourly"): Promise<Pt[]> {
  // Coingecko "1" day with vs_currency
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(
    currency.toLowerCase()
  )}&days=1${interval === "hourly" ? "&interval=hourly" : ""}`;

  const data = await robustJson(url, { headers: cgHeaders() }, 2, 2000);
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const pts: Pt[] = [];
  for (const row of prices) {
    const t = Number(row?.[0]);
    const p = Number(row?.[1]);
    if (Number.isFinite(t) && Number.isFinite(p) && p > 0) pts.push({ t, p });
  }
  return pts;
}

// Simple synth of 2 points (24h ago ~ current), avoiding recursion
async function synthFromCore(canonicalId: string, currency: string): Promise<Pt[] | null> {
  try {
    const core = await getConsensusPrices([canonicalId], currency, { with24h: false }); // avoid recursion
    const row = core.rows?.[0];
    const now = Number(row?.price);
    if (!Number.isFinite(now) || now <= 0) return null;

    // best-effort 24h reference from existing pct24h if present
    const pct = Number(row?.pct24h);
    if (Number.isFinite(pct)) {
      const p24 = now / (1 + pct / 100);
      if (Number.isFinite(p24) && p24 > 0) {
        const tNow = Date.now();
        return [
          { t: tNow - 24 * 60 * 60 * 1000, p: p24 },
          { t: tNow, p: now },
        ];
      }
    }
    // if no pct24h, still return a flat line to keep charts stable
    const tNow = Date.now();
    return [
      { t: tNow - 24 * 60 * 60 * 1000, p: now },
      { t: tNow, p: now },
    ];
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const begin = Date.now();
  const { searchParams } = new URL(req.url);

  // canonical id (your internal id, e.g., bitcoin, ethereum, trx)
  const canonicalIdRaw = (searchParams.get("id") || "").trim().toLowerCase();
  const currency = (searchParams.get("currency") || "USD").toUpperCase();
  const interval = ((searchParams.get("interval") || "").toLowerCase() === "minute") ? "minute" : "hourly";
  const debug = searchParams.get("debug") === "1";

  const canonicalId = canonicalIdRaw;
  if (!canonicalId) {
    return NextResponse.json(
      { id: null, currency, points: [], updatedAt: new Date().toISOString(), error: "missing_id" },
      { status: 200 }
    );
  }

  const notes: string[] = [];
  let points: Pt[] = [];

  // 1) Try market_chart (preferred granularity), then hourly
  try {
    points = await fetchCgMarketChart(canonicalId, currency, interval);
    if (!points.length && interval !== "hourly") {
      notes.push("market_chart preferred failed");
      points = await fetchCgMarketChart(canonicalId, currency, "hourly");
    }
  } catch {
    notes.push(`market_chart ${interval} failed`);
  }

  // 2) If still nothing, synth from core (no recursion)
  if (!points.length) {
    notes.push("core.synth");
    const synth = await synthFromCore(canonicalId, currency);
    if (Array.isArray(synth) && synth.length >= 2) points = synth;
  }

  const body = {
    id: canonicalId,
    currency,
    points,
    updatedAt: new Date().toISOString(),
    ...(debug ? { debug: { dt: Date.now() - begin, notes } } : {}),
    ...(points.length ? {} : { error: "history_unavailable" }),
  };

  return NextResponse.json(body, { status: 200 });
}
