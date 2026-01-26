'use client'

import ExportCSVButtons from '@/components/portfolio/ExportCSVButtons'
import ImportTrades from '@/components/portfolio/ImportTrades'

export default function CSVExportPage() {
  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-screen-2xl mx-auto space-y-6">
      {/* Header (match Planner/Dashboard pattern) */}
      <div className="space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[rgb(41,42,45)]/80 pb-3">
          <div className="min-w-0">
            <h1 className="text-[20px] md:text-[22px] font-semibold text-white/90 leading-tight">CSV Export / Import</h1>
            <p className="mt-1 text-[13px] md:text-[14px] text-[rgb(163,163,164)]">
              Download your data as CSV files, or import trades from a CSV.
            </p>
          </div>
        </div>
      </div>

      {/* Export card */}
      <section className="rounded-2xl bg-[rgb(28,29,31)] ring-1 ring-inset ring-[rgb(41,42,45)]/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="p-4 md:p-5 border-b border-[rgb(41,42,45)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.00))]">
          <div className="text-[14px] text-slate-100 font-medium">Export</div>
          <p className="mt-1 text-[13px] text-[rgb(163,163,164)]">Pick a scope, then download your CSV files.</p>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          <ExportCSVButtons />

          <ul className="list-disc list-inside text-[12px] text-[rgb(140,140,142)] space-y-1">
            <li>
              <span className="text-slate-100/90 font-medium">Trades</span>: your trade ledger (with planner ids if present).
            </li>
            <li>
              <span className="text-slate-100/90 font-medium">Sell planners</span>: planners plus computed{' '}
              <code className="text-slate-200/80">levels_planned</code>.
            </li>
            <li>
              <span className="text-slate-100/90 font-medium">Sell levels</span>: ladder rows per planner.
            </li>
          </ul>
        </div>
      </section>

      {/* Import card */}
      <ImportTrades />
    </div>
  )
}
