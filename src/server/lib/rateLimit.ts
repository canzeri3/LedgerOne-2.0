// src/server/lib/rateLimit.ts
//
// Simple per-key rate limiter backed by the existing Redis/ttlCache infrastructure.
//
// Design:
//   - Each key tracks a hit counter with a fixed TTL window.
//   - The window starts from the FIRST hit and does not roll (sliding window
//     would require a sorted set; this is sufficient for auth endpoints).
//   - Fails OPEN if Redis is unavailable: a caching outage should not lock out
//     all users. Rate limiting is defense-in-depth, not a hard barrier.
//
// Usage:
//   const result = await checkRateLimit('rl:forgot:ip:1.2.3.4', 5, 15 * 60)
//   if (result.limited) return 429

import { cacheGet, cacheSet } from '@/server/ttlCache'

export interface RateLimitResult {
  /** true if the caller has exceeded the allowed attempts */
  limited: boolean
  /** how many attempts remain in this window */
  remaining: number
  /** window size in seconds (for Retry-After header) */
  resetInSec: number
}

/**
 * Check and increment a rate-limit counter for the given key.
 *
 * @param key        Unique key, e.g. `rl:forgot:ip:1.2.3.4`
 * @param max        Maximum allowed hits within the window
 * @param windowSec  Window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  try {
    const current = (await cacheGet<number>(key)) ?? 0

    if (current >= max) {
      return { limited: true, remaining: 0, resetInSec: windowSec }
    }

    // Increment. cacheSet only sets TTL on first write if key didn't exist;
    // subsequent increments refresh the TTL, giving each request a fresh
    // window — acceptable for auth where we want to punish bursts.
    await cacheSet<number>(key, current + 1, windowSec)

    return { limited: false, remaining: max - current - 1, resetInSec: windowSec }
  } catch {
    // Fail open: Redis down → allow request. Never block users on cache failure.
    return { limited: false, remaining: max, resetInSec: windowSec }
  }
}

/**
 * Extract the best-effort client IP from a Next.js Request.
 * Vercel sets x-forwarded-for; fall back to x-real-ip, then 'unknown'.
 */
export function getClientIp(req: Request): string {
  const fwd = (req as any).headers?.get?.('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = (req as any).headers?.get?.('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
