// src/server/lib/http.ts
// Robust JSON fetch with timeout, retry, exponential backoff + jitter.
// Always use this for provider calls to avoid UI stalls and random nulls.

export type RobustOptions = {
  timeoutMs?: number;       // per attempt
  attempts?: number;        // total attempts
  backoffBaseMs?: number;   // base backoff (exp)
  backoffJitterMs?: number; // random jitter added to backoff
};

export async function robustJsonFetch<T = any>(
  url: string,
  init: RequestInit = {},
  opts: RobustOptions = {}
): Promise<T> {
  const {
    timeoutMs = 1500,
    attempts = 3,
    backoffBaseMs = 150,
    backoffJitterMs = 120,
  } = opts;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      // providers sometimes return empty bodies; guard JSON parse
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    } catch (e) {
      lastErr = e;
      // exponential backoff + jitter
      const backoff = backoffBaseMs * 2 ** i + Math.random() * backoffJitterMs;
      await new Promise(r => setTimeout(r, backoff));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

