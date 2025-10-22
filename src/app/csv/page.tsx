'use client'

import ExportCSVButtons from '@/components/portfolio/ExportCSVButtons'
import ImportTrades from '@/components/portfolio/ImportTrades'

export default function CSVExportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CSV Export / Import</h1>
      </div>

      <div className="rounded-2xl border border-[#081427] p-4 space-y-4">
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


