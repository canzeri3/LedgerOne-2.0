'use client'

import { useState } from 'react'
import { L1Nightsky, L1Grain, L1Icon, L1Footer } from '@/components/ledgerone'

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="l1-section-head">
      <span className="l1-section-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  )
}

function ContactHeader() {
  return (
    <section className="l1-pageheader cx-head">
      <div className="l1-pageheader-aurora" />
      <div className="l1-wrap">
        <div className="l1-pageheader-inner">
          <div>
            <div className="l1-pageheader-eyebrow">Contact</div>
            <h1>Talk to the desk.</h1>
          </div>
          <p className="lead">
            Walkthroughs, onboarding, migrations, and serious questions about
            the engine and the framework. We answer every one — and we don&apos;t
            do mass mail.
          </p>
        </div>
        <div className="cx-headmeta">
          <div className="cell">
            <span className="k">Response time</span>
            <span className="v">Within one business day</span>
          </div>
          <div className="cell">
            <span className="k">Coverage</span>
            <span className="v"><span className="dot" />24h · 5 days · pager on weekends</span>
          </div>
          <div className="cell">
            <span className="k">Desks</span>
            <span className="v">Montreal, Canada</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function ContactForm() {
  const [topic, setTopic] = useState('walkthrough')
  const [size, setSize] = useState('individual')
  const [sent, setSent] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [note, setNote] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSent(true)
  }

  if (sent) {
    return (
      <div className="cx-sent">
        <div className="seal"><L1Icon name="check" size={28} /></div>
        <h3>Your message is in the queue.</h3>
        <p>
          We respond within one business day. Walkthroughs are typically
          scheduled inside 48 hours — we&apos;ll arrive with the framework ready
          to map to your risk profile and capital.
        </p>
        <button className="reset" onClick={() => { setSent(false); setName(''); setEmail(''); setOrg(''); setNote('') }}>
          Send another <L1Icon name="arrowRight" size={14} />
        </button>
      </div>
    )
  }

  return (
    <form className="cx-form" onSubmit={submit}>
      <div className="cx-row">
        <div className="cx-field">
          <label>Reason for contact</label>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="walkthrough">A platform walkthrough</option>
            <option value="migration">Migration help</option>
            <option value="enterprise">Enterprise / SOC&nbsp;2</option>
            <option value="media">Media or research</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div className="cx-field">
          <label>Investor type</label>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="individual">Individual / long-term</option>
            <option value="hnw">Active investor / HNW</option>
            <option value="office">Family office · advisor</option>
            <option value="treasury">New allocator</option>
            <option value="fund">Fund / RIA</option>
          </select>
        </div>
      </div>

      <div className="cx-row">
        <div className="cx-field">
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Full name" required />
        </div>
        <div className="cx-field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@domain.com" required />
        </div>
      </div>

      <div className="cx-field">
        <label>Organization <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-muted)' }}>(optional)</span></label>
        <input value={org} onChange={(e) => setOrg(e.target.value)} type="text" placeholder="Firm, fund, or family office" />
      </div>

      <div className="cx-field">
        <label>Tell us a little</label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Time horizon, sleeve structure, custody you use today, what you're hoping the platform replaces…"
          required
        />
      </div>

      <div className="cx-form-foot">
        <div className="note"><span className="dot" />Replied to within one business day · No mass mail</div>
        <button type="submit" className="cx-submit">
          Send message <L1Icon name="arrowRight" size={15} />
        </button>
      </div>
    </form>
  )
}

