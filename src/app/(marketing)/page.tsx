'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { L1Nightsky, L1Grain, L1Icon, L1KendoAgent, L1ClosingCTA, L1Footer, L1HeroLaptop } from '@/components/ledgerone'
import { supabaseBrowser } from '@/lib/supabaseClient'

function DashboardLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const [href, setHref] = useState('/login')
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setHref(data.session ? '/dashboard' : '/login')
    })
  }, [])
  return <Link href={href} className={className}>{children}</Link>
}

/* ---- Hero -------------------------------------------------- */
function Hero() {
  return (
    <section className="l1-hero">
      <div className="l1-hero-aurora" />
      <div className="l1-hero-aurora2" />
      <div className="l1-wrap l1-hero-inner">
        <span className="l1-tag" style={{ marginBottom: 24, display: 'inline-block' }}>
          PLANNER · TRACKER
        </span>
        <h1 className="l1-hero-title">
          Institutional discipline<br />
          <span style={{ color: 'rgb(251,255,230)' }}></span>for personal crypto investing.
        </h1>
        <p className="l1-hero-sub">
          LedgerOne helps investors track allocations, plan portfolio decisions,
          and manage their investment process with clarity, structure, and discipline.
        </p>
        <div className="l1-hero-cta">
          <Link href="/pricing" className="l1-btn l1-btn-glass l1-btn-lg">
            Request access
          </Link>
          <DashboardLink className="l1-btn l1-btn-glass l1-btn-lg">
            Dashboard
            <L1Icon name="arrowUpRight" size={14} />
          </DashboardLink>
        </div>
      </div>

      <L1HeroLaptop />
    </section>
  )
}

