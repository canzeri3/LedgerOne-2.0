import Link from 'next/link'
import type { ReactNode } from 'react'

import { DrawLine, Parallax, Reveal, ScrollProgress, SplitRow } from '@/components/landing/ScrollEffects'
import { CoinLogoMini } from '@/components/landing/CoinLogoMini'

type CoinRow = {
  symbol: string
  name: string
  // Planned path = strategy P/L for this asset (illustrative)
  plannedPct: number
  // Baseline = buy & hold P/L for this asset (illustrative)
  baselinePct: number
}

// Illustrative demo data only (no performance promises)
const DEMO_COIN_ROWS: CoinRow[] = [
  { symbol: 'BTC', name: 'Bitcoin', plannedPct: 0.214, baselinePct: 0.183 },
  { symbol: 'ETH', name: 'Ethereum', plannedPct: 0.162, baselinePct: 0.141 },
  { symbol: 'SOL', name: 'Solana', plannedPct: 0.288, baselinePct: 0.244 },
  { symbol: 'BNB', name: 'BNB', plannedPct: 0.119, baselinePct: 0.112 },
  { symbol: 'ADA', name: 'Cardano', plannedPct: -0.042, baselinePct: -0.061 },
  { symbol: 'XRP', name: 'XRP', plannedPct: 0.081, baselinePct: 0.067 },
  { symbol: 'DOGE', name: 'Dogecoin', plannedPct: 0.054, baselinePct: 0.091 },
  { symbol: 'AVAX', name: 'Avalanche', plannedPct: 0.133, baselinePct: 0.098 },
  { symbol: 'MATIC', name: 'Polygon', plannedPct: -0.017, baselinePct: -0.028 },
  { symbol: 'LINK', name: 'Chainlink', plannedPct: 0.176, baselinePct: 0.149 },
]

function fmtSignedPct(x: number) {
  const sign = x > 0 ? '+' : x < 0 ? '−' : ''
  const v = Math.abs(x) * 100
  return `${sign}${v.toFixed(1)}%`
}

function Pill({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'green' | 'amber' | 'indigo'
  children: ReactNode
}) {
  const base =
    'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium leading-none tracking-tight'
  const tones: Record<string, string> = {
    slate: 'border-slate-700/70 bg-slate-900/25 text-slate-300',
    green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
    indigo: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-200',
  }
  return <span className={`${base} ${tones[tone] || tones.slate}`}>{children}</span>
}

function toneForDriftValue(driftPct: number): 'slate' | 'green' | 'amber' | 'indigo' {
  // keep it institutional: green for positive, amber for negative, slate near flat
  if (driftPct >= 0.01) return 'green'
  if (driftPct <= -0.01) return 'amber'
  return 'slate'
}

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
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>

      <div className="mx-auto max-w-[38rem]">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-100">{title}</h2>
        <DrawLine className="mt-3 opacity-70" />
      </div>

      <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{subtitle}</p>
    </div>
  )
}

/* ------------------------------------------
   Institutional card system (single style)
------------------------------------------- */

function InfoCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string
  title: string
  body: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#1f2021] p-6 transition-colors hover:border-slate-700/70">
      {/* darker + calmer surface */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.14] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65 group-hover:opacity-80" />

      <div className="relative">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
        ) : null}

        <p className={`${eyebrow ? 'mt-2' : ''} text-sm font-semibold tracking-tight text-slate-100`}>{title}</p>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

function InfoCardTight({ title, body }: { title: string; body: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#1f2021] p-5 transition-colors hover:border-slate-700/70">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.14] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65 group-hover:opacity-80" />

      <div className="relative">
        <p className="text-sm font-semibold tracking-tight text-slate-100">{title}</p>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------
   Preview panel system (same language as cards)
------------------------------------------- */

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-[#1f2021] shadow-[0_22px_70px_rgba(0,0,0,0.55)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.18] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/14 to-transparent opacity-70" />

      <div className="relative">{children}</div>
    </div>
  )
}

function MetricTile({
  label,
  value,
  note,
  accent = 'text-slate-200',
}: {
  label: string
  value: string
  note: string
  accent?: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/15 p-3 transition-colors hover:border-slate-700/70">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.16] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65 group-hover:opacity-75" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium text-slate-400">{label}</p>
          <span className="h-1 w-1 rounded-full bg-slate-600/70" />
        </div>

        <p className={`mt-1 text-lg font-semibold tracking-tight ${accent}`}>{value}</p>
        <p className="mt-1 text-[11px] text-slate-500">{note}</p>
      </div>
    </div>
  )
}

function PanelHeader() {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-800/70 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full border border-slate-700/70 bg-slate-900/30" />
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">LedgerOne · Overview</p>
          <p className="text-sm font-semibold tracking-tight text-slate-100">Portfolio plan overview (illustrative)</p>
          <p className="text-[11px] text-slate-500">Strategy P/L vs Buy &amp; Hold · Drift = Planned − Baseline</p>
        </div>
      </div>

      <div className="pt-0.5">
        <Pill tone="green">Plan vs Baseline</Pill>
      </div>
    </header>
  )
}

