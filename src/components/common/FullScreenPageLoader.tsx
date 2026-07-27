// Full-screen blurred loader overlay used by App Router `loading.tsx` files.
// Keep this component free of client hooks so it can render as a server component.

export default function FullScreenPageLoader() {
  return (
    <div className="lg1-loader-overlay fixed inset-0 z-[999] flex items-center justify-center">
      <div className="lg1-page-loader">
        <div className="lg1-loader-orbit">
          {/* LedgerOne "L1" brand mark — transparent, spins like a loader */}
          <svg
            className="lg1-loader-mark"
            viewBox="8 7.5 24 24"
            role="img"
            aria-label="Loading"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="lg1-mark-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8b82ff" />
                <stop offset="1" stopColor="#5f53c0" />
              </linearGradient>
            </defs>
            <g fill="url(#lg1-mark-grad)">
              {/* L — stem + foot */}
              <rect x="8" y="8" width="7" height="23" rx="1" />
              <rect x="8" y="25" width="13" height="6" rx="1" />
              {/* 1 — stem + top flag */}
              <rect x="26" y="8" width="6" height="23" rx="1" />
              <rect x="19" y="8" width="13" height="6" rx="1" />
            </g>
          </svg>
        </div>
        <div className="lg1-loader-text">Preparing your LedgerOne workspace…</div>
      </div>
    </div>
  )
}
