// src/app/api/snapshot/route.ts
// Snapshot for pages (dashboard/portfolio).
// Returns: prices (core) + ranks/market_cap with COMPLETE coverage for requested ids.
//
// Robustness features:
//  - Id normalization (ticker -> provider id) and we return rows keyed to the ORIGINAL ids
//  - 429/5xx aware retries with backoff
//  - "Top list" fetch + per-id backfill
//  - Secondary provider fallback (CoinPaprika) for rank/market_cap
//  - In-memory "top list" cache (10m) to smooth provider hiccups
//  - NEW: Per-id Last-Known-Good (LKG) store (24h TTL) used BEFORE/AFTER provider calls so
//         even a cold page load gets non-null ranks if we've seen them once this process
//  - Static safety net for a handful of core ids
//
// New API mandate respected: only uses the new price core + public provider(s). No legacy routes.

import { NextResponse } from "next/server";
import { getConsensusPrices } from "../../../server/services/priceService";

export const revalidate = 0;

type RankRow = { id: string; rank: number | null; market_cap: number | null };

// ---------------- In-memory caches ----------------

// (A) "Top list" cache (by provider id), smooths bursty calls
type TopCache = { topByProviderId: Map<string, RankRow>; fetchedAt: number };
let TOP_CACHE: TopCache | null = null;
const TOP_CACHE_TTL_MS = 10 * 60 * 1000; // 10m

function topCacheGet(): TopCache | null {
  if (!TOP_CACHE) return null;
  if (Date.now() - TOP_CACHE.fetchedAt > TOP_CACHE_TTL_MS) return null;
  return TOP_CACHE;
}
function topCacheSet(rows: RankRow[]) {
  TOP_CACHE = { topByProviderId: new Map(rows.map(r => [r.id, r])), fetchedAt: Date.now() };
}

// (B) Per-id Last-Known-Good (provider id keyed). This is the key to never-null.
type LkgItem = { row: RankRow; savedAt: number };
const LKG: Map<string, LkgItem> = new Map();
const LKG_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function lkgGet(providerId: string): RankRow | null {
  const v = LKG.get(providerId);
  if (!v) return null;
  if (Date.now() - v.savedAt > LKG_TTL_MS) return null;
  return v.row;
}
function lkgSet(providerId: string, row: RankRow) {
  if (row.rank == null && row.market_cap == null) return; // don't store empties
  LKG.set(providerId, { row, savedAt: Date.now() });
}

// ---------------- Snapshot response cache ----------------
// Dev: response-level cache keyed by (currency + sorted ids).
// Plain English: if we just answered this exact snapshot request, reuse it
// for a short window instead of redoing all provider work.
type SnapshotCacheEntry = {
  payload: any;
  expiresAt: number;
};

const SNAPSHOT_CACHE = new Map<string, SnapshotCacheEntry>();
const SNAPSHOT_CACHE_TTL_MS = 60_000; // 60s

// ---------------- Id normalization ----------------
const ID_ALIASES: Record<string, string> = {

  btc: "bitcoin",
  eth: "ethereum",
  trx: "tron",
  bnb: "binancecoin",
  xrp: "ripple",
  sol: "solana",
  ada: "cardano",
  dot: "polkadot",
  link: "chainlink",
  atom: "cosmos",
  matic: "polygon-pos", // current CG id; older: matic-network
  doge: "dogecoin",
  avax: "avalanche-2",
  near: "near",
  sui: "sui",
  ton: "toncoin",
  op: "optimism",
  arb: "arbitrum",
  apt: "aptos",
  ltc: "litecoin",
  dai: "dai",
  usdc: "usd-coin",
  usdt: "tether",
};
function toProviderId(id: string): string {
  const k = id.toLowerCase();
  return ID_ALIASES[k] || k;
}

// ---------------- HTTP helpers ----------------
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/json",
          "user-agent": "LedgerOne/1.0 (+app)",
        },
      });
      if (!r.ok && (r.status === 429 || r.status >= 500)) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r;
    } catch (e) {
      lastErr = e;
      const base = 300 * Math.pow(2, i);
      const jitter = Math.floor(Math.random() * 150);
      await sleep(base + jitter);
    }
  }
  throw lastErr;
}

