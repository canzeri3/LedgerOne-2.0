export type Trade = {
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee?: number | null
  trade_time: string
}

export type PnlResult = {
  positionQty: number
  avgCost: number
  realizedPnl: number
  totalFees: number
  costBasis: number
}

export function computePnl(trades: Trade[]): PnlResult {
  // Sort by time ASC to compute running averages correctly
  const list = [...trades].sort(
    (a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime()
  )

  let positionQty = 0
  let avgCost = 0
  let realizedPnl = 0
  let totalFees = 0

  for (const t of list) {
    const fee = Number(t.fee ?? 0)
    const qty = Number(t.quantity)
    const price = Number(t.price)

    if (t.side === 'buy') {
      const totalCost = price * qty + fee
      const newQty = positionQty + qty
      avgCost = newQty > 0 ? (avgCost * positionQty + totalCost) / newQty : 0
      positionQty = newQty
      totalFees += fee
    } else {
      // SELL
      // Realized P&L uses current avgCost
      realizedPnl += (price - avgCost) * qty - fee
      positionQty = positionQty - qty
      totalFees += fee
      if (positionQty <= 0) {
        // Reset avgCost if flat or short (we prevent short sells in the UI)
        avgCost = 0
      }
    }
  }

  const costBasis = positionQty > 0 ? avgCost * positionQty : 0

  return { positionQty, avgCost, realizedPnl, totalFees, costBasis }
}

