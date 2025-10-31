// src/server/services/priceService.ts
// Core batched price pipeline with robust provider fallbacks and optional 24h reference.
// - Maps canonical IDs -> provider external IDs (e.g., trx -> tron)
// - Fetches from providers (Coingecko implemented; others stubbed)
// - Applies trimmed-median consensus
// - Writes BOTH batch and per-ID hot/last-good cache entries
// - opts.with24h (default true) controls whether to compute price_24h/pct24h (avoid recursion)
//
// NOTE: Keep this file ESM-only.
// If anything tries to `require()` it, switch that import to ESM.
// The `export {}` below forces module mode for SWC/TS.

export {}; // ensure ESM module

import { robustJsonFetch } from "@/server/lib/http";
import { cacheGet, cacheSet } from "@/server/ttlCache";
import { getMappings } from "@/server/db/coinRegistry";
import { count, recordError } from "@/server/obs";

// ---------- Types ----------

export type ConsensusRow = {
  id: string;
  price: number | null;
  price_24h: number | null;
  pct24h: number | null;      // percent
  source: "consensus";
  stale: boolean;
  quality: number;            // 0..1
};

export type ConsensusPayload = {
  rows: ConsensusRow[];
  updatedAt: string;
};

type ProviderRow = { coin_id: string; price: number | null; provider: string };

// ---------- Config / headers ----------

const CG_BASE = process.env.PROVIDER_CG_BASE ?? "https://api.coingecko.com/api/v3";

function cgHeaders(): Record<string, string> {
  const demo = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const pro  = process.env.CG_PRO_API_KEY || process.env.X_CG_PRO_API_KEY;
  const h: Record<string, string> = {};
  if (demo) h["x-cg-demo-api-key"] = demo;
  if (pro)  h["x-cg-pro-api-key"]  = pro;
  return h;
}

// ---------- Helpers ----------

function trimmedMedian(values: number[]): { price: number | null; quality: number } {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { price: null, quality: 0 };
  const drop = Math.floor(v.length * 0.2); // drop top/bottom 20%
  const trimmed = v.slice(drop, v.length - drop || v.length);
  const mid = Math.floor(trimmed.length / 2);
  const price = trimmed.length % 2 ? trimmed[mid] : (trimmed[mid - 1] + trimmed[mid]) / 2;
  const spread = trimmed.length > 1 ? (trimmed[trimmed.length - 1] - trimmed[0]) / Math.max(price, 1e-9) : 0;
  const quality = Math.max(0, 1 - spread); // crude 0..1 (1=perfect agreement)
  return { price, quality };
}

async function mapForProvider(
  coinIds: string[],
  provider: "coingecko" | "binance" | "coinbase"
) {
  const maps = await getMappings();
  const lower = provider.toLowerCase();
  return coinIds.map((id) => {
    const m = maps.find((x) => x.coin_id === id && x.provider === lower);
    return { coin_id: id, external_id: (m?.external_id ?? id).toLowerCase() };
  });
}

// Map a canonical id to Coingecko external id (e.g., trx -> tron) for simple/price fallbacks
async function toCgId(canonicalId: string): Promise<string> {
  const maps = await getMappings();
  const m = maps.find((x) => x.coin_id === canonicalId && x.provider === "coingecko");
  const ext = (m?.external_id ?? canonicalId).toLowerCase();
  return ext === "trx" ? "tron" : ext;
}