// ---------------- Provider A: CoinGecko ----------------
async function cgFetchTop(limit = 250): Promise<RankRow[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${encodeURIComponent(String(limit))}&page=1&sparkline=false`;
  try {
    const res = await fetchWithRetry(url, 3);
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    return (data ?? []).map(d => ({
      id: String(d?.id ?? ""),
      rank: typeof d?.market_cap_rank === "number" ? d.market_cap_rank : null,
      market_cap: typeof d?.market_cap === "number" ? d.market_cap : null,
    }));
  } catch {
    return [];
  }
}
async function cgFetchIds(providerIds: string[]): Promise<RankRow[]> {
  if (!providerIds.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < providerIds.length; i += 75) chunks.push(providerIds.slice(i, i + 75));
  const out: RankRow[] = [];
  for (const chunk of chunks) {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(chunk.join(","))}&order=market_cap_desc&per_page=${chunk.length}&page=1&sparkline=false`;
    try {
      const res = await fetchWithRetry(url, 2);
      if (!res.ok) continue;
      const data = (await res.json()) as any[];
      for (const d of data ?? []) {
        out.push({
          id: String(d?.id ?? ""),
          rank: typeof d?.market_cap_rank === "number" ? d.market_cap_rank : null,
          market_cap: typeof d?.market_cap === "number" ? d.market_cap : null,
        });
      }
    } catch { /* continue */ }
  }
  return out;
}

// ---------------- Provider B: CoinPaprika (fallback) ----------------
async function paprikaFetchTop(limit = 500): Promise<RankRow[]> {
  const url = `https://api.coinpaprika.com/v1/tickers?limit=${encodeURIComponent(String(limit))}`;
  try {
    const res = await fetchWithRetry(url, 2);
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    return (data ?? []).map(d => {
      const pid: string = String(d?.id ?? ""); // "trx-tron"
      const guess = pid.includes("-") ? pid.split("-").slice(1).join("-") : pid;
      const mkcap = d?.quotes?.USD?.market_cap;
      const rank = typeof d?.rank === "number" ? d.rank : null;
      return { id: guess, rank, market_cap: typeof mkcap === "number" ? mkcap : null };
    });
  } catch {
    return [];
  }
}
async function paprikaFetchIds(providerIds: string[]): Promise<RankRow[]> {
  const top = await paprikaFetchTop(500);
  const set = new Set(providerIds);
  return top.filter(r => set.has(r.id));
}

// ---------------- Static safety net for core coins ----------------
const STATIC_CORE: Record<string, { rank: number; market_cap: number | null }> = {
  bitcoin: { rank: 1, market_cap: null },
  ethereum: { rank: 2, market_cap: null },
  tron: { rank: 15, market_cap: null }, // approximate; avoids null during total outage
};

// ---------------- Compose helpers ----------------
function toOrigRows(
  requestedIds: string[],
  providerIds: string[],
  lookup: (pid: string) => RankRow | null,
): RankRow[] {
  return requestedIds.map((origId, i) => {
    const pid = providerIds[i];
    const r = lookup(pid);
    if (r && (typeof r.rank === "number" || typeof r.market_cap === "number")) {
      return { id: origId, rank: r.rank ?? null, market_cap: r.market_cap ?? null };
    }
    const s = STATIC_CORE[pid];
    if (s) return { id: origId, rank: s.rank, market_cap: s.market_cap };
    return { id: origId, rank: null, market_cap: null };
  });
}

