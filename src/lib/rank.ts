// src/lib/rank.ts

export type CoinMeta = {
  id: string;                  // "bitcoin", "eth", "trx", etc.
  symbol?: string | null;
  name?: string | null;

  // Prefer any provider rank if available (CMC, CG, etc.)
  cmc_rank?: number | null;
  cg_rank?: number | null;
  marketCapRank?: number | null;

  // Fallback inputs (used to compute an internal rank)
  marketCap?: number | null;   // in quote currency (e.g., USD)
};

/**
 * Decide a single “best available” external rank per coin.
 * If none is present, returns null (we’ll compute a fallback later).
 */
export function bestExternalRank(c: CoinMeta): number | null {
  const candidates = [
    c.marketCapRank ?? null,
    c.cmc_rank ?? null,
    c.cg_rank ?? null,
  ].filter((x): x is number => Number.isFinite(x as number) && (x as number)! > 0);

  if (candidates.length === 0) return null;
  return Math.min(...candidates); // use the best (lowest) rank we have
}

/**
 * Compute a complete ranking with no gaps.
 * 1) Use external ranks when present.
 * 2) For the rest, assign ranks *after* the current max external rank,
 *    sorted by (marketCap desc, id asc) so it’s deterministic.
 */
export function computeCompleteRanks(coins: CoinMeta[]): Map<string, number> {
  const out = new Map<string, number>();

  // Step 1: collect external ranks
  const withExt: { id: string; rank: number }[] = [];
  const noExt: CoinMeta[] = [];

  for (const c of coins) {
    const r = bestExternalRank(c);
    if (r != null) {
      withExt.push({ id: c.id, rank: r });
    } else {
      noExt.push(c);
    }
  }

  // Normalize external ranks (dedupe collisions deterministically)
  withExt.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  // Fill map; keep track of used ranks
  let used = new Set<number>();
  let maxExt = 0;
  for (const { id, rank } of withExt) {
    let r = rank;
    // If two providers give same rank to different coins, make it strictly increasing
    while (used.has(r)) r++;
    out.set(id, r);
    used.add(r);
    if (r > maxExt) maxExt = r;
  }

  // Step 2: assign fallback ranks for coins without external ranks
  // Order: marketCap desc (bigger is “earlier”), then id asc
  noExt.sort((a, b) => {
    const ma = a.marketCap ?? -1;
    const mb = b.marketCap ?? -1;
    if (mb !== ma) return mb - ma;
    return (a.id || "").localeCompare(b.id || "");
  });

  let next = Math.max(maxExt, 0) + 1;
  for (const c of noExt) {
    if (out.has(c.id)) continue;
    while (used.has(next)) next++;
    out.set(c.id, next);
    used.add(next);
    next++;
  }

  return out;
}

/** Map a numeric rank to your requested tier buckets. */
export function rankToTier(rank: number): "BlueChip" | "Large Cap" | "Medium Cap" | "Small Cap" | "Micro/Long Tail" {
  if (rank >= 1 && rank <= 2) return "BlueChip";
  if (rank >= 3 && rank <= 10) return "Large Cap";
  if (rank >= 11 && rank <= 20) return "Medium Cap";
  if (rank >= 21 && rank <= 50) return "Small Cap";
  return "Micro/Long Tail";
}

/** Optional: tiny helper for badge styling decisions. */
export function tierBadgeClass(tier: ReturnType<typeof rankToTier>): string {
  switch (tier) {
    case "BlueChip":       return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "Large Cap":      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "Medium Cap":     return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
    case "Small Cap":      return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "Micro/Long Tail":return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  }
}