/* ---- Logo strip ------------------------------------------- */
function LogoStrip() {
  return (
    <div className="l1-strip" style={{ position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap l1-strip-row" style={{ maxWidth: 1080 }}>
        <div className="l1-strip-label"></div>
        <div className="l1-strip-marks">
          <span style={{ width: 162 }}>Any Portfolio Size</span>
          <span style={{ width: 226 }}>Long-Term Investments</span>
          <span style={{ width: 111 }}>Rule Based</span>
          <span>Discipline</span>
          <span style={{ width: 203 }}>Risk Management</span>
        </div>
      </div>
    </div>
  )
}

/* ---- Feature highlights ----------------------------------- */
const FEATURES = [
  {
    tag: 'Structured deployment',
    icon: 'book' as const,
    title: 'Buys into weakness. Not into momentum.',
    body: 'The engine identifies structured entry opportunities during market weakness — accumulating into volatility, not chasing it.',
    foot: 'Daily evaluation · multi-asset',
  },
  {
    tag: 'Staged realization',
    icon: 'layers' as const,
    title: 'Monetizes strength. In stages, not in panic.',
    body: 'Take profits in measured stages as prices rise — not all at once. And when the broader market overheats, an extra layer steps in to protect the whole portfolio.',
    foot: 'Multi-strategy · macro overlay',
  },
  {
    tag: 'Rules-based execution',
    icon: 'shield' as const,
    title: 'Rules you set once. Executed every day.',
    body: 'Set your rules up front — how much to hold, when to buy, when to take profits. The system follows them every day. No exceptions, no second-guessing.',
    foot: '12 templates · custom DSL',
  },
]

function FeatureHighlights() {
  return (
    <section className="l1-section" style={{ position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <div className="l1-section-head">
          <span className="l1-section-eyebrow">The solution</span>
          <h2>A rules engine that never blinks.</h2>
          <p>
            LedgerOne converts your capital and risk tolerance into a fully automated allocation
            framework across digital assets. The engine determines when to accumulate, when to
            realize, and how to compound into future cycles.
          </p>
        </div>
        <div className="l1-feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="l1-feat">
              <div className="l1-feat-icon">
                <L1Icon name={f.icon} />
              </div>
              <span className="l1-tag" style={{ alignSelf: 'flex-start' }}>{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className="l1-feat-foot">{f.foot}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- How it works ----------------------------------------- */
const STEPS = [
  {
    n: '壹',
    tag: 'STEP 01',
    title: 'Define your risk profile.',
    body: "Pick conservative, balanced, or growth — and the capital you'd like the engine to deploy. Select the digital assets you want exposure to. That's the human input. Everything downstream is systematic.",
    tags: ['Risk profile', 'Allocation amount', 'Asset selection'],
  },
  {
    n: '貳',
    tag: 'STEP 02',
    title: 'LedgerOne configures your engine.',
    body: 'Your answers turn into a personal playbook — how much to hold, when to buy, when to sell, and how to react when the broader market shifts. Tuned to you, ready in seconds.',
    tags: ['Personalized framework', 'Pre-modeled cycles', 'Live in seconds'],
  },
  {
    n: '參',
    tag: 'STEP 03',
    title: 'The engine executes. You monitor.',
    body: 'Capital is deployed into structured weakness, realized through staged exits, and recycled into the next cycle — every day, without intervention. You watch the plan unfold.',
    tags: ['Rules-based', 'Non-discretionary', 'Auditable'],
  },
  {
    n: '肆',
    tag: 'STEP 04',
    title: 'Compound across cycles.',
    body: 'Realized gains feed back into the framework. Cash positions stay ready for the next accumulation zone. The system operates across cycles, not headlines.',
    tags: ['Multi-cycle', 'Compounding', 'Multi-asset'],
  },
]

function HowItWorks() {
  return (
    <section className="l1-section" style={{ paddingTop: 40, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <div className="l1-section-head">
          <span className="l1-section-eyebrow">How it begins</span>
          <h2>Four inputs. One disciplined engine.</h2>
          <p>
            You define risk, capital, and the assets you want exposure to. LedgerOne does the rest —
            configured once, run forever, compounding across cycles.
          </p>
        </div>
        <div className="l1-flow">
          {STEPS.map((s) => (
            <div key={s.n} className="l1-flow-step">
              <div className="seal" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{s.n}</div>
              <span className="l1-tag" style={{ marginBottom: 14, display: 'inline-block' }}>{s.tag}</span>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
              <div className="tag-row">
                {s.tags.map((t) => <span key={t}>{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- Agent workflow --------------------------------------- */
function AgentWorkflow() {
  return (
    <section className="l1-section" style={{ paddingBottom: 24, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <div className="l1-agent-block">
          <div>
            <L1KendoAgent caption="AGENT · DISCIPLINE · PRECISION" />
          </div>
          <div className="copy">
            <span className="l1-tag">Systematic execution</span>
            <h2>An engine that runs your framework. Not your reactions.</h2>
            <p>
              LedgerOne&apos;s agent reads your risk profile, runs the allocation framework, and
              reports what it did — and why. Deployments, staged realizations, and macro-overlay
              activations arrive as records, not as requests.
            </p>
            <ul className="l1-agent-bullets">
              <li>
                <span>
                  <b>Structured deployment.</b> Capital is added into weakness across calibrated
                  tranches — never chasing strength.
                </span>
              </li>
              <li>
                <span>
                  <b>Staged realization.</b> Multiple sell strategies run in parallel; a macro
                  overlay activates when conditions extend.
                </span>
              </li>
              <li>
                <span>
                  <b>Framework-aware research.</b> Briefings scoped to the assets in your
                  allocation. No firehose, no noise.
                </span>
              </li>
              <li>
                <span>
                  <b>Tax-lot intelligence.</b> Every realization arrives with its lot-by-lot
                  consequence already computed.
                </span>
              </li>
            </ul>
            <Link href="/platform" className="l1-btn l1-btn-ghost">
              How the engine works <L1Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- Use case preview ------------------------------------- */
const CASES = [
  {
    persona: 'LONG-TERM · INDIVIDUAL',
    title: 'The long-term allocator.',
    body: "You've made the decision to allocate. What you haven't solved is execution — when to buy, when to realize, what happens at a 40% drawdown. LedgerOne answers all of it the moment you set your parameters.",
    v: 'Zero',
    l: 'Manual interventions',
  },
  {
    persona: 'CRYPTO-NATIVE · ACTIVE',
    title: 'The frustrated active investor.',
    body: "You know the assets. You've survived the cycles. What erodes returns is moment-to-moment decision-making. LedgerOne replaces those decisions with a framework that does not react emotionally. Ever.",
    v: '0',
    l: 'Reactive trades',
  },
  {
    persona: 'FAMILY OFFICE · ADVISOR',
    title: 'The family office and advisor.',
    body: 'Your clients want exposure. Your compliance team wants controls. LedgerOne is a rules-based, auditable framework with explicit governance — defensible to a board, scaleable across mandates.',
    v: 'SOC 2',
    l: 'Type II governance',
  },
]

function UseCasePreview() {
  return (
    <section
      className="l1-section"
      style={{ paddingTop: 24, paddingBottom: 40, position: 'relative', zIndex: 1 }}
    >
      <div className="l1-wrap">
        <div className="l1-section-head">
          <span className="l1-section-eyebrow">Built for</span>
          <h2>Investors who think in cycles, not candles.</h2>
          <p>
            LedgerOne is not for traders. It is for investors who think across cycles — and want
            institutional architecture to act on that view.
          </p>
        </div>
        <div className="l1-cases">
          {CASES.map((c) => (
            <Link key={c.persona} href="/use-cases" className="l1-case">
              <span className="persona">{c.persona}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <div className="l1-case-stat">
                <span className="v">{c.v}</span>
                <span className="l">{c.l}</span>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <Link href="/use-cases" className="l1-btn l1-btn-ghost l1-btn-lg">
            All use cases <L1Icon name="arrowRight" size={14} />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ---- Trust block ------------------------------------------ */
const TRUST_CELLS = [
  {
    ic: 'shield' as const,
    t: 'Rules-based, non-discretionary',
    b: 'Every action the engine takes is determined by the framework you configured. No overrides, no judgement calls, no exceptions — ever.',
  },
  {
    ic: 'cpu' as const,
    t: 'Institutional architecture',
    b: 'The same systematic infrastructure used by funds and family offices, brought to personal scale — built for the long term, not the news cycle.',
  },
  {
    ic: 'audit' as const,
    t: 'Auditable, end-to-end',
    b: 'Every deployment, realization, and rule firing is logged with provenance. Export the full record whenever your CPA, compliance team, or trustees ask.',
  },
  {
    ic: 'eye' as const,
    t: 'Quarterly attestations',
    b: 'SOC 2 Type II. Independent attestations of platform integrity, published every quarter. No proprietary trading. No conflicts of interest.',
  },
]

function TrustBlock() {
  return (
    <section className="l1-wrap" style={{ paddingBottom: 48, position: 'relative', zIndex: 1 }}>
      <div className="l1-trust">
        <div className="copy">
          <span className="l1-tag">Architecture · trust · governance</span>
          <h2>Institutional architecture. Personal scale.</h2>
          <p>
            LedgerOne brings the rigor of an institutional desk to individual investing — systematic
            execution, auditable records, governance documentation, and a framework that doesn&apos;t
            make discretionary calls. Not under stress. Not ever.
          </p>
        </div>
        <div className="l1-trust-grid">
          {TRUST_CELLS.map((c) => (
            <div key={c.t} className="l1-trust-cell">
              <div className="ic">
                <L1Icon name={c.ic} size={26} />
              </div>
              <div className="t">{c.t}</div>
              <div className="b">{c.b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- Chrome divider --------------------------------------- */
function ChromeDivider() {
  return (
    <div className="l1-wrap" style={{ position: 'relative', zIndex: 1 }}>
      <div className="l1-chrome" />
    </div>
  )
}

/* ---- Page -------------------------------------------------- */
export default function HomePage() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <Hero />
      <LogoStrip />
      <FeatureHighlights />
      <ChromeDivider />
      <HowItWorks />
      <AgentWorkflow />
      <UseCasePreview />
      <ChromeDivider />
      <TrustBlock />
      <L1ClosingCTA
        title="Stop reacting. Start compounding."
        body="Risk profile in. Capital in. The engine deploys, realizes, and compounds across cycles — without intervention."
      />
      <L1Footer />
    </>
  )
}