/* -----------------------------
   Institutional blocks (inlined)
--------------------------------*/

function SecurityDataSection() {
  return (
    <section id="security" className="space-y-6">
      <div className="mx-auto max-w-3xl text-center space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          TRUST · SECURITY & DATA
        </p>
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-100">
          Built for planning and tracking — not custody.
        </h3>
        <DrawLine className="mx-auto max-w-[26rem] opacity-60" />

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          LedgerOne is designed as a portfolio workflow tool. It helps you define rules, track progress, and stay
          consistent — without acting as a custodian or broker.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InfoCardTight title="No custody" body="LedgerOne is a planning workspace. It does not hold your assets." />
        <InfoCardTight
          title="No execution"
          body="LedgerOne does not place trades. Your actions remain under your control."
        />
        <InfoCardTight
          title="Process-first design"
          body="The product is built to support discipline: targets, bands, ladders, and clean reporting."
        />
      </div>
    </section>
  )
}

type FaqItem = { q: string; a: string }

const FAQ: FaqItem[] = [
  {
    q: 'Is LedgerOne investment advice?',
    a: 'No. LedgerOne is a planning and tracking tool. It helps you organize your own process and reporting.',
  },
  {
    q: 'Does LedgerOne custody funds or connect to my wallet?',
    a: 'LedgerOne is designed as a workflow tool. It does not act as a custodian. (If you add integrations later, keep them clearly disclosed and permission-scoped.)',
  },
  {
    q: 'Does LedgerOne place trades?',
    a: 'No. LedgerOne does not execute trades. It is designed to support rules-based decision-making and review.',
  },
  {
    q: 'Who is it best for?',
    a: 'Long-horizon investors who want a structured workflow: allocations, bands, ladders, and consistent review.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most users can define a basic structure quickly, then refine over time. The goal is a repeatable process, not a perfect day-one configuration.',
  },
]

