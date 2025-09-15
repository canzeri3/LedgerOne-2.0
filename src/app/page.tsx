export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 p-4">Holdings (coming soon)</div>
        <div className="rounded-2xl border border-neutral-800 p-4">Realized / Unrealized P&amp;L (soon)</div>
        <div className="rounded-2xl border border-neutral-800 p-4">Price snapshots (soon)</div>
      </div>
      <p className="text-neutral-400 text-sm">
        We’ll wire real data and planner math in the next steps.
      </p>
    </div>
  )
}

