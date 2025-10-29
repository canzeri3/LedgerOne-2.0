// src/server/cache/memoryCache.ts
export type SWRRow<T> = {
  data: T;
  expiresAt: number; // "fresh" until
  staleAt: number;   // allowed stale until (SWR window)
};

export class MemorySWR<T> {
  private store = new Map<string, SWRRow<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly softTtlMs = 10_000,
    private readonly hardTtlMs = 60_000
  ) {}

  getFresh(key: string): T | null {
    const row = this.store.get(key);
    if (!row) return null;
    return Date.now() < row.expiresAt ? row.data : null;
  }

  getAllowStale(key: string): { data: T; isStale: boolean } | null {
    const row = this.store.get(key);
    if (!row) return null;
    const now = Date.now();
    if (now < row.expiresAt) return { data: row.data, isStale: false };
    if (now < row.staleAt) return { data: row.data, isStale: true };
    return null;
  }

  set(key: string, data: T) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + this.softTtlMs,
      staleAt: Date.now() + this.hardTtlMs,
    });
  }

  dedupe(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.inflight.has(key)) return this.inflight.get(key)!;
    const p = fn()
      .then((res) => {
        this.set(key, res);
        return res;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}

