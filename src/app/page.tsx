import Link from 'next/link'

type CoinRow = {
  symbol: string
  name: string
  strategyReturn: string
  buyHoldReturn: string
  excessReturn: string
}

// Placeholder demo data – you can later replace with your real backtest stats
const DEMO_COIN_ROWS: CoinRow[] = [
  { symbol: 'BTC', name: 'Bitcoin', strategyReturn: '+325%', buyHoldReturn: '+295%', excessReturn: '+30%' },
  { symbol: 'ETH', name: 'Ethereum', strategyReturn: '+410%', buyHoldReturn: '+380%', excessReturn: '+30%' },
  { symbol: 'SOL', name: 'Solana', strategyReturn: '+720%', buyHoldReturn: '+665%', excessReturn: '+55%' },
  { symbol: 'BNB', name: 'BNB', strategyReturn: '+260%', buyHoldReturn: '+230%', excessReturn: '+30%' },
  { symbol: 'ADA', name: 'Cardano', strategyReturn: '+190%', buyHoldReturn: '+165%', excessReturn: '+25%' },
  { symbol: 'XRP', name: 'XRP', strategyReturn: '+140%', buyHoldReturn: '+115%', excessReturn: '+25%' },
  { symbol: 'DOGE', name: 'Dogecoin', strategyReturn: '+380%', buyHoldReturn: '+340%', excessReturn: '+40%' },
  { symbol: 'AVAX', name: 'Avalanche', strategyReturn: '+310%', buyHoldReturn: '+275%', excessReturn: '+35%' },
  { symbol: 'MATIC', name: 'Polygon', strategyReturn: '+270%', buyHoldReturn: '+235%', excessReturn: '+35%' },
  { symbol: 'LINK', name: 'Chainlink', strategyReturn: '+215%', buyHoldReturn: '+190%', excessReturn: '+25%' },
]

