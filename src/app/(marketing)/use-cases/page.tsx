'use client'

import Link from 'next/link'
import { L1Nightsky, L1Grain, L1Icon, L1ClosingCTA, L1Footer } from '@/components/ledgerone'

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="l1-section-head">
      <span className="l1-section-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
    </div>
  )
}

function ChromeDivider() {
  return (
    <div className="l1-wrap" style={{ position: 'relative', zIndex: 1 }}>
      <div className="l1-chrome" />
    </div>
  )
}

function CasesHeader() {
  return (
    <section className="l1-pageheader">
      <div className="l1-pageheader-aurora" />
      <div className="l1-wrap">
        <div className="l1-pageheader-inner" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <div className="l1-pageheader-eyebrow">Use cases · 2026</div>
            <h1>Built for investors who think in cycles, not candles.</h1>
          </div>
          <p className="lead">
            LedgerOne is built for the long-horizon side of crypto — investors
            who want institutional execution at personal scale, and a workspace
            that reflects how they already think about capital.
          </p>
        </div>
      </div>
    </section>
  )
}

function FeaturedCase() {
  return (
    <section className="l1-section" style={{ paddingTop: 40, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead
          eyebrow="Featured · long-horizon individual allocator"
          title="Vincent: a four-sleeve crypto allocation, run for six years."
          body="Vincent bought his first crypto in 2017, rode it up, watched it fall 80%, and sold at the bottom — twice. The conviction was never the problem; the discretion was. After six years of spreadsheets, calendar reminders, and 2am decisions he'd regret by morning, he wanted the strategy out of his head and into a system that wouldn't flinch."
        />
        <div className="l1-featured">
          <div className="quote">
            <div className="mark">&ldquo;</div>
            <div className="body">
              I had the conviction. What I didn&apos;t have was systematic
              execution — cycle after cycle, without second-guessing myself
              at 2am about whether to sell. LedgerOne resolved that the
              week I configured it.
            </div>
            <div className="who">
              <div className="avatar">VC</div>
              <div>
                <div className="name">Vincent Canzeri</div>
                <div className="role">Independent allocator · Montreal</div>
              </div>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="l">Alerts</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 4px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, color: 'var(--color-success)', border: '1px solid var(--color-success)', background: 'color-mix(in oklab, var(--color-success) 12%, transparent)' }}>Buy</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, color: 'var(--color-danger)', border: '1px solid var(--color-danger)', background: 'color-mix(in oklab, var(--color-danger) 12%, transparent)' }}>Sell</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, color: 'var(--color-accent-purple)', border: '1px solid var(--color-accent-purple)', background: 'rgba(94, 84, 192, 0.12)' }}>New Cycle</span>
              </div>
              <div className="n">Once his framework is active, the engine fires these the moment a rule triggers — a deployment, a realization, or a shift into a new macro cycle. He acts on signals, not screens.</div>
            </div>
            <div className="stat">
              <div className="l">Discretionary trades</div>
              <div className="v">0</div>
              <div className="n">Every deployment and realization driven by the framework, not by mood.</div>
            </div>
            <div className="stat">
              <div className="l">Operating hours / mo.</div>
              <div className="v pos">−80%</div>
              <div className="n">Time-on-portfolio cut by nearly two-thirds.</div>
            </div>
            <div className="stat">
              <div className="l">Active sleeves</div>
              <div className="v">16</div>
              <div className="n">Each with its own bands, deployment ladder, and realization tranches.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const PERSONAS = [
  {
    ix: '01 · LONG-TERM',
    title: 'The long-term allocator.',
    body: "You've made the decision to allocate. What you haven't solved is execution — when to buy, when to take profits, what happens when markets fall 40%. LedgerOne answers all of it the moment you set your parameters.",
    stats: [{ v: '4Y+', l: 'Horizon' }, { v: 'Zero', l: 'Manual calculations' }, { v: 'Auto', l: 'Drawdown response' }],
  },
  {
    ix: '02 · ACTIVE',
    title: 'The frustrated active investor.',
    body: "You know the assets. You've survived the cycles. What erodes returns is moment-to-moment decision-making — buying too high, selling too early, holding too long. LedgerOne replaces those decisions with a framework that does not react emotionally. Ever.",
    stats: [{ v: '0', l: 'Reactive trades' }, { v: 'Daily', l: 'Evaluation' }, { v: 'Multi-asset', l: 'Coverage' }],
  },
  {
    ix: '03 · FAMILY OFFICE & INDIVIDUAL',
    title: 'The family office, advisor, and individual.',
    body: 'From family offices to household investors, LedgerOne brings the same discipline to every scale. Clients want exposure; advisors want controls — and individuals want structure they can trust. LedgerOne provides all of it: a systematic, auditable framework with defined rules, explicit state, and clear documentation.',
    stats: [{ v: 'SOC 2', l: 'Type II' }, { v: '100%', l: 'Auditable' }, { v: 'Per-client', l: 'Mandates' }],
  },
  {
    ix: '04 · NEW ALLOCATOR',
    title: 'The new digital-asset allocator.',
    body: "You don't need to understand every market dynamic. You need a structured starting point. LedgerOne configures your engine from a single risk and capital input — and you learn the rhythm of the market through the results, not the stress.",
    stats: [{ v: '1 input', l: 'Risk profile' }, { v: 'Auto', l: 'Configuration' }, { v: 'Cycle', l: 'Education' }],
  },
]

