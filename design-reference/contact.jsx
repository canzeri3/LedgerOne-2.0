/* =============================================================
   LedgerOne · Contact
   ============================================================= */
const { useState: cUseState } = React;

function ContactHeader() {
  return (
    <section className="l1-pageheader" data-screen-label="01 Contact header">
      <div className="l1-pageheader-aurora" />
      <div className="l1-wrap">
        <div className="l1-pageheader-inner">
          <div>
            <div className="l1-pageheader-eyebrow">Contact · operations 24/7</div>
            <h1>Talk to the desk.</h1>
          </div>
          <p className="lead">
            Walkthroughs, onboarding, migrations, and serious questions about
            the engine and the framework. We answer all of them. We don't do
            mass mail.
          </p>
        </div>
      </div>
    </section>);

}

function ContactForm() {
  const [topic, setTopic] = cUseState('walkthrough');
  const [size, setSize] = cUseState('individual');
  const [sent, setSent] = cUseState(false);
  const [name, setName] = cUseState('');
  const [email, setEmail] = cUseState('');
  const [note, setNote] = cUseState('');

  const submit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div className="l1-form" style={{ minHeight: 460, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, border: '1px solid var(--color-accent-purple)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent-purple)', marginBottom: 8 }}>
          <L1Icon name="check" size={28} />
        </div>
        <h3 style={{ margin: 0 }}>Your message is in the queue.</h3>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14, maxWidth: 340 }}>
          We respond within one business day. Walkthroughs are typically
          scheduled inside 48 hours. We'll bring the framework ready to map
          to your risk profile and capital.
        </p>
        <button onClick={() => {setSent(false);setName('');setEmail('');setNote('');}} className="l1-btn l1-btn-ghost" style={{ marginTop: 12 }}>
          Send another <L1Icon name="arrowRight" size={14} />
        </button>
      </div>);

  }

  return (
    <form className="l1-form" onSubmit={submit}>
      <h3>Send a note</h3>

      <div className="l1-field">
        <label>I'm here for</label>
        <div className="l1-pill-row">
          {[
          { id: 'walkthrough', l: 'A platform walkthrough' },
          { id: 'migration', l: 'Migration help' },
          { id: 'enterprise', l: 'Enterprise / SOC 2' },
          { id: 'media', l: 'Media or research' },
          { id: 'other', l: 'Something else' }].
          map((p) =>
          <span key={p.id} className={'l1-pill ' + (topic === p.id ? 'on' : '')} onClick={() => setTopic(p.id)}>{p.l}</span>
          )}
        </div>
      </div>

      <div className="l1-field">
        <label>Investor type</label>
        <div className="l1-pill-row">
          {[
          { id: 'individual', l: 'Individual / long-term' },
          { id: 'hnw', l: 'Active investor / HNW' },
          { id: 'office', l: 'Family office · advisor' },
          { id: 'treasury', l: 'New allocator' },
          { id: 'fund', l: 'Fund / RIA' }].
          map((p) =>
          <span key={p.id} className={'l1-pill ' + (size === p.id ? 'on' : '')} onClick={() => setSize(p.id)}>{p.l}</span>
          )}
        </div>
      </div>

      <div className="row">
        <div className="l1-field">
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Full name" required />
        </div>
        <div className="l1-field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@domain.com" required />
        </div>
      </div>

      <div className="l1-field">
        <label>Tell us a little</label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder="Time horizon, sleeve structure, custody you use today, what you're hoping the platform replaces…"
          required />
        
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>
          We reply within one business day · No mass mail
        </div>
        <button type="submit" className="l1-btn l1-btn-primary">
          Send <L1Icon name="arrowRight" size={14} />
        </button>
      </div>
    </form>);

}

