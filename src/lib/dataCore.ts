// src/lib/dataCore.ts
// Unified, typed access to the NEW data core for both server and client.
// - Server functions: getPrices, getHistory
// - React hooks: usePrices, usePrice, useHistory (SWR)
// All calls hit your new core endpoints (/api/prices, /api/price-history).
//
// Notes:
// • On the server we use INTERNAL_BASE_URL (env) to avoid hardcoding localhost.
// • On the client we use relative URLs (browser origin).
// • Hooks are safe for React 19 and SWR 2.x.

import useSWR, { SWRConfiguration } from "swr";

type SourceTag = "consensus";

export type PriceRow = {
  id: string;
  price: number | null;
  price_24h: number | null;
  pct24h: number | null;
  source: SourceTag;
  stale: boolean;
  quality?: number | null;
};

export type PricesPayload = {
  rows: PriceRow[];
  updatedAt: string; // ISO
};

export type HistoryPoint = { t: number; p: number };

export type HistoryPayload = {
  points: HistoryPoint[];
  id?: string;
  currency?: string;
  updatedAt?: string; // optional
};

// ------------ internal utils ------------

function isServer() {
  return typeof window === "undefined";
}

function baseUrl(): string {
  // Server: prefer INTERNAL_BASE_URL to support dev/CI/prod
  // Client: empty string → relative path
  if (isServer()) return process.env.INTERNAL_BASE_URL || "http://localhost:3000";
  return "";
}

async function jsonFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const msg = await safeText(r);
    throw new Error(`HTTP ${r.status} ${r.statusText}: ${msg}`);
  }
  return r.json() as Promise<T>;
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

/**
 * Decide a sensible default interval if the caller doesn't specify one.
 * - For long windows (days >= 20), default to 'daily' to ensure ~30–45 points.
 * - For short windows, default to 'hourly' (preserves existing short-range charts).
 */
type Interval = "minute" | "hourly" | "daily";
function chooseInterval(days: number, interval?: Interval): Interval {
  if (interval) return interval; // caller explicitly chose
  if (Number(days) >= 20) return "daily";
  return "hourly";
}

// ------------ Server/Client functions (can be used anywhere) ------------

/**
 * Fetch batched live prices for coin ids (new core).
 * Example: await getPrices(["bitcoin","ethereum","trx"])
 */
export async function getPrices(
  ids: string[],
  currency: string = "USD",
  init?: RequestInit
): Promise<PricesPayload> {
  const q = ids.map((s) => s.trim().toLowerCase()).filter(Boolean).join(",");
  const url = `${baseUrl()}/api/prices?ids=${encodeURIComponent(q)}&currency=${encodeURIComponent(
    currency.toUpperCase()
  )}`;
  // Avoid caching at the edge for live data:
  const opts: RequestInit = { cache: "no-store", ...init };
  return jsonFetch<PricesPayload>(url, opts);
}

/**
 * Fetch price history for a coin (new core).
 * @param id canonical coin id (e.g., "bitcoin", "ethereum", "trx")
 * @param days 1, 7, 30, 90, 365...
 * @param interval optional; if omitted we auto-pick based on days (see chooseInterval)
 */
export async function getHistory(
  id: string,
  days: number = 30,
  interval?: Interval,
  currency: string = "USD",
  init?: RequestInit
): Promise<HistoryPayload> {
  const cid = (id || "").toLowerCase();
  const chosen = chooseInterval(days, interval);
  const url = `${baseUrl()}/api/price-history?id=${encodeURIComponent(
    cid
  )}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(
    chosen
  )}&currency=${encodeURIComponent(currency.toUpperCase())}`;
  const opts: RequestInit = { cache: "no-store", ...init };
  return jsonFetch<HistoryPayload>(url, opts);
}

// ------------ React Hooks (SWR) ------------

const swrFetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

/**
 * Hook for batched prices. Stable key includes ids + currency.
 */
export function usePrices(
  ids: string[],
  currency: string = "USD",
  swr?: SWRConfiguration
) {
  const list = (ids || []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const key =
    list.length > 0
      ? [`/api/prices`, list.sort().join(","), currency.toUpperCase()]
      : null;

  const { data, error, isLoading, mutate } = useSWR<PricesPayload>(
    key,
    ([, joined, ccy]) => swrFetcher(`/api/prices?ids=${encodeURIComponent(joined)}&currency=${encodeURIComponent(ccy)}`),
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
      ...swr,
    }
  );

  return {
    rows: data?.rows ?? [],
    updatedAt: data?.updatedAt ?? null,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for single coin price derived from usePrices to avoid duplicate fetching.
 */
export function usePrice(
  id: string | null | undefined,
  currency: string = "USD",
  swr?: SWRConfiguration
) {
  const ids = id ? [id] : [];
  const p = usePrices(ids, currency, swr);
  const row = id
    ? p.rows.find((r) => r.id === (id || "").toLowerCase()) ?? null
    : null;
  return { row, ...p };
}

/**
 * Hook for history series of a coin (array of {t,p}).
 * If interval is omitted, we auto-pick based on days:
 *  - days >= 20 → 'daily' (ensures ~30–45 points for month+ windows)
 *  - else → 'hourly'
 */
export function useHistory(
  id: string | null | undefined,
  days: number = 30,
  interval?: Interval,
  currency: string = "USD",
  swr?: SWRConfiguration
) {
  const cid = (id || "").toLowerCase().trim();
  const chosen = chooseInterval(days, interval);

  const key =
    cid
      ? [
          `/api/price-history`,
          cid,
          String(days),
          chosen,
          currency.toUpperCase(),
        ]
      : null;

  const { data, error, isLoading, mutate } = useSWR<HistoryPayload>(
    key,
    ([, coin, d, iv, ccy]) =>
      swrFetcher(
        `/api/price-history?id=${encodeURIComponent(coin)}&days=${encodeURIComponent(
          d
        )}&interval=${encodeURIComponent(iv as string)}&currency=${encodeURIComponent(ccy)}`
      ),
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
      ...swr,
    }
  );

  return {
    points: data?.points ?? [],
    updatedAt: data?.updatedAt ?? null,
    isLoading,
    error,
    mutate,
  };
}
