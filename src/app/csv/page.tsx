'use client'

import ExportCSVButtons from '@/components/portfolio/ExportCSVButtons'
import ImportTrades from '@/components/portfolio/ImportTrades'

export default function CSVExportPage() {
  return (
    <div className="relative px-4 md:px-6 py-8 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CSV Export / Import</h1>
      </div>

      <div className="rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4 space-y-4 shadow-[inset_0_0_0_1px_rgba(51,65,85,0.35)]">
        <p className="text-sm text-slate-300">
          Choose a scope (All coins or a specific coin), then export your data.
        </p>

        <ExportCSVButtons />
        <ul className="list-disc list-inside text-xs text-slate-500 space-y-1">
          <li><b>Trades CSV</b>: all trades with planner tags.</li>
          <li><b>Sell Planners CSV</b>: active + frozen planners (computed <code>levels_planned</code>).</li>
          <li><b>Sell Levels CSV</b>: ladder rows for each planner.</li>
        </ul>
      </div>

      <ImportTrades />
    </div>
  )
}


