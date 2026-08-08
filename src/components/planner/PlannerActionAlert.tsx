import { TriangleAlert } from 'lucide-react'

type PlannerActionAlertProps = {
  action: 'buy' | 'sell'
  rows: number
  quantity: string
  symbol?: string | null
  price?: string | null
}

export default function PlannerActionAlert({
  action,
  rows,
  quantity,
  symbol,
  price,
}: PlannerActionAlertProps) {
  const actionLabel = action === 'buy' ? 'Buy now' : 'Sell now'
  const rowLabel = rows === 1 ? 'row' : 'rows'
  const quantityLabel = `${quantity}${symbol ? ` ${symbol}` : ''}`

  return (
    <>
      <div className="pl-banner pl-banner-desktop">
        <span className="dot" aria-hidden="true">
          <TriangleAlert strokeWidth={2.5} />
        </span>
        <b className="alert-txt act-now">{actionLabel}</b>
        <span className="sep">·</span>
        <span>
          <b className="tabular-nums">{rows}</b> {rowLabel}
        </span>
        <span className="sep">·</span>
        <span>
          Qty: <b className="tabular-nums">{quantityLabel}</b>
        </span>
        {price && (
          <>
            <span className="sep">@</span>
            <span>
              Price: <b className="tabular-nums">{price}</b>
            </span>
          </>
        )}
      </div>

      <aside
        className={`pl-action-alert-mobile ${action}`}
        aria-label={`${actionLabel} planner alert`}
      >
        <div className="pl-action-alert-head">
          <span className="pl-action-alert-icon" aria-hidden="true">
            <TriangleAlert strokeWidth={2.2} />
          </span>
          <span className="pl-action-alert-title">
            <span className="eyebrow">Planner signal</span>
            <strong>{actionLabel}</strong>
          </span>
          <span className="pl-action-alert-count tabular-nums">
            {rows} {rows === 1 ? 'level' : 'levels'}
          </span>
        </div>

        <div className="pl-action-alert-metrics">
          <span className="pl-action-alert-metric">
            <span className="label">Quantity</span>
            <strong className="tabular-nums">{quantityLabel}</strong>
          </span>
          <span className="pl-action-alert-metric">
            <span className="label">Trigger price</span>
            <strong className="tabular-nums">{price ?? '—'}</strong>
          </span>
        </div>
      </aside>
    </>
  )
}