export default function LandingPage() {
  return (
    // Tight vertical layout; hero content lifted toward top
    <div className="flex flex-col gap-8">
      {/* Hero / Overview */}
      <section
        id="overview"
        className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)] items-start"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Institutional-grade crypto planning workspace</span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              PRODUCT · Overview
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-50">
              Turn chaotic crypto positions
              <br className="hidden sm:block" />
              into a disciplined, provable plan.
            </h1>
          </div>

          <p className="max-w-xl text-sm sm:text-base text-slate-400">
            Build a clear accumulation plan for your crypto—pre-defined levels, target allocations,
            and risk guardrails—so less of your portfolio is guesswork.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-slate-50 shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400"
            >
              Sign in to your workspace
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[#1f2021] px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[#252628]"
            >
              Request access
            </Link>
          </div>

          <p className="text-xs text-slate-500">
            Already onboarded?{' '}
            <Link
              href="/dashboard"
              className="text-indigo-300 hover:text-indigo-200 hover:underline"
            >
              Jump straight to your dashboard
            </Link>
            .
          </p>
        </div>

        {/* Product preview card */}
        <div className="relative">
          <div className="pointer-events-none absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-indigo-500/20 via-emerald-500/10 to-sky-500/10 blur-2xl" />
          <div className="relative rounded-3xl border border-slate-800/80 bg-[#1f2021] px-5 py-4 shadow-2xl shadow-black/60">
            <header className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  LedgerOne · Overview
                </p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  Coin accumulation program (illustrative)
                </p>
              </div>
              <div className="rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-emerald-300">
                Strategy vs natural growth
              </div>
            </header>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3">
                <p className="text-[11px] font-medium text-slate-400">Net exposure</p>
                <p className="mt-1 text-lg font-semibold text-slate-50">$1.28M</p>
                <p className="mt-1 text-[11px] text-emerald-300">+3.4% vs target</p>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3">
                <p className="text-[11px] font-medium text-slate-400">Plan fills</p>
                <p className="mt-1 text-lg font-semibold text-slate-50">37 / 52</p>
                <p className="mt-1 text-[11px] text-slate-400">Next allocation band in 3.2%</p>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3">
                <p className="text-[11px] font-medium text-slate-400">Risk metric</p>
                <p className="mt-1 text-lg font-semibold text-slate-50">0.63</p>
                <p className="mt-1 text-[11px] text-amber-300">Balanced · within mandate</p>
              </div>
            </div>

            {/* Top 10 coins · strategy vs natural growth */}
            <div className="mt-4 rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                Top 10 coins · strategy vs natural growth
              </p>

              <div className="mt-1 flex items-baseline justify-between text-[11px]">
                <span className="font-medium text-emerald-300">Avg excess vs HODL · +18%</span>
                <span className="text-slate-500">Per-coin vs its own buy-and-hold path</span>
              </div>

              <div className="mt-2 rounded-xl border border-slate-800/80 bg-slate-950/40">
                {/* Header row */}
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-2 text-[10px] font-medium text-slate-400">
                  <span>Coin</span>
                  <span className="text-right">Strategy</span>
                  <span className="text-right">Buy &amp; hold</span>
                  <span className="text-right">Excess</span>
                </div>

                {/* Scrollable body – compact, but keeps font size */}
                <div className="max-h-28 overflow-y-auto border-t border-slate-800/80">
                  {DEMO_COIN_ROWS.map((row) => (
                    <div
                      key={row.symbol}
                      className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-1.5 text-[10px] text-slate-200 odd:bg-slate-900/40 even:bg-slate-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800/80 text-[9px] font-semibold text-slate-100">
                          {row.symbol[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-medium text-slate-100">
                            {row.symbol}
                          </span>
                          <span className="text-[9px] text-slate-400">{row.name}</span>
                        </div>
                      </div>
                      <span className="text-right text-emerald-300">{row.strategyReturn}</span>
                      <span className="text-right text-slate-300">{row.buyHoldReturn}</span>
                      <span className="text-right text-indigo-300">{row.excessReturn}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="mt-2 text-[10px] text-slate-500">
                Illustrative only · Strategy returns vs each coin&apos;s own buy-and-hold growth since Jan 1, 2021.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip / methodology hint */}
      <section
        id="methodology"
        className="rounded-2xl border border-slate-800/80 bg-[#151618] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      >
        <p className="text-xs text-slate-300">
          Institutional-style structure, packaged for everyday crypto investors.
        </p>
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1">
                Any portfolio size
          </span>
          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1">
            Long-horizon focus
          </span>
          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1">
            All investor levels
          </span>
        </div>
      </section>

      {/* Workflow */}
      <section id="planner" className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            PRODUCT · Workflow
          </p>
          <p className="text-sm text-slate-300 max-w-xl">
            Three simple steps to put structure around your crypto investing.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              01 · Define the playbook
            </p>
            <h2 className="mt-2 text-sm font-semibold text-slate-100">
              Set your levels and allocations
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Map out buy zones, trim levels, and max allocation per coin before price moves.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              02 · Execute with discipline
            </p>
            <h2 className="mt-2 text-sm font-semibold text-slate-100">See when it&apos;s time to act</h2>
            <p className="mt-2 text-xs text-slate-400">
              Let the planner highlight which levels are live, filled, or coming into range.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              03 · Review risk & progress
            </p>
            <h2 className="mt-2 text-sm font-semibold text-slate-100">Stay aligned with your plan</h2>
            <p className="mt-2 text-xs text-slate-400">
              Track exposure and plan fills over time so your portfolio follows your rules.
            </p>
          </div>
        </div>
      </section>

      {/* Audience fit */}
      <section id="teams" className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            RESOURCES · Who uses LedgerOne
          </p>
          <p className="text-sm text-slate-300 max-w-xl">
 Built for investors at any scale—from first portfolios to larger allocations—who want a plan, not just price charts.          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-5">
  <p className="text-xs font-medium text-slate-300">For everyday and advanced investors</p>
  <p className="mt-2 text-xs text-slate-400">
    From your first crypto allocation to managing a larger, diversified portfolio, use a simple
    rules-based workspace to grow and adjust positions over time.
  </p>
</div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-5">
            <p className="text-xs font-medium text-slate-300">Institutional habits, consumer access</p>
            <p className="mt-2 text-xs text-slate-400">
             LedgerOne borrows the same planning habits used by professional allocators—pre-defined
            bands, sizing rules, and risk guardrails—so you can take the guesswork out of when and how
            to invest.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-[#1f2021] p-5">
            <p className="text-xs font-medium text-slate-300">For long-horizon wealth builders</p>
            <p className="mt-2 text-xs text-slate-400">
              Scale into positions over months or years with guardrails you can actually stick to.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA / pricing hint */}
      <section
        id="pricing"
        className="mt-2 flex flex-col items-center justify-center gap-3 border-t border-slate-800/60 pt-4"
      >
        <p className="text-xs text-slate-400 text-center max-w-md">
          Ready to bring institutional-style structure to your household portfolio?
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-indigo-500/90 px-4 py-2 text-xs font-medium text-slate-50 shadow shadow-indigo-500/30 transition hover:bg-indigo-400"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-[#1f2021] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500/80 hover:bg-[#252628]"
          >
            Request access
          </Link>
        </div>
      </section>
    </div>
  )
}
