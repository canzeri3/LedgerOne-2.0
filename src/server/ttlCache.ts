// src/server/ttlCache.ts
// Simple TTL JSON cache wrapper around Redis (with safe fallback).
// Use cacheWrap() for "get or compute then set" patterns.

import { getRedis } from "./redis";

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const r = await (await getRedis()).get(key);
    return r ? (JSON.parse(r) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, val: T, ttlSeconds: number): Promise<void> {
  try {
    await (await getRedis()).set(key, JSON.stringify(val), { EX: ttlSeconds });
  } catch {
    // no-op on cache write failure
  }
}

/**
 * cacheWrap: get value from cache or compute and store it.
 * @param key unique cache key
 * @param ttlSeconds seconds to live
 * @param compute async function to compute value on miss
 */
export async function cacheWrap<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const val = await compute();
  await cacheSet(key, val, ttlSeconds);
  return val;
}

