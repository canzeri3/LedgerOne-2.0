const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ID = 'near'
const DAYS = 730
const INTERVAL = 'daily'
const CURRENCY = 'USD'

function fmtDate(t) {
  return new Date(t).toISOString().slice(0, 10)
}

function pickLow(point) {
  return Number(point?.l ?? point?.low ?? point?.p ?? NaN)
}

function pickHigh(point) {
  return Number(point?.h ?? point?.high ?? point?.p ?? NaN)
}

function round(n, digits = 8) {
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null
}

async function main() {
  const url =
    `${BASE}/api/price-history?id=${encodeURIComponent(ID)}` +
    `&days=${DAYS}&interval=${INTERVAL}&currency=${CURRENCY}&debug=1`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`History request failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const rawPoints = Array.isArray(data?.points) ? data.points : []

  const points = rawPoints
    .map((p) => ({
      t: Number(p.t),
      low: pickLow(p),
      high: pickHigh(p),
    }))
    .filter(
      (p) =>
        Number.isFinite(p.t) &&
        Number.isFinite(p.low) &&
        p.low > 0 &&
        Number.isFinite(p.high) &&
        p.high > 0
    )

  const rows = []

  for (let i = 1; i < points.length - 1; i++) {
    const prevLow = points[i - 1].low
    const currLow = points[i].low
    const nextLow = points[i + 1].low

    const isLocalLow = currLow <= prevLow && currLow < nextLow
    if (!isLocalLow) continue

    let highestForwardHigh = -Infinity
    let highestForwardHighIndex = -1

    for (let j = i + 1; j < points.length; j++) {
      const h = points[j].high
      if (h > highestForwardHigh) {
        highestForwardHigh = h
        highestForwardHighIndex = j
      }
    }

    const multiplier =
      highestForwardHighIndex >= 0 && currLow > 0
        ? highestForwardHigh / currLow
        : null

    rows.push({
      localLowDate: fmtDate(points[i].t),
      localLow: round(currLow, 8),

      highDateForThatLow:
        highestForwardHighIndex >= 0
          ? fmtDate(points[highestForwardHighIndex].t)
          : null,
      highForThatLow:
        highestForwardHighIndex >= 0
          ? round(highestForwardHigh, 8)
          : null,

      multiplier: multiplier == null ? null : round(multiplier, 6),
      multiplierLabel:
        multiplier == null
          ? null
          : `${round(currLow, 8)} -> ${round(highestForwardHigh, 8)} = ${round(multiplier, 6)}x`,
    })
  }

  console.log('\n=== LOCAL LOW -> HIGH -> MULTIPLIER ===')
  console.table(rows)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