function ContactInfo() {
  const channels: { ic: 'mail' | 'shield'; addr: string; purpose: string }[] = [
    { ic: 'mail', addr: 'info@ledgerone.app', purpose: 'General · Onboarding · Accounts' },
    { ic: 'shield', addr: 'support@ledgerone.app', purpose: 'Platform · Custody · API' },
  ]
  const status = ['Core platform', 'Custody read-only ingest', 'Reporting & exports', 'Agent · v4']

  return (
    <div className="cx-info-col">
      <div className="cx-block">
        <span className="cx-block-label">Direct channels</span>
        <div className="cx-channels">
          {channels.map((c) => (
            <a key={c.addr} className="cx-channel" href={'mailto:' + c.addr}>
              <span className="ic"><L1Icon name={c.ic} size={18} /></span>
              <span className="cx-channel-text">
                <span className="addr">{c.addr}</span>
                <span className="purpose">{c.purpose}</span>
              </span>
            </a>
          ))}
        </div>
      </div>

      <div className="cx-block">
        <span className="cx-block-label">Offices</span>
        <div className="cx-offices">
          <div className="cx-office">
            <div>
              <div className="city">Montreal</div>
            </div>
            <div className="tz">GMT−05<br />09:00–18:00</div>
          </div>
        </div>
      </div>

      <div className="cx-block">
        <span className="cx-block-label">System status</span>
        <div className="cx-status">
          {status.map((l) => (
            <div key={l} className="cx-status-row">
              <span className="l">{l}</span>
              <span className="s"><span className="dot" />Operational</span>
            </div>
          ))}
        </div>
        <a className="cx-status-link" href="#">status.ledgerone.app <L1Icon name="arrowRight" size={13} /></a>
      </div>
    </div>
  )
}

function ContactBody() {
  return (
    <section className="l1-wrap cx-body">
      <div className="cx-desk">
        <div className="cx-form-col">
          <div className="cx-form-head">
            <span className="cx-eyebrow">Send a note</span>
            <h2>Tell us what you&apos;re solving for.</h2>
            <p>A few lines is plenty. The more context you give, the more tailored the walkthrough.</p>
          </div>
          <ContactForm />
        </div>
        <ContactInfo />
      </div>
    </section>
  )
}

const FAQS = [
  { q: 'Is LedgerOne a broker or exchange?', a: 'No. LedgerOne is a systematic allocation engine. We operate according to the rules and parameters you define — never on discretion, never reactively. We do not run a market, take the other side of your positions, or trade against your book.' },
  { q: 'How does the engine actually deploy capital?', a: "You provide a risk profile, a capital amount, and the digital assets you want exposure to. The engine translates that into a live framework — bands, deployment ladders, realization tranches, and a macro-cycle overlay — and runs it through scoped credentials at the venues you've selected. It does not automate trades inside your exchange — every action is surfaced as a rules-based instruction you keep control of, and recorded." },
  { q: 'Who is LedgerOne for, specifically?', a: "Long-term individual allocators, frustrated active investors who want to stop making moment-to-moment decisions, family offices and advisors managing client crypto exposure, and sophisticated investors entering digital assets for the first time. The common thread: capital that wants a system, not a screen." },
  { q: 'What does pricing look like?', a: 'Three tiers — Individual, Multi-sleeve, and Enterprise (including SOC 2 attestations, multisig governance, and dedicated support). Pricing is by sleeve count and venue count, not by AUM. We share the full grid on the walkthrough.' },
  { q: 'Can I migrate my historical data?', a: 'Yes. We import from CSV exports, on-chain history, and most exchange APIs going back to first activity. Reconciliation is part of onboarding — most clients complete it inside one week, before the engine goes live.' },
  { q: 'Do you offer an API?', a: 'Yes — read access to your framework, executions, and reports. Webhook events for deployments, realizations, and rule firings. Programmable rule definitions via the DSL. Documentation is provided to enterprise customers on contract.' },
]

function ContactFaq() {
  return (
    <section className="l1-section" style={{ position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="Quick answers" title="What people ask before booking." />
        <div className="l1-faq" style={{ maxWidth: 880, marginInline: 'auto' }}>
          {FAQS.map((f, i) => (
            <details key={i} open={i === 0 ? true : undefined}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function ContactPage() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <ContactHeader />
      <ContactBody />
      <ContactFaq />
      <L1Footer />
    </>
  )
}
