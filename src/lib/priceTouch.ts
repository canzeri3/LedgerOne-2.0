export function isLevelTouched(
  side: 'buy' | 'sell',
  levelPrice: number,
  lastPrice: number | null,
  currentPrice: number | null
) {
  if (!Number.isFinite(levelPrice) || currentPrice == null) return false

  // Keep lit in a tiny proximity band so it doesn't flicker off
  const bandPct = 0.001; // 0.10%
  const bandAbs = 0.05;  // $0.05
  const near =
    Math.abs(currentPrice - levelPrice) / Math.max(1, levelPrice) <= bandPct ||
    Math.abs(currentPrice - levelPrice) <= bandAbs

  // Detect a crossing between ticks (robust to missing exact equality)
  let crossed = false
  if (lastPrice != null) {
    crossed =
      side === 'buy'
        ? (lastPrice > levelPrice && currentPrice <= levelPrice)
        : (lastPrice < levelPrice && currentPrice >= levelPrice)
  }

  return near || crossed
}