function PersonaGrid() {
  return (
    <section className="l1-section" style={{ paddingTop: 32, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="Who it's for" title="Four ways the engine earns its keep." body="The shape of the framework adapts. The discipline at its core does not." />
        <div className="l1-cases-grid">
          {PERSONAS.map((p, i) => (
            <div key={i} className="l1-case-card">
              <span className="ix">{p.ix}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <div className="stats">
                {p.stats.map((s, j) => (
                  <div key={j} className="cell">
                    <div className="v">{s.v}</div>
                    <div className="l">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const MINI_CASES = [
  { seg: 'INDIVIDUAL · 7Y', title: 'From scattered notes to one clear record.', body: 'A solo investor logged years of buys and sells across several exchanges into one place — finally seeing cost basis, gains, and a plan in a single view.', res: '7 years of history, reconciled.' },
  { seg: 'HOUSEHOLD · MULTI-ASSET', title: 'One record the whole household agrees on.', body: "A family cut quarterly reviews from six hours to ninety minutes — one shared record of every position, decision, and rule, with no more debating which spreadsheet was right.", res: '−74% time-to-review.' },
  { seg: 'ADVISOR · FAMILY OFFICE', title: 'Every recommendation, documented and explainable.', body: 'An advisor pairs each allocation decision with the LedgerOne framework — explicit rules, expected behaviour, and a full audit trail clients can follow.', res: 'Client confidence, on the record.' },
  { seg: 'QUANT · INDIVIDUAL', title: 'Frameworks that survive the next bear.', body: 'An ex-quant rebuilt his rule set against eight years of data. Three rules made the cut. Two were removed. None were guessed.', res: 'Sharpe +0.42 vs. prior set.' },
  { seg: 'OPS · FAMILY OFFICE', title: 'Tax season, but quiet.', body: 'Per-lot HIFO accounting handed to the CPA as one PDF. The CPA called back with two questions. There used to be twenty.', res: '2 follow-ups vs. ~20.' },
  { seg: 'NEW · ALLOCATOR', title: 'First crypto allocation. No drama.', body: 'A new digital-asset investor entered with a single balanced profile and a fixed capital amount. The engine handled deployment across two months of weakness. They watched, not managed.', res: 'Zero manual trades in 90 days.' },
]

function MiniCases() {
  return (
    <section className="l1-section" style={{ paddingTop: 0, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="In the field" title="The smaller wins, recorded for the record." />
        <div className="l1-mini-cases">
          {MINI_CASES.map((c, i) => (
            <div key={i} className="l1-mini-case">
              <span className="seg">{c.seg}</span>
              <h4>{c.title}</h4>
              <p>{c.body}</p>
              <div className="res">↗ {c.res}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const TESTIMONIALS = [
  { q: "The execution alone justified the migration. We finally have a record that doesn't depend on memory — or on someone's mood that morning.", n: 'Marcus Aldridge', r: 'Family portfolio · Canada', a: 'MA' },
  { q: "It's the only crypto tool I've used that doesn't try to make me trade more. The opposite, actually.", n: 'Yuki Tanaka', r: 'Investor · Tokyo', a: 'YT' },
  { q: "Our treasury proposals exit LedgerOne with the framework attached. Governance picked it up immediately — nobody asks for picks anymore, they ask about the rule set.", n: 'Devin Reyes', r: 'Small investing group · USA', a: 'DR' },
]

function TestimonialRow() {
  return (
    <section className="l1-section" style={{ paddingTop: 0, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="Heard from the desk" title="What operators actually say." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', padding: '36px 32px', display: 'flex', flexDirection: 'column', gap: 20, minHeight: 280, borderRadius: 2 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 0.5, color: 'var(--color-accent-purple)', height: 14 }}>&ldquo;</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, lineHeight: 1.45, color: 'var(--color-text-primary)', flex: 1 }}>{t.q}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--color-accent-purple)' }}>{t.a}</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>{t.n}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)', letterSpacing: '0.04em', marginTop: 2 }}>{t.r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function UseCasesPage() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <CasesHeader />
      <ChromeDivider />
      <FeaturedCase />
      <PersonaGrid />
      <MiniCases />
      <TestimonialRow />
      <L1ClosingCTA
        title="Find your use case."
        body="We'll walk through the framework, risk profile, and reporting that match how you already invest — and the migration plan to bring your history along."
      />
      <L1Footer />
    </>
  )
}
