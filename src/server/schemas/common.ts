// src/server/schemas/common.ts
import { z } from "zod";

/** Canonical coin id: lowercase slug (coingecko-style) */
export const CoinId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,40}$/, "invalid coin id");

/** CSV of coin ids -> string[] unique, max N */
export function parseIdsCsv(raw: string, max = 100): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (raw || "").split(",")) {
    const id = part.trim().toLowerCase();
    if (!id) continue;
    if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** Currency code: 2–6 uppercase letters (e.g., USD, USDT) */
export const Currency = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{2,6}$/.test(s), "invalid currency");

/** Interval used by dataCore: minute|hourly|daily */
export const Interval = z.enum(["minute", "hourly", "daily"]);

/** Safe integer clamp */
export const IntRange = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max);

/** Helpers for consistent error responses */
export function badRequest(message: string) {
  return {
    error: { code: "BAD_REQUEST", message },
    meta: { apiVersion: "v1" },
  };
}