// ---------------- Handler ----------------
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);

    // Accept ?ids=csv or repeated ?id=
    const repeated = u.searchParams.getAll("id");
    const fromCsv = (u.searchParams.get("ids") || "bitcoin,ethereum,trx")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const requestedIds = (repeated.length ? repeated : fromCsv)
      .map(s => s.toLowerCase())
      .filter(Boolean);

    const currency = (u.searchParams.get("currency") || "USD").toUpperCase();

    // Snapshot-level cache key: currency + sorted ids.
    const sortedKeyIds = [...requestedIds].sort();
    const cacheKey = `${currency}:${sortedKeyIds.join(",") || "default"}`;
    const now = Date.now();
    const cached = SNAPSHOT_CACHE.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      const res = NextResponse.json(cached.payload, { status: 200 });
      res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      return res;
    }

    // 1) Prices (new data core)
    const { rows: priceRows, updatedAt } = await getConsensusPrices(requestedIds, currency);

    // 2) Ranks

    const providerIds = requestedIds.map(toProviderId);

    // (0) QUICK LKG PASS — if we already have LKG for all ids, we can return immediately
    const lkgAll: RankRow[] = [];
    let hasAllLkg = true;
    for (const pid of providerIds) {
      const row = lkgGet(pid);
      if (row) lkgAll.push({ ...row });
      else { hasAllLkg = false; break; }
    }
    if (hasAllLkg && requestedIds.length > 0) {
      const rows = toOrigRows(requestedIds, providerIds, pid => lkgGet(pid));
      const payload = { updatedAt, currency, prices: priceRows, rows };
      SNAPSHOT_CACHE.set(cacheKey, {
        payload,
        expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
      });
      const res = NextResponse.json(payload, { status: 200 });
      res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      return res;
    }


    // (1) Try top cache (CG), else fetch fresh top (CG), else fallback top (Paprika)
    let topByProviderId = topCacheGet()?.topByProviderId ?? null;
    if (!topByProviderId) {
      const cgTop = await cgFetchTop(250);
      if (cgTop.length) {
        topByProviderId = new Map(cgTop.map(r => [r.id, r]));
        topCacheSet(cgTop);
        // seed LKG with fresh top
        for (const r of cgTop) lkgSet(r.id, r);
      }
    }
    if (!topByProviderId) {
      const pkTop = await paprikaFetchTop(500);
      if (pkTop.length) {
        topByProviderId = new Map(pkTop.map(r => [r.id, r]));
        topCacheSet(pkTop);
        for (const r of pkTop) lkgSet(r.id, r);
      }
    }

    // (2) Determine missing provider ids relative to the top snapshot
    const missing: string[] = providerIds.filter(pid => !topByProviderId?.has(pid));

    // (3) Backfill missing via CG ids; then Paprika; store into LKG
    let backfillRows: RankRow[] = [];
    if (missing.length) {
      const cgRows = await cgFetchIds(missing);
      backfillRows.push(...cgRows);
      const stillMissing = new Set(missing.filter(pid => !cgRows.find(r => r.id === pid)));
      if (stillMissing.size) {
        const pkRows = await paprikaFetchIds(Array.from(stillMissing));
        backfillRows.push(...pkRows);
      }
      for (const r of backfillRows) lkgSet(r.id, r);
    }

    const backfillByProviderId = new Map(backfillRows.map(r => [r.id, r]));

    // (4) Compose a lookup that prefers fresh top/backfill, then LKG, then static
    const lookup = (pid: string): RankRow | null => {
      const t = topByProviderId?.get(pid);
      if (t && (typeof t.rank === "number" || typeof t.market_cap === "number")) return t;
      const b = backfillByProviderId.get(pid);
      if (b && (typeof b.rank === "number" || typeof b.market_cap === "number")) return b;
      const k = lkgGet(pid); // <- critical to avoid nulls on cold loads or transient outages
      if (k) return k;
      return null;
    };

      const rows =
      requestedIds.length > 0
        ? toOrigRows(requestedIds, providerIds, lookup)
        : Array.from(topByProviderId?.values() ?? []);

    const payload = { updatedAt, currency, prices: priceRows, rows };
    SNAPSHOT_CACHE.set(cacheKey, {
      payload,
      expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
    });

    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
    return res;

  } catch (err: any) {
    const res = NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        currency: "USD",
        prices: [],
        rows: [] as RankRow[],
        error: String(err?.message || err),
      },
      { status: 200 }
    );
    res.headers.set("Cache-Control", "public, s-maxage=2, stale-while-revalidate=15");
    return res;
  }
}
