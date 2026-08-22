type Props = {
  label: string
}

/** Lightweight destination placeholder used while first-load data resolves. */
export default function RoutePageSkeleton({ label }: Props) {
  return (
    <div
      className="lg1-page-skeleton motion-safe:animate-pulse"
      role="status"
      aria-label={`Loading ${label}`}
      data-route-page-skeleton
    >
      <span className="sr-only">Loading {label}…</span>

      <div className="lg1-page-skeleton-head">
        <span className="wide" />
        <span className="short" />
      </div>

      <div className="lg1-page-skeleton-stats" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="lg1-page-skeleton-grid" aria-hidden="true">
        <span className="primary" />
        <span className="secondary" />
      </div>
    </div>
  )
}
