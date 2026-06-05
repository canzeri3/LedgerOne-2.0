'use client'

const COLS = [
  { h: 'Platform',  links: ['Allocation engine', 'Risk framework', 'Rules engine', 'Allocation agent', 'Reporting', 'API'] },
  { h: 'Use cases', links: ['Long-term allocator', 'Active investor', 'Family office · advisor', 'New allocator'] },
  { h: 'Company',   links: ['About', 'Careers', 'Press', 'Contact'] },
  { h: 'Trust',     links: ['Security', 'Institutional architecture', 'Audits', 'Disclosures', 'Status'] },
]

export function L1Footer() {
  return (
    <footer className="l1-footer" style={{ paddingTop: 20 }}>
      <div className="l1-wrap">
        <div className="l1-footer-grid">
          {/* Brand column — logo only, no tagline here */}
          <div className="l1-footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ledgerone-logo.png"
              alt="LedgerOne"
              style={{ height: 88, width: 'auto', display: 'block', margin: '28px auto 20px' }}
            />
          </div>

          {/* Nav columns */}
          {COLS.map((col) => (
            <div key={col.h} className="l1-footer-col">
              <h5>{col.h}</h5>
              {col.links.map((l) => (
                <a key={l} href="#">{l}</a>
              ))}
            </div>
          ))}
        </div>

        {/* Tagline — centered, below the grid */}
        <p style={{ margin: '20px 0 0', textAlign: 'center', letterSpacing: '0.5px', fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: 13 }}>
          Where volatility becomes strategy.
        </p>

        {/* Fine print row */}
        <div className="l1-footer-fine">
          <span>© 2026 LedgerOne. Planning &amp; tracking tool — It does not provide investment advice.</span>
          <span>NYC · SG · Operations 24/7</span>
        </div>
      </div>
    </footer>
  )
}
