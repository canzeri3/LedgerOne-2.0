import Link from 'next/link'

type CoinRow = {
  symbol: string
  name: string
  planPath: string
  baseline: string
  drift: string
}

// Illustrative demo data only (no performance promises)
const DEMO_COIN_ROWS: CoinRow[] = [
  { symbol: 'BTC', name: 'Bitcoin', planPath: 'Within band', baseline: 'Hold', drift: 'Low' },
  { symbol: 'ETH', name: 'Ethereum', planPath: 'Within band', baseline: 'Hold', drift: 'Low' },
  { symbol: 'SOL', name: 'Solana', planPath: 'Near trigger', baseline: 'Hold', drift: 'Moderate' },
  { symbol: 'BNB', name: 'BNB', planPath: 'Within band', baseline: 'Hold', drift: 'Low' },
  { symbol: 'ADA', name: 'Cardano', planPath: 'Triggered', baseline: 'Hold', drift: 'Moderate' },
  { symbol: 'XRP', name: 'XRP', planPath: 'Within band', baseline: 'Hold', drift: 'Low' },
  { symbol: 'DOGE', name: 'Dogecoin', planPath: 'Near trigger', baseline: 'Hold', drift: 'Moderate' },
  { symbol: 'AVAX', name: 'Avalanche', planPath: 'Within band', baseline: 'Hold', drift: 'Low' },
  { symbol: 'MATIC', name: 'Polygon', planPath: 'Within band', baseline: 'Hold', drift: 'Low' },
  { symbol: 'LINK', name: 'Chainlink', planPath: 'Triggered', baseline: 'Hold', drift: 'Moderate' },
]