function FAQSection() {
  return (
    <section id="faq" className="space-y-6">
      <div className="mx-auto max-w-3xl text-center space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">FAQ · QUICK CLARITY</p>
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-100">
          Common questions, answered directly.
        </h3>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          Keep the workflow simple. Keep expectations precise.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-2">
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#1f2021] px-5 py-4 transition-colors hover:border-slate-700/70"
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.14] via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65 group-hover:opacity-80" />

            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100 flex items-center justify-between gap-3">
              <span>{item.q}</span>
              <span className="text-slate-400 transition group-open:rotate-45">+</span>
            </summary>

            <p className="mt-2 text-sm text-slate-400 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function LandingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="pt-5 pb-5">
      <div className="w-full border-t border-slate-800/60 pt-6">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500">
              © {year} LedgerOne. Planning &amp; tracking tool — It does not provide investment advice.
            </p>

            <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded-full border border-slate-700/70 bg-slate-900/20 px-3 py-1">No custody</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/20 px-3 py-1">No execution</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/20 px-3 py-1">
                Rules-based workflow
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <>
      <ScrollProgress />

      <div className="flex flex-col gap-16">
        {/* HERO + PREVIEW */}
        <section id="overview" className="relative">
          <Parallax
            className="pointer-events-none absolute left-1/2 top-8 h-44 w-[48rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/8 to-sky-500/10 blur-3xl"
            strengthY={28}
            strengthX={10}
            startAt={1.0}
            endAt={0.2}
          />

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
            <Reveal className="max-w-xl space-y-8">
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
                <DrawLine className="mt-4 opacity-60" />
              </div>

              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                Define allocations, set clear rules, and track progress against your plan—so decisions stay consistent
                across volatility.
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
            </Reveal>

            {/* PREVIEW (institutional panel) */}
            <Reveal className="relative" delayMs={120}>
              <Parallax
                className="pointer-events-none absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-indigo-500/12 via-emerald-500/8 to-sky-500/10 blur-2xl"
                strengthY={18}
                strengthX={-10}
                startAt={1.0}
                endAt={0.2}
              />

              <Panel>
                <PanelHeader />

                <div className="px-5 pb-5">
                  {/* KPI row */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Key metrics</p>
                    <div className="h-px flex-1 bg-gradient-to-r from-slate-800/0 via-slate-800/70 to-slate-800/0" />
                    <Pill tone="slate">Demo</Pill>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <MetricTile label="Net invested" value="$1.28M" note="vs target allocation" accent="text-slate-50" />
                    <MetricTile
                      label="Plan progress"
                      value="37 / 52"
                      note="Next band within 3.2%"
                      accent="text-slate-50"
                    />
                    <MetricTile label="Risk metric" value="0.63" note="Risk posture: Balanced" accent="text-slate-50" />
                  </div>

                  {/* Table */}
                  <div className="mt-4 relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/12">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.14] via-transparent to-transparent" />
                    <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65" />

                    <div className="relative p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                          Top holdings · plan tracking (illustrative)
                        </p>
                        <p className="text-[11px] text-slate-500">Drift = Planned − Baseline</p>
                      </div>

                      <div className="mt-2 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-950/20">
                        <div className="sticky top-0 z-10 bg-slate-950/35 backdrop-blur-sm">
                          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-2 text-[10px] font-medium text-slate-400">
                            <span>Coin</span>
                            <span className="text-right">Planned path</span>
                            <span className="text-right">Baseline</span>
                            <span className="text-right">Drift</span>
                          </div>
                          <div className="h-px bg-slate-800/70" />
                        </div>

                        <div className="max-h-28 overflow-y-auto">
                          {DEMO_COIN_ROWS.map((row) => {
                            const drift = row.plannedPct - row.baselinePct
                            return (
                              <div
                                key={row.symbol}
                                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-2 text-[10px] text-slate-200 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-900/25"
                              >
                                <div className="flex items-center gap-2">
                                <CoinLogoMini
  symbol={row.symbol}
  name={row.name}
  sizePx={20}
  className="h-5 w-5"
/>

                                  <div className="flex flex-col leading-tight">
                                    <span className="text-[10px] font-semibold text-slate-100">{row.symbol}</span>
                                    <span className="text-[9px] text-slate-500">{row.name}</span>
                                  </div>
                                </div>

                                <div className="text-right tabular-nums text-slate-200">
                                  {fmtSignedPct(row.plannedPct)}
                                </div>
                                <div className="text-right tabular-nums text-slate-400">
                                  {fmtSignedPct(row.baselinePct)}
                                </div>
                                <div className="flex justify-end">
                                  <Pill tone={toneForDriftValue(drift)}>{fmtSignedPct(drift)}</Pill>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <p className="mt-2 text-[10px] text-slate-500">
                        Illustrative only. Example values are for product demonstration and do not represent expected
                        outcomes.
                      </p>
                    </div>
                  </div>
                </div>
              </Panel>
            </Reveal>
          </div>
        </section>

        {/* TRUST STRIP */}
        <Reveal>
          <section id="methodology" className="rounded-2xl border border-slate-800/60 bg-[#151618] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-300 leading-relaxed">
                Institutional-style workflow for long-horizon investors—adapted for individual investors and built for
                process, risk controls, and clean reporting.
              </p>

              <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">Any portfolio size</span>
                <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">Long-horizon focus</span>
                <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">Rules-based workflow</span>
              </div>
            </div>
          </section>
        </Reveal>

        {/* VALUE PILLARS */}
        <section id="pillars" className="space-y-8">
          <Reveal>
            <Kicker
              label="LEDGERONE · PRINCIPLES"
              title="Built around clarity, discipline, and reporting."
              subtitle="LedgerOne is designed to reduce noise and increase consistency—by turning portfolio management into a repeatable workflow."
            />
          </Reveal>

          <SplitRow className="grid gap-6 lg:grid-cols-3">
            <Reveal delayMs={0}>
              <InfoCard
                title="Rules-first planning"
                body="Define targets, bands, and ladder levels up front—so actions follow a plan, not headlines."
              />
            </Reveal>

            <Reveal delayMs={90}>
              <InfoCard
                title="Portfolio-level visibility"
                body="Track positions, progress, and drift in one place with clean, calm reporting."
              />
            </Reveal>

            <Reveal delayMs={180}>
              <InfoCard
                title="Risk posture and guardrails"
                body="Stay within a defined mandate using structured constraints that help keep decisions consistent."
              />
            </Reveal>
          </SplitRow>
        </section>

        {/* WORKFLOW */}
        <section id="planner" className="space-y-8">
          <Reveal>
            <Kicker
              label="PRODUCT · WORKFLOW"
              title="A simple workflow that keeps your portfolio on-plan."
              subtitle="Define rules → execute with discipline → review progress over time."
            />
          </Reveal>

          <SplitRow className="grid gap-6 lg:grid-cols-3">
            <Reveal delayMs={0}>
              <InfoCard
                eyebrow="01 · Define"
                title="Define your allocation rules"
                body="Set targets, bands, and ladder levels per asset—before markets move."
              />
            </Reveal>

            <Reveal delayMs={90}>
              <InfoCard
                eyebrow="02 · Execute"
                title="Execute with discipline"
                body="Identify when a level is in range, triggered, or filled—so actions follow the plan."
              />
            </Reveal>

            <Reveal delayMs={180}>
              <InfoCard
                eyebrow="03 · Review"
                title="Review risk & progress"
                body="Track drift, exposure, and plan adherence with clean portfolio-level reporting."
              />
            </Reveal>
          </SplitRow>
        </section>
        
        {/* ABOUT */}
        <section id="about" className="relative">
          <Parallax
            className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-[42rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-500/12 via-emerald-500/8 to-sky-500/10 blur-3xl"
            strengthY={24}
            strengthX={-12}
            startAt={1.0}
            endAt={0.0}
          />
          <Reveal className="relative mx-auto max-w-3xl text-center space-y-4 px-2">
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                LEDGERONE · ABOUT
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-100">
              A calmer way to manage a crypto portfolio.
            </h2>

            <DrawLine className="mx-auto max-w-[26rem] opacity-60" />

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              LedgerOne started as a simple need: manage crypto positions with the same structure used in disciplined
              portfolio workflows. Spreadsheets were fragile, dashboards were noisy, and most tools were built for
              watching—not planning. LedgerOne focuses on your ledger, your rules, and clean reporting so decisions stay
              consistent across volatility.
            </p>

            <Parallax
              className="pointer-events-none absolute left-1/2 bottom-0 h-28 w-[46rem] max-w-[92vw] -translate-x-1/2 translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/7 to-sky-500/10 blur-3xl"
              strengthY={18}
              strengthX={10}
              startAt={1.0}
              endAt={0.0}
            />
          </Reveal>
        </section>


        {/* WHO IT'S FOR */}
        <section id="teams" className="space-y-8">
          <Reveal>
            <Kicker
              label="RESOURCES · WHO IT’S FOR"
              title="Designed for investors who want structure."
              subtitle="A rules-based workspace that prioritizes clarity and consistency over noise."
            />
          </Reveal>

          <SplitRow className="grid gap-6 lg:grid-cols-3">
            <Reveal delayMs={0}>
              <InfoCard
                title="Everyday investors"
                body="Replace spreadsheets with a single workspace for positions, cost basis, and planning."
              />
            </Reveal>

            <Reveal delayMs={90}>
              <InfoCard
                title="Process-driven allocators"
                body="Set guardrails and allocation bands to reduce reactive decisions during volatility."
              />
            </Reveal>

            <Reveal delayMs={180}>
              <InfoCard
                title="Long-horizon builders"
                body="Scale in and out over months or years with a plan you can actually stick to."
              />
            </Reveal>
          </SplitRow>
        </section>

        {/* SECURITY & DATA */}
        <Reveal>
          <SecurityDataSection />
        </Reveal>

        {/* FINAL CTA */}
        <Reveal>
          <section
            id="pricing"
            className="relative rounded-2xl border border-slate-800/60 bg-[#151618] px-6 py-6 overflow-hidden"
          >
            <Parallax
              className="pointer-events-none absolute -left-24 -top-20 h-40 w-64 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/6 to-sky-500/10 blur-3xl"
              strengthY={22}
              strengthX={18}
              startAt={1.0}
              endAt={0.0}
            />
            <Parallax
              className="pointer-events-none absolute -right-24 -bottom-24 h-44 w-72 rounded-full bg-gradient-to-r from-sky-500/10 via-emerald-500/6 to-indigo-500/10 blur-3xl"
              strengthY={18}
              strengthX={-16}
              startAt={1.0}
              endAt={0.0}
            />

            <div className="relative flex flex-col items-center justify-between gap-4 text-center sm:text-left sm:flex-row">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Ready to bring structure to your portfolio?</p>
                <p className="text-sm text-slate-400">Sign in or request access to start using LedgerOne.</p>
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

            <p className="relative mt-4 text-[11px] text-slate-500 text-center">
              LedgerOne is a planning and tracking tool. It does not provide investment advice.
            </p>
          </section>
        </Reveal>

        {/* FAQ */}
        <Reveal>
          <FAQSection />
        </Reveal>

        {/* FOOTER */}
        <Reveal>
          <LandingFooter />
        </Reveal>
      </div>
    </>
  )
}
