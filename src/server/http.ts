// src/server/http.ts
export type RetryOpts = {
  tries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  jitter?: boolean;
};

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(to);
  }
}

export async function fetchIdempotent(
  url: string,
  init: RequestInit = {},
  opts: RetryOpts = {}
): Promise<Response> {
  const {
    tries = 3,
    baseDelayMs = 250,
    timeoutMs = 4500,
    jitter = true,
  } = opts;

  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.ok) return res;

      if (res.status !== 429 && (res.status < 500 || res.status > 599)) {
        return res; // non-retryable
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }

    if (attempt < tries) {
      const factor = 2 ** (attempt - 1);
      const base = baseDelayMs * factor;
      const wait = jitter ? base + Math.floor(Math.random() * base) : base;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

