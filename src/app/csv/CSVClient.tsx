'use client'

import { Download, Upload } from 'lucide-react'
import ExportCSVButtons from '@/components/portfolio/ExportCSVButtons'
import ImportTrades from '@/components/portfolio/ImportTrades'

export default function CSVClient() {
  return (
    <>
      {/* Header */}
      <header className="st-head">
        <div className="st-aurora" aria-hidden="true" />
        <div className="st-head-inner">
          <span className="st-eyebrow">LedgerOne · Data</span>
          <h1 className="st-title">Export &amp; Import</h1>
          <p className="st-sub">
            Download your trades, planners, and ladder rows as CSV — or bring trades into your
            ledger from a CSV file.
          </p>
        </div>
      </header>

      {/* Export */}
      <section className="st-section">
        <div className="st-section-head">
          <span className="st-section-ic"><Download className="h-[18px] w-[18px]" /></span>
          <div>
            <div className="st-section-title">Export</div>
            <div className="st-section-desc">
              Pick a scope, then download your CSV files. Monetary fields remain in canonical USD
              and each exported row is labeled <code>fiat_currency=USD</code>.
            </div>
          </div>
        </div>
        <div className="st-card">
          <div className="p-5 md:p-6">
            <ExportCSVButtons />
          </div>
        </div>
      </section>

      {/* Import */}
      <section id="trade-import" className="st-section mt-6 scroll-mt-24">
        <div className="st-section-head">
          <span className="st-section-ic"><Upload className="h-[18px] w-[18px]" /></span>
          <div>
            <div className="st-section-title">Import trades</div>
            <div className="st-section-desc">Upload a CSV to add trades to your ledger. Price and fee fields must be USD.</div>
          </div>
        </div>
        <div className="st-card">
          <div className="p-5 md:p-6">
            <ImportTrades />
          </div>
        </div>
      </section>
    </>
  )
}