function ContactSidebar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="l1-side-card">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-accent-purple)', textTransform: 'uppercase' }}>Direct lines</div>
        <h4>The desk, by channel.</h4>
        <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
          <a style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'center', color: 'var(--color-text-primary)', textDecoration: 'none', padding: '12px 14px', border: '1px solid var(--color-border)' }} href="mailto:desk@ledgerone.app">
            <L1Icon name="mail" size={18} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14 }}>info@ledgerone.app</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>General · Onboarding · Accounts</div>
            </div>
          </a>
          <a style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'center', color: 'var(--color-text-primary)', textDecoration: 'none', padding: '12px 14px', border: '1px solid var(--color-border)' }} href="mailto:enterprise@ledgerone.app">
            <L1Icon name="shield" size={18} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14 }}>support@ledgerone.app</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>How to · Custody · API</div>
            </div>
          </a>
          <a style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'center', color: 'var(--color-text-primary)', textDecoration: 'none', padding: '12px 14px', border: '1px solid var(--color-border)' }} href="mailto:press@ledgerone.app">
            <L1Icon name="globe" size={18} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14 }}>alerts@ledgerone.app</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>Receive · Alert · Emails</div>
            </div>
          </a>
        </div>
      </div>

      <div className="l1-side-card">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-accent-purple)', textTransform: 'uppercase' }}>Offices</div>
        <h4>Two cities. One operating window.</h4>
        <div className="l1-offices">
          <div className="l1-office">
            <div className="city">New York</div>
            <div className="addr">110 Wall Street, 4F<br />New York, NY 10005</div>
            <div className="tz">GMT−05 · 09:00–18:00</div>
          </div>
          <div className="l1-office">
            <div className="city">Singapore</div>
            <div className="addr">8 Marina View, 27F<br />Asia Square · 018960</div>
            <div className="tz">GMT+08 · 09:00–18:00</div>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
          Operations cover · 24h · 5 days · pager on weekends
        </div>
      </div>

      <div className="l1-side-card">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-accent-purple)', textTransform: 'uppercase' }}>Status</div>
        <h4>Platform operations.</h4>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
          { l: 'Core platform', s: 'Operational' },
          { l: 'Custody read-only ingest', s: 'Operational' },
          { l: 'Reporting & exports', s: 'Operational' },
          { l: 'Agent · v4', s: 'Operational' }].
          map((r, i) =>
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{r.l}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-success)', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-success)' }} />
                {r.s}
              </span>
            </div>
          )}
        </div>
        <a style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-purple)', marginTop: 6, textDecoration: 'none' }}>status.ledgerone.app →</a>
      </div>
    </div>);

}

function ContactBody() {
  return (
    <section className="l1-wrap" data-screen-label="02 Contact body">
      <div className="l1-contact">
        <ContactForm />
        <ContactSidebar />
      </div>
    </section>);

}

function ContactFaq() {
  const faqs = [
  {
    q: "Is LedgerOne a broker or exchange?",
    a: "No. LedgerOne is a systematic allocation engine. We operate according to the rules and parameters you define — never on discretion, never reactively. We do not run a market, take the other side of your positions, or trade against your book."
  },
  {
    q: "How does the engine actually deploy capital?",
    a: "You provide a risk profile, a capital amount, and the digital assets you want exposure to. The engine translates that into a live framework — bands, deployment ladders, realization tranches, and a macro-cycle overlay — and runs it through scoped credentials at the venues you've selected. It does not automate trades inside your exchange — every action is surfaced as a rules-based instruction you keep control of, and recorded."
  },
  {
    q: "Who is LedgerOne for, specifically?",
    a: "Long-term individual allocators, frustrated active investors who want to stop making moment-to-moment decisions, family offices and advisors managing client crypto exposure, and sophisticated investors entering digital assets for the first time. The common thread: capital that wants a system, not a screen."
  },
  {
    q: "What does pricing look like?",
    a: "Three tiers — Individual, Multi-sleeve, and Enterprise (including SOC 2 attestations, multisig governance, and dedicated support). Pricing is by sleeve count and venue count, not by AUM. We share the full grid on the walkthrough."
  },
  {
    q: "Can I migrate my historical data?",
    a: "Yes. We import from CSV exports, on-chain history, and most exchange APIs going back to first activity. Reconciliation is part of onboarding — most clients complete it inside one week, before the engine goes live."
  },
  {
    q: "Do you offer an API?",
    a: "Yes — read access to your framework, executions, and reports. Webhook events for deployments, realizations, and rule firings. Programmable rule definitions via the DSL. Documentation is provided to enterprise customers on contract."
  }];

  return (
    <section className="l1-section" data-screen-label="03 FAQ">
      <div className="l1-wrap">
        <L1SectionHead
          eyebrow="Quick answers"
          title="What people ask before booking." />
        
        <div className="l1-faq" style={{ maxWidth: 880, marginInline: 'auto' }}>
          {faqs.map((f, i) =>
          <details key={i} {...i === 0 ? { open: true } : {}}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          )}
        </div>
      </div>
    </section>);

}

function ContactApp() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <L1Nav active="contact" />
      <ContactHeader />
      <L1Chrome />
      <ContactBody />
      <ContactFaq />
      <L1Footer />
    </>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<ContactApp />);