function Kicker({
  label,
  title,
  subtitle,
}: {
  label: string
  title: string
  subtitle: string
}) {
  return (
    <div className="mx-auto max-w-3xl text-center space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-100">
        {title}
      </h2>
      <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
        {subtitle}
      </p>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16">
      {/* HERO + PREVIEW */}
      <section id="overview" className="relative">
        {/* Subtle hero halo only (keeps premium feel, not chaotic) */}
        <div className="pointer-events-none absolute left-1/2 top-8 h-44 w-[48rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/8 to-sky-500/10 blur-3xl" />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
          <div className="max-w-xl space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Portfolio planning workspace</span>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                LEDGERONE · OVERVIEW
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-50">
                Bring structure to your crypto portfolio.
              </h1>
            </div>

            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Define allocations, set clear rules, and track progress against your plan—so decisions stay
              consistent across volatility.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-slate-50 shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/30 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45"
              >
                Request access
              </Link>
            </div>

            <p className="text-xs text-slate-500">
              Already onboarded?{' '}
              <Link
    href="/dashboard"
className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/30 px-2.5 py-0.5 text-[11px] font-medium leading-none text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45"
  >
    Open dashboard
  </Link>
              
            </p>
          </div>

          {/* Preview — keep as a “product screenshot” card for clarity */}
          <div className="relative">
            <div className="pointer-events-none absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-indigo-500/12 via-emerald-500/8 to-sky-500/10 blur-2xl" />
            <div className="relative rounded-3xl border border-slate-800/50 bg-[#1f2021] px-5 py-4 shadow-2xl shadow-black/60">
              <header className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    LedgerOne · Overview
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-100">
                    Portfolio plan overview (illustrative)
                  </p>
                </div>
                <div className="rounded-full bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-emerald-300">
                  Plan vs Baseline
                </div>
              </header>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3">
                  <p className="text-[11px] font-medium text-slate-400">Net invested</p>
                  <p className="mt-1 text-lg font-semibold text-slate-50">$1.28M</p>
                  <p className="mt-1 text-[11px] text-slate-400">vs target allocation</p>
                </div>
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3">
                  <p className="text-[11px] font-medium text-slate-400">Plan progress</p>
                  <p className="mt-1 text-lg font-semibold text-slate-50">37 / 52</p>
                  <p className="mt-1 text-[11px] text-slate-400">Next band activates within 3.2%</p>
                </div>
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3">
                  <p className="text-[11px] font-medium text-slate-400">Risk metric</p>
                  <p className="mt-1 text-lg font-semibold text-slate-50">0.63</p>
                  <p className="mt-1 text-[11px] text-amber-300">
                    Risk posture: Balanced · within mandate
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/20 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Top holdings · plan tracking (illustrative)
                </p>

                <div className="mt-1 flex items-baseline justify-between text-[11px]">
                  <span className="font-medium text-slate-300">Tracking vs baseline · —</span>
                  <span className="text-slate-500">Illustrative planning view</span>
                </div>

                <div className="mt-2 rounded-xl border border-slate-800/60 bg-slate-950/25">
                  <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-2 text-[10px] font-medium text-slate-400">
                    <span>Coin</span>
                    <span className="text-right">Plan path</span>
                    <span className="text-right">Baseline</span>
                    <span className="text-right">Drift</span>
                  </div>

                  <div className="max-h-28 overflow-y-auto border-t border-slate-800/60">
                    {DEMO_COIN_ROWS.map((row) => (
                      <div
                        key={row.symbol}
                        className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-1.5 text-[10px] text-slate-200 odd:bg-slate-900/35 even:bg-slate-900/15"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800/70 text-[9px] font-semibold text-slate-100">
                            {row.symbol[0]}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-medium text-slate-100">{row.symbol}</span>
                            <span className="text-[9px] text-slate-400">{row.name}</span>
                          </div>
                        </div>
                        <span className="text-right text-emerald-300">{row.planPath}</span>
                        <span className="text-right text-slate-300">{row.baseline}</span>
                        <span className="text-right text-indigo-300">{row.drift}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-slate-500">
                  Illustrative only. Examples shown for product demonstration and do not represent expected outcomes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP (simple, clean, not flashy) */}
      <section id="methodology" className="rounded-2xl border border-slate-800/60 bg-[#151618] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
<p className="text-sm text-slate-300 leading-relaxed">
 Institutional-style workflow for long-horizon investors—adapted for individual investors and built for process, risk controls, and clean reporting.</p>


          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">
              Any portfolio size
            </span>
            <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">
              Long-horizon focus
            </span>
            <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">
              Rules-based workflow
            </span>
          </div>
        </div>
      </section>

      {/* VALUE PILLARS (3 clear reasons; clean marketing) */}
      <section id="pillars" className="space-y-8">
        <Kicker
          label="LEDGERONE · PRINCIPLES"
          title="Built around clarity, discipline, and reporting."
          subtitle="LedgerOne is designed to reduce noise and increase consistency—by turning portfolio management into a repeatable workflow."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-sm font-semibold text-slate-100">Rules-first planning</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Define targets, bands, and ladder levels up front—so actions follow a plan, not headlines.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-sm font-semibold text-slate-100">Portfolio-level visibility</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Track positions, progress, and drift in one place with clean, calm reporting.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-sm font-semibold text-slate-100">Risk posture and guardrails</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Stay within a defined mandate using structured constraints that help keep decisions consistent.
            </p>
          </div>
        </div>
      </section>

      {/* WORKFLOW (simple cards; no extra effects) */}
      <section id="planner" className="space-y-8">
        <Kicker
          label="PRODUCT · WORKFLOW"
          title="A simple workflow that keeps your portfolio on-plan."
          subtitle="Define rules → execute with discipline → review progress over time."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">01 · Define</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">Define your allocation rules</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Set targets, bands, and ladder levels per asset—before markets move.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">02 · Execute</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">Execute with discipline</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Identify when a level is in range, triggered, or filled—so actions follow the plan.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">03 · Review</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">Review risk & progress</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Track drift, exposure, and plan adherence with clean portfolio-level reporting.
            </p>
          </div>
        </div>
      </section>

      {/* ABOUT (floating statement — used sparingly, where it adds trust) */}
      <section id="about" className="relative">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-[42rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-500/12 via-emerald-500/8 to-sky-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center space-y-4 px-2">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              LEDGERONE · ABOUT
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-100">
            A calmer way to manage a crypto portfolio.
          </h2>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            LedgerOne started as a simple need: manage crypto positions with the same structure used in
            disciplined portfolio workflows. Spreadsheets were fragile, dashboards were noisy, and most tools
            were built for watching—not planning. LedgerOne focuses on your ledger, your rules, and clean
            reporting so decisions stay consistent across volatility.
          </p>
        {/* Seam halo: overlaps into the next section without affecting layout */}
        <div className="pointer-events-none absolute left-1/2 bottom-0 h-28 w-[46rem] max-w-[92vw] -translate-x-1/2 translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/7 to-sky-500/10 blur-3xl" />

          <p className="text-[11px] text-slate-500">
          </p>
          
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section id="teams" className="space-y-8">
        <Kicker
          label="RESOURCES · WHO IT’S FOR"
          title="Designed for investors who want structure."
          subtitle="A rules-based workspace that prioritizes clarity and consistency over noise."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-sm font-semibold text-slate-100">Everyday investors</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Replace spreadsheets with a single workspace for positions, cost basis, and planning.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-sm font-semibold text-slate-100">Process-driven allocators</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Set guardrails and allocation bands to reduce reactive decisions during volatility.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6">
            <p className="text-sm font-semibold text-slate-100">Long-horizon builders</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Scale in and out over months or years with a plan you can actually stick to.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="pricing" className="rounded-2xl border border-slate-800/60 bg-[#151618] px-6 py-6">
        <div className="flex flex-col items-center justify-between gap-4 text-center sm:text-left sm:flex-row">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-100">Ready to bring structure to your portfolio?</p>
            <p className="text-sm text-slate-400">
              Sign in or request access to start using LedgerOne.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-slate-50 shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/35 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45"
            >
              Request access
            </Link>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-slate-500 text-center">
          LedgerOne is a planning and tracking tool. It does not provide investment advice.
        </p>
      </section>
    </div>
  )
}
