// src/server/services/priceService.ts
// Core batched price pipeline with resilient 24h fields.
// Strategy:
// 1) Get live prices from providers (Coingecko implemented).
// 2) ALSO read Coingecko's 24h percent change from /simple/price and derive price_24h.
// 3) If history is available, it can override/confirm the 24h reference later.
// 4) Apply trimmed-median consensus; serve "last good" on provider failure.

import { robustJsonFetch } from "@/server/lib/http";
import { cacheGet, cacheSet } from "@/server/ttlCache";
import { getMappings } from "@/server/db/coinRegistry";

// ---------- Types ----------
export type ConsensusRow = {
  id: string;                 // canonical coin id (e.g., "bitcoin")
  price: number | null;       // consensus last price in target currency
  price_24h: number | null;   // derived from provider 24h change OR history
  pct24h: number | null;      // percent change (price vs price_24h)
  source: string;             // "consensus" or "provider:*" if single source
  stale: boolean;             // true if served from "last-good" on failure
  quality: number;            // 0..1 (1 = perfect agreement)
};

export type ConsensusPayload = {
  rows: ConsensusRow[];
  updatedAt: string;          // ISO timestamp when computed
};

// Enrich provider rows with optional 24h info (from Coingecko simple/price)
type ProviderRow = {
  coin_id: string;
  price: number | null;
  provider: string;
  pct24hApprox?: number | null;     // from cg simple/price (e.g., +1.5)
  price24hApprox?: number | null;   // derived as price / (1 + pct/100)
};

// ---------- Helpers ----------
function trimmedMedian(values: number[]): { price: number | null; quality: number } {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { price: null, quality: 0 };
  const drop = Math.floor(v.length * 0.2); // drop top/bottom 20%
  const trimmed = v.slice(drop, v.length - drop || v.length);
  const mid = Math.floor(trimmed.length / 2);
  const price = trimmed.length % 2 ? trimmed[mid] : (trimmed[mid - 1] + trimmed[mid]) / 2;
  const spread = trimmed.length > 1 ? (trimmed[trimmed.length - 1] - trimmed[0]) / Math.max(price, 1e-9) : 0;
  const quality = Math.max(0, 1 - spread);
  return { price, quality };
}

function buildCacheKey(currency: string, ids: string[]) {
  return `price:live:${currency}:${ids.slice().sort().join(",")}`;
}

// Optional Coingecko API key headers to reduce 429s
function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro  = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro)  h["x-cg-pro-api-key"]  = pro;
  return h;
}

// Map requested canonical IDs to a provider's external IDs
async function mapForProvider(
  coinIds: string[],
  provider: "coingecko" | "binance" | "coinbase"
) {
  const maps = await getMappings();
  const lower = provider.toLowerCase();
  return coinIds.map((id) => {
    const m = maps.find((x) => x.coin_id === id && x.provider === lower);
    return { coin_id: id, external_id: m?.external_id ?? id };
  });
}

// ---------- Provider fetchers ----------

// Coingecko: /simple/price supports batching and returns 24h change
async function fetchCoingeckoBatch(
  list: { coin_id: string; external_id: string }[],
  currency: string
): Promise<ProviderRow[]> {
  if (!list.length) return [];
  const idsParam = list.map((i) => i.external_id).join(",");
  const base = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";
  const url = `${base}/simple/price?ids=${encodeURIComponent(
    idsParam
  )}&vs_currencies=${encodeURIComponent(currency.toLowerCase())}&include_24hr_change=true`;

  const data = await robustJsonFetch<any>(
    url,
    { headers: cgHeaders() },
    { timeoutMs: 2000, attempts: 3 }
  );

  // Build enriched rows
  const rows: ProviderRow[] = list.map((i) => {
    const row = data?.[i.external_id];
    const v = row?.[currency.toLowerCase()];
    const price = Number.isFinite(v) ? Number(v) : null;

    // cg sends e.g. "usd_24h_change": 1.23
    const pct = Number(row?.[`${currency.toLowerCase()}_24h_change`]);
    const pct24hApprox = Number.isFinite(pct) ? pct : null;
    const price24hApprox =
      Number.isFinite(pct) && Number.isFinite(price) ? price! / (1 + pct / 100) : null;

    return {
      coin_id: i.coin_id,
      price,
      provider: "coingecko",
      pct24hApprox,
      price24hApprox,
    };
  });

  return rows;
}

// Stubs for future expansion (kept to show shape; return nulls so consensus still works)
async function fetchBinanceBatch(
  list: { coin_id: string; external_id: string }[],
  _currency: string
): Promise<ProviderRow[]> {
  return list.map((i) => ({ coin_id: i.coin_id, price: null, provider: "binance" }));
}

async function fetchCoinbaseBatch(
  list: { coin_id: string; external_id: string }[],
  _currency: string
): Promise<ProviderRow[]> {
  return list.map((i) => ({ coin_id: i.coin_id, price: null, provider: "coinbase" }));
}