// --- 24h computation feature flags ---
function envTrue(v: string | undefined | null) {
  const s = (v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
function envFalse(v: string | undefined | null) {
  const s = (v || "").trim().toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "off";
}
/** Returns whether we should compute 24h deltas for a given coin id. */
function is24hEnabledFor(id: string, optsWith24h: boolean): boolean {
  if (!optsWith24h) return false;                       // opt-out from caller (e.g., history route)
  if (envTrue(process.env.DISABLE_24H)) return false;   // global disable
  if (envFalse(process.env.ENABLE_24H)) return false;   // alternative global disable var
  const deny = (process.env.DISABLE_24H_COINS || "")
    .toLowerCase()
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (deny.includes(id.toLowerCase())) return false;
  const allowRaw = (process.env.ENABLE_24H_COINS || "").trim();
  if (allowRaw) {
    const allow = allowRaw.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
    return allow.includes(id.toLowerCase());
  }
  return true;
}

// ---------- Providers ----------

// Coingecko: robust batch with per-id fallbacks if batch result is unusable
async function fetchCoingeckoBatch(
  list: { coin_id: string; external_id: string }[],
  currency: string
): Promise<ProviderRow[]> {
  if (!list.length) return [];

  const headers = cgHeaders();
  const idsParam = list.map((i) => i.external_id).join(",");
  const batchUrl = `${CG_BASE}/simple/price?ids=${encodeURIComponent(
    idsParam
  )}&vs_currencies=${encodeURIComponent(currency.toLowerCase())}&include_24hr_change=true`;

  let data: any | null = null;
  try {
    data = await robustJsonFetch<any>(
      batchUrl,
      { headers },
      { timeoutMs: 1500, attempts: 2, backoffBaseMs: 150, backoffJitterMs: 120 }
    );
  } catch {
    // swallow; fall back per-id
  }

  const fromBatch: ProviderRow[] = list.map((i) => {
    const row = data?.[i.external_id];
    const v = row?.[currency.toLowerCase()];
    const price = Number.isFinite(v) ? Number(v) : null;
    return { coin_id: i.coin_id, price, provider: "coingecko" };
  });

  if (fromBatch.some((r) => r.price != null)) {
    count("provider.cg.simple_price.success", 1);
    return fromBatch;
  }

  // Fallback: per-id calls (handles odd throttling/shape issues)
  const out: ProviderRow[] = [];
  for (const i of list) {
    try {
      const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(
        i.external_id
      )}&vs_currencies=${encodeURIComponent(currency.toLowerCase())}&include_24hr_change=true`;

      const single = await robustJsonFetch<any>(
        url,
        { headers },
        { timeoutMs: 1200, attempts: 2, backoffBaseMs: 120, backoffJitterMs: 100 }
      );

      const row = single?.[i.external_id];
      const v = row?.[currency.toLowerCase()];
      const price = Number.isFinite(v) ? Number(v) : null;
      out.push({ coin_id: i.coin_id, price, provider: "coingecko" });
    } catch {
      out.push({ coin_id: i.coin_id, price: null, provider: "coingecko" });
    }
  }
  return out;
}

async function fetchBinanceBatch(
  list: { coin_id: string; external_id: string }[],
  _currency: string
): Promise<ProviderRow[]> {
  // Stubbed for future provider expansion
  return list.map((i) => ({ coin_id: i.coin_id, price: null, provider: "binance" }));
}

async function fetchCoinbaseBatch(
  list: { coin_id: string; external_id: string }[],
  _currency: string
): Promise<ProviderRow[]> {
  // Stubbed for future provider expansion
  return list.map((i) => ({ coin_id: i.coin_id, price: null, provider: "coinbase" }));
}

// ---------- 24h reference (uses our history route first; simple/price synth fallback) ----------

async function getPrice24hReference(coinId: string, currency: string): Promise<number | null> {
  const makeHist = async (interval: "minute" | "hourly") => {
    const url = `http://localhost:3000/api/price-history?id=${encodeURIComponent(
      coinId
    )}&currency=${encodeURIComponent(currency)}&days=1&interval=${interval}`;
    return robustJsonFetch<any>(url, {}, { timeoutMs: 1500, attempts: 2 });
  };

  try {
    // 1) Try price-history minute
    let r = await makeHist("minute");
    let pts: { t: number; p: number }[] = Array.isArray(r?.points) ? r.points : [];
    if (!pts.length) {
      // 2) Try price-history hourly
      r = await makeHist("hourly");
      pts = Array.isArray(r?.points) ? r.points : [];
    }
    if (pts.length) {
      const target = Date.now() - 24 * 60 * 60 * 1000;
      let best = pts[0], bestDiff = Math.abs(pts[0].t - target);
      for (let i = 1; i < pts.length; i++) {
        const d = Math.abs(pts[i].t - target);
        if (d < bestDiff) { best = pts[i]; bestDiff = d; }
      }
      return Number.isFinite(best.p) ? best.p : null;
    }
  } catch {
    // fall through to simple/price synth
  }

  // 3) Final fallback: Coingecko simple/price synth (no recursion)
  try {
    const cgId = await toCgId(coinId); // e.g., trx -> tron
    const headers = cgHeaders();
    const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(
      cgId
    )}&vs_currencies=${encodeURIComponent(currency.toLowerCase())}&include_24hr_change=true`;

    const data = await robustJsonFetch<any>(
      url,
      { headers },
      { timeoutMs: 1500, attempts: 2, backoffBaseMs: 150, backoffJitterMs: 120 }
    );

    const row = data?.[cgId];
    const now = Number(row?.[currency.toLowerCase()]);
    const pct = Number(row?.[`${currency.toLowerCase()}_24h_change`]); // percent

    if (!Number.isFinite(now) || now <= 0) return null;
    if (Number.isFinite(pct)) {
      const p24 = now / (1 + pct / 100);
      return Number.isFinite(p24) && p24 > 0 ? p24 : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- Public entrypoint ----------

type ConsensusOpts = { with24h?: boolean };

export async function getConsensusPrices(
  coinIdsInput: string[],
  currencyInput: string,
  opts: ConsensusOpts = {}
): Promise<ConsensusPayload> {
  const with24h = opts.with24h !== false; // default true

  const ids = coinIdsInput.map((s) => (s || "").trim().toLowerCase()).filter(Boolean);
  const currency = (currencyInput || "USD").toUpperCase();

  const batchKey = `price:live:${currency}:${ids.slice().sort().join(",")}`;
  const batchLastGoodKey = `price:live:lastgood:${currency}:${ids.slice().sort().join(",")}`;

  // Fast path: short TTL cache
  const cached = await cacheGet<ConsensusPayload>(batchKey);
  if (cached) return cached;

  try {
    // Prepare provider mappings
    const cgList = await mapForProvider(ids, "coingecko");
    const cbList = await mapForProvider(ids, "coinbase");
    const bnList = await mapForProvider(ids, "binance");

    // Fetch providers concurrently (Coingecko implemented, others stubs)
    const [cg, cb, bn] = await Promise.all([
      fetchCoingeckoBatch(cgList, currency),
      fetchCoinbaseBatch(cbList, currency),
      fetchBinanceBatch(bnList, currency),
    ]);

    // Group by coin_id
    const byCoin = new Map<string, number[]>();
    for (const r of [...cg, ...cb, ...bn]) {
      if (!byCoin.has(r.coin_id)) byCoin.set(r.coin_id, []);
      if (r.price != null) byCoin.get(r.coin_id)!.push(r.price);
    }

    // Build rows
    const rows: ConsensusRow[] = [];
    for (const id of ids) {
      const vals = byCoin.get(id) ?? [];
      const { price, quality } = trimmedMedian(vals);

      let price_24h: number | null = null;
      let pct24h: number | null = null;

      const want24h = is24hEnabledFor(id, with24h);
      if (want24h && price != null) {
        try {
          price_24h = await getPrice24hReference(id, currency);
          if (price_24h != null && price_24h > 0) {
            pct24h = ((price - price_24h) / price_24h) * 100;
          }
        } catch {
          price_24h = null;
          pct24h = null;
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

    // If *every* coin came back null, try last-good batch before returning empties
    const anyLive = rows.some(r => r.price != null);
    if (!anyLive) {
      const lastGood = await cacheGet<ConsensusPayload>(batchLastGoodKey);
      if (lastGood?.rows?.length) {
        const stalePayload: ConsensusPayload = {
          updatedAt: lastGood.updatedAt,
          rows: lastGood.rows.map(r => ({ ...r, stale: true })),
        };

        await cacheSet(batchKey, stalePayload, 5);

        // mirror per-id stale rows
        await Promise.all(
          stalePayload.rows.map((r) => {
            const perIdLkgKey = `price:live:lastgood:${currency}:${r.id}`;
            const perIdHotKey = `price:live:${currency}:${r.id}`;
            const perIdPayload: ConsensusPayload = { rows: [r], updatedAt: stalePayload.updatedAt };
            return Promise.all([
              cacheSet(perIdLkgKey, perIdPayload, 300),
              cacheSet(perIdHotKey, perIdPayload, 5),
            ]);
          })
        );

        return stalePayload;
      }
    }

    const payload: ConsensusPayload = { rows, updatedAt: new Date().toISOString() };

    // Store short TTL and a longer "last-good" for resilience
    await cacheSet(batchKey, payload, 10);       // hot cache
    await cacheSet(batchLastGoodKey, payload, 300);   // 5 min last-good

    // Per-ID mirrors (hot + last-good) to support internal synth
    await Promise.all(
      rows.map((r) => {
        const perIdLkgKey = `price:live:lastgood:${currency}:${r.id}`;
        const perIdHotKey = `price:live:${currency}:${r.id}`;
        const perIdPayload: ConsensusPayload = { rows: [r], updatedAt: payload.updatedAt };
        return Promise.all([
          cacheSet(perIdLkgKey, perIdPayload, 300),
          cacheSet(perIdHotKey, perIdPayload, 10),
        ]);
      })
    );

    count("consensus.success", 1);
    return payload;
  } catch (err: any) {
    recordError(`getConsensusPrices error: ${String(err?.message || err)}`);

    const lastGood = await cacheGet<ConsensusPayload>(batchLastGoodKey);
    if (lastGood) {
      const stalePayload: ConsensusPayload = {
        updatedAt: lastGood.updatedAt,
        rows: (lastGood.rows || []).map((r) => ({ ...r, stale: true })),
      };
      await cacheSet(batchKey, stalePayload, 5);

      // Mirror per-ID stale rows
      await Promise.all(
        stalePayload.rows.map((r) => {
          const perIdLkgKey = `price:live:lastgood:${currency}:${r.id}`;
          const perIdHotKey = `price:live:${currency}:${r.id}`;
          const perIdPayload: ConsensusPayload = { rows: [r], updatedAt: stalePayload.updatedAt };
          return Promise.all([
            cacheSet(perIdLkgKey, perIdPayload, 300),
            cacheSet(perIdHotKey, perIdPayload, 5),
          ]);
        })
      );

      return stalePayload;
    }

    return { rows: [], updatedAt: new Date().toISOString() };
  }
}
