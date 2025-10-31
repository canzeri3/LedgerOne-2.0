// src/server/redis.ts
// Safe Redis singleton. If REDIS_URL is missing or connection fails, we expose a no-op
// in-memory fallback so nothing breaks during development or partial setups.

type Redisish = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { EX?: number }) => Promise<void>;
};

let cached: { client: Redisish | null } = (globalThis as any).__lg1_redis__ ?? { client: null };

async function createRealRedis(): Promise<Redisish> {
  // Lazy require to avoid bundling issues on edge
  const { createClient } = require("redis");
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not set");

  const client = createClient({ url });
  // Surface errors once, but don't crash the app
  client.on("error", (err: any) => console.error("[redis] error:", err?.message ?? err));
  await client.connect();

  return {
    async get(key) {
      return client.get(key);
    },
    async set(key, value, opts) {
      if (opts?.EX) {
        await client.set(key, value, { EX: opts.EX });
      } else {
        await client.set(key, value);
      }
    },
  };
}

function createMemoryFallback(): Redisish {
  const store = new Map<string, { v: string; exp?: number }>();
  return {
    async get(key) {
      const item = store.get(key);
      if (!item) return null;
      if (item.exp && Date.now() > item.exp) {
        store.delete(key);
        return null;
      }
      return item.v;
    },
    async set(key, value, opts) {
      const ttl = opts?.EX ? opts.EX * 1000 : undefined;
      store.set(key, { v: value, exp: ttl ? Date.now() + ttl : undefined });
    },
  };
}

export async function getRedis(): Promise<Redisish> {
  if (cached.client) return cached.client;
  try {
    const real = await createRealRedis();
    cached.client = real;
  } catch {
    // Fallback is intentional for dev/migration
    console.warn("[redis] using in-memory fallback (no REDIS_URL or connection issue)");
    cached.client = createMemoryFallback();
  }
  (globalThis as any).__lg1_redis__ = cached;
  return cached.client!;
}