// ---------- Optional history helper (secondary; not required for 24h now) ----------
async function getPrice24hReferenceFromHistory(coinId: string, currency: string): Promise<number | null> {
  const make = async (interval: "minute" | "hourly") => {
    const base = process.env.INTERNAL_BASE_URL || "http://localhost:3000";
    const url = `${base}/api/price-history?id=${encodeURIComponent(
      coinId
    )}&currency=${encodeURIComponent(currency)}&days=1&interval=${interval}`;
    return robustJsonFetch<any>(url, {}, { timeoutMs: 1500, attempts: 2 });
  };
  try {
    let r = await make("minute");
    let pts: { t: number; p: number }[] = Array.isArray(r?.points) ? r.points : [];
    if (!pts.length) {
      r = await make("hourly");
      pts = Array.isArray(r?.points) ? r.points : [];
    }
    if (!pts.length) return null;
    const target = Date.now() - 24 * 60 * 60 * 1000;
    let best = pts[0], bestDiff = Math.abs(pts[0].t - target);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.abs(pts[i].t - target);
      if (d < bestDiff) { best = pts[i]; bestDiff = d; }
    }
    return Number.isFinite(best.p) ? best.p : null;
  } catch {
    return null;
  }
}

// ---------- Public entrypoint ----------
export async function getConsensusPrices(
  coinIdsInput: string[],
  currencyInput: string
): Promise<ConsensusPayload> {
  // Normalize inputs
  const ids = coinIdsInput.map((s) => (s || "").trim().toLowerCase()).filter(Boolean);
  const currency = (currencyInput || "USD").toUpperCase();
  const cacheKey = buildCacheKey(currency, ids);
  const lastGoodKey = `price:live:lastgood:${currency}:${ids.slice().sort().join(",")}`;

  // Fast path: short TTL cache
  const cached = await cacheGet<ConsensusPayload>(cacheKey);
  if (cached) return cached;

  try {
    // Map to providers
    const cgList = await mapForProvider(ids, "coingecko");
    const cbList = await mapForProvider(ids, "coinbase");
    const bnList = await mapForProvider(ids, "binance");

    // Fetch providers concurrently
    const [cg, cb, bn] = await Promise.all([
      fetchCoingeckoBatch(cgList, currency),
      fetchCoinbaseBatch(cbList, currency),
      fetchBinanceBatch(bnList, currency),
    ]);

    // Build value arrays for consensus + keep cg’s 24h approximations per id
    const byCoin = new Map<string, number[]>();
    const cg24hApprox = new Map<string, { pct?: number | null; p24?: number | null }>();

    for (const r of cg) {
      if (!byCoin.has(r.coin_id)) byCoin.set(r.coin_id, []);
      if (r.price != null) byCoin.get(r.coin_id)!.push(r.price);
      cg24hApprox.set(r.coin_id, { pct: r.pct24hApprox ?? null, p24: r.price24hApprox ?? null });
    }
    for (const r of [...cb, ...bn]) {
      if (!byCoin.has(r.coin_id)) byCoin.set(r.coin_id, []);
      if (r.price != null) byCoin.get(r.coin_id)!.push(r.price);
    }

    // Build rows
    const rows: ConsensusRow[] = [];
    for (const id of ids) {
      const vals = byCoin.get(id) ?? [];
      const { price, quality } = trimmedMedian(vals);

      // Primary 24h source: Coingecko simple/price approximation
      const approx = cg24hApprox.get(id) || { pct: null, p24: null };
      let price_24h: number | null = Number.isFinite(approx.p24 as number) ? (approx.p24 as number) : null;
      let pct24h: number | null =
        Number.isFinite(approx.pct as number) ? (approx.pct as number) : null;

      // If still missing and we have both prices, compute pct
      if (price != null && price_24h != null && !Number.isFinite(pct24h as number)) {
        pct24h = ((price - price_24h) / price_24h) * 100;
      }

      // Optional: if both approx are missing, try history once (non-blocking if history fails)
      if (price != null && price_24h == null) {
        const histP24 = await getPrice24hReferenceFromHistory(id, currency);
        if (Number.isFinite(histP24 as number)) {
          price_24h = histP24 as number;
          pct24h = ((price - price_24h) / price_24h) * 100;
        }
      }

      rows.push({
        id,
        price,
        price_24h,
        pct24h,
        source: "consensus",
        stale: price == null,
        quality,
      });
    }

    const payload: ConsensusPayload = { rows, updatedAt: new Date().toISOString() };

    // Cache hot + last-good
    await cacheSet(cacheKey, payload, 10);     // 10s hot cache
    await cacheSet(lastGoodKey, payload, 300); // 5m last-good

    return payload;
  } catch {
    // Provider failed — return last-good if available
    const lastGood = await cacheGet<ConsensusPayload>(lastGoodKey);
    if (lastGood) {
      const stalePayload: ConsensusPayload = {
        updatedAt: lastGood.updatedAt,
        rows: lastGood.rows.map((r) => ({ ...r, stale: true })),
      };
      await cacheSet(cacheKey, stalePayload, 5);
      return stalePayload;
    }
    // Nothing cached? Fail-soft
    return { rows: [], updatedAt: new Date().toISOString() };
  }
}
