'use client'

import { useState } from 'react'
import { L1Nightsky, L1Grain, L1Icon, L1ClosingCTA, L1Footer } from '@/components/ledgerone'

/* ---- Shared ---- */
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

/* ---- Page header ---- */
function PlatformHeader() {
  return (
    <section className="l1-pageheader">
      <div className="l1-pageheader-aurora" />
      <div className="l1-wrap">
        <div className="l1-pageheader-inner">
          <div>
            <div className="l1-pageheader-eyebrow">Platform · v4 · Live</div>
            <h1>Your allocation engine, configured to you.</h1>
          </div>
          <div className="l1-lead-col">
            <img
              className="l1-floating-icon"
              src="/app-icon-clean.png"
              alt="LedgerOne"
            />
            <p className="lead">
              LedgerOne&apos;s engine translates your parameters into a fully
              automated systematic framework — across any supported digital
              asset. You define the inputs. The system does the rest.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- Tab preview components ---- */
const GREEN = '#3ECFA4'
const RED = '#E2604E'
const AMBER = '#EFC435'
const PURP = '#9B8BFF'

function PrevLedger() {
  const groups = [
    { date: '5/31/2026', txns: [{ side: 'Sell', coin: 'ETHEREUM', qty: '4', price: '$3,000.00', total: '-$12,000.00' }] },
    { date: '5/23/2026', txns: [
      { side: 'Buy', coin: 'ETHEREUM', qty: '18.75', price: '$1800.00', total: '+$15,000.00' },
      { side: 'Buy', coin: 'BITCOIN', qty: '1.625', price: '$32,000.00', total: '+$52,000.00' },
      { side: 'Buy', coin: 'ETHEREUM', qty: '7.5', price: '$1200.00', total: '+$6,000.00' },
    ]},
    { date: '3/8/2026', txns: [{ side: 'Buy', coin: 'BITCOIN', qty: '0.05427809', price: '$74,864.10', total: '+$4,063.48' }] },
  ]
  const cols = '58px 1fr 86px 96px'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)' }}>Transactions</div>
        <div style={{ display: 'flex', gap: 7 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px', whiteSpace: 'nowrap', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--color-text-secondary)' }}>All coins <span style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>▾</span></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px', whiteSpace: 'nowrap', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--color-text-secondary)' }}>Date <span style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>▾</span></span>
        </div>
      </div>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)' }}>
          <span>Side</span><span>Coin</span><span style={{ textAlign: 'right' as const }}>Qty</span><span style={{ textAlign: 'right' as const }}>Total</span>
        </div>
        {groups.map((g, gi) => (
          <div key={gi}>
            <div style={{ padding: '9px 16px', background: 'var(--color-bg-base)', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>{g.date}</div>
            {g.txns.map((t, ti) => {
              const buy = t.side === 'Buy'
              const c = buy ? GREEN : RED
              const last = gi === groups.length - 1 && ti === g.txns.length - 1
              return (
                <div key={ti} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '13px 16px', borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
                  <span style={{ justifySelf: 'start', padding: '3px 11px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, color: c, background: buy ? 'rgba(62,207,164,0.10)' : 'rgba(226,96,78,0.10)', border: `1px solid ${buy ? 'rgba(62,207,164,0.32)' : 'rgba(226,96,78,0.34)'}` }}>{t.side}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-text-primary)' }}>{t.coin}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 3 }}>@ {t.price}</div>
                  </div>
                  <span style={{ textAlign: 'right' as const, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.qty}</span>
                  <span style={{ textAlign: 'right' as const, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: c, whiteSpace: 'nowrap' }}>{t.total}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function PrevAllocation() {
  const rows = [
    { lvl: 1, target: '$1,049.37', missing: '$4,440.97', act: true },
    { lvl: 2, target: '$918.20', missing: '$5,551.21', act: true },
    { lvl: 3, target: '$787.03', missing: '$6,939.02', act: true },
    { lvl: 4, target: '$655.86', missing: '$8,673.77', act: false },
    { lvl: 5, target: '$524.69', missing: '$10,842.22', act: false },
    { lvl: 6, target: '$393.51', missing: '$13,552.81', act: false },
  ]
  const cols = '30px 1fr 1fr 78px'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', padding: '13px 16px', marginBottom: 16, border: `1px solid rgba(239,196,53,0.32)`, background: 'rgba(239,196,53,0.05)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', color: AMBER }}><span style={{ width: 6, height: 6, borderRadius: 999, background: AMBER, boxShadow: `0 0 8px ${AMBER}` }} />Actionable now</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>3 alert rows</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>$16,931.20 <span style={{ color: 'var(--color-text-muted)' }}>remaining</span></span>
      </div>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)' }}>
          <span>Lvl</span><span>Target</span><span>Missing $</span><span style={{ textAlign: 'right' as const }}>Progress</span>
        </div>
        {rows.map((r, i) => {
          const c = r.act ? AMBER : 'var(--color-text-primary)'
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c }}>{r.lvl}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c }}>{r.target}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c }}>{r.missing}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' as const }}>
                <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--color-bg-elevated)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.act ? AMBER : 'var(--color-text-muted)', minWidth: 24, textAlign: 'right' as const }}>0%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrevRules() {
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Risk profile</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px', background: 'var(--color-bg-surface)', border: `1px solid var(--color-accent-purple-muted)`, borderRadius: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>Moderate</span>
          <span style={{ padding: '3px 9px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-accent-purple)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-accent-purple-muted)' }}>6 levels</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Sell Intensity</div>
          <div style={{ padding: '13px 16px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>Balanced Trim</span>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Coin Volatility</div>
          <div style={{ padding: '13px 16px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>Low</span>
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Total budget ($)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--color-text-muted)' }}>$</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--color-text-primary)' }}>50,000</span>
        </div>
      </div>
    </div>
  )
}

function PrevAgent() {
  const alerts = [
    { side: 'Buy', coin: 'AVAX' }, { side: 'Buy', coin: 'BCH' },
    { side: 'Buy', coin: 'BNB' }, { side: 'Buy', coin: 'TON' },
    { side: 'Sell', coin: 'AVAX' }, { side: 'Sell', coin: 'BTC' },
    { side: 'Sell', coin: 'ETH' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', padding: '13px 16px', marginBottom: 14, border: '1px solid rgba(239,196,53,0.32)', background: 'rgba(239,196,53,0.05)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: AMBER }}><span style={{ width: 6, height: 6, borderRadius: 999, background: AMBER, boxShadow: `0 0 8px ${AMBER}` }} />Actionable now</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>4 alert rows</span>
      </div>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 6, display: 'grid', gap: 2 }}>
        {alerts.map((a, i) => {
          const buy = a.side === 'Buy'
          const c = buy ? GREEN : RED
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 12px', borderRadius: 7 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: c, background: buy ? 'rgba(62,207,164,0.10)' : 'rgba(226,96,78,0.10)', border: `1px solid ${buy ? 'rgba(62,207,164,0.34)' : 'rgba(226,96,78,0.36)'}` }}>
                {buy ? '↑' : '↗'} {a.side}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)' }}>{a.coin}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>›</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrevReporting() {
  const stats = [
    { l: 'Current Value', v: '$123,494.11', c: undefined },
    { l: 'Holdings (Qty)', v: '1.67927809', c: undefined },
    { l: 'Avg Price', v: '$33,385.47', c: undefined },
    { l: 'Unrealized P/L', v: '+$67,430.63', c: GREEN },
    { l: 'Realized P/L', v: '$0.0000', c: undefined },
    { l: 'Total P/L', v: '+$67,430.63', c: GREEN },
  ]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '13px 15px' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)' }}>{s.l}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: s.c || 'var(--color-text-primary)', marginTop: 6 }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Portfolio value</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--color-text-primary)' }}>$123,494.11</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: GREEN, marginTop: 4 }}>↗ 3.70% ($4,745.50)</div>
      </div>
    </div>
  )
}

function PrevCustody() {
  const venues = [
    { n: 'Coinbase', k: 'Exchange' }, { n: 'Kraken', k: 'Exchange' },
    { n: 'Binance', k: 'Exchange' }, { n: 'Ledger', k: 'Hardware wallet' },
    { n: 'Crypto.com', k: 'Exchange' }, { n: 'Any other', k: 'Exchange or wallet' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-text-muted)', textTransform: 'uppercase' as const }}>Trade anywhere · log it here</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-purple)' }}>Exchange-agnostic</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {venues.map((v, i) => (
          <div key={i} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{v.n}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 4, letterSpacing: '0.04em' }}>{v.k}</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-success)', letterSpacing: '0.14em', textTransform: 'uppercase' as const, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} /> works
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const FEATURE_TABS = [
  { id: 'ledger', ix: '01', label: 'Capital ledger', eyebrow: 'Capital ledger', title: 'Every move, recorded in one place.', body: 'A complete record of what you bought, sold, and why. Execute each trade on your exchange in line with your LedgerOne strategy, then record it here in seconds — maintaining a single, accurate history for tax season and portfolio review.', bullets: ['Log your trades in a few taps', 'Logs every buy, sell, and rule it follows', 'Keeps your full history in one place', 'Download as CSV or PDF anytime'], Preview: PrevLedger },
  { id: 'planning', ix: '02', label: 'Allocation framework', eyebrow: 'Allocation framework', title: 'Your goals, turned into a plan.', body: "Specify your intended allocation and risk tolerance, and LedgerOne translates them into a precise plan — target holdings for each asset, entry points, and profit-taking levels.", bullets: ['Splits your money into clear buckets', 'Sets a safe min and max for each asset', 'Test your plan against 8 years of history', 'See exactly what changes when you adjust it'], Preview: PrevAllocation },
  { id: 'rules', ix: '03', label: 'Rules engine', eyebrow: 'Rules engine', title: 'Your rules, enforced without exception.', body: "Define the parameters you're comfortable with — position sizing, profit-taking, and when to stay on the sidelines — and LedgerOne enforces them with discipline.", bullets: ['12 ready-made rule templates to build from', 'Apply rules to a single asset or your entire portfolio', 'Receive alerts before any threshold is breached', 'Every change versioned and auditable'], Preview: PrevRules },
  { id: 'agent', ix: '04', label: 'Allocation agent', eyebrow: 'Allocation agent', title: "It runs your plan, so you don't have to watch.", body: "LedgerOne keeps an eye on your portfolio around the clock and acts on the plan you set — buying, selling, and taking profit at the right moments. Then it tells you exactly what it did.", bullets: ['Watches your portfolio 24/7', 'Buys and sells at the targets you set', 'Plain-language summary of every action', 'Shows the tax impact before it acts'], Preview: PrevAgent },
  { id: 'reporting', ix: '05', label: 'Reporting', eyebrow: 'Reporting', title: 'Your books and taxes, done for you.', body: 'Gains, losses, short- vs. long-term, and how you\'re doing against the market — all worked out automatically as you go. Export it whenever you or your accountant needs it.', bullets: ['Tracks your gains and losses live', 'Short- and long-term tax breakdown', "See how you're doing vs. the market", 'Export to PDF, CSV, or your accountant'], Preview: PrevReporting },
  { id: 'custody', ix: '06', label: 'Venue integration', eyebrow: 'Venue integration', title: 'Works with whatever exchange you use.', body: 'LedgerOne is exchange-agnostic. You place trades on the exchange or wallet you already trust, then record them here — so your strategy and full history stay in one place, no matter where you trade.', bullets: ['Compatible with any exchange or wallet', 'Trade where you already do — nothing to move', 'Record each trade manually in seconds', 'Direct exchange sync coming soon'], Preview: PrevCustody },
]

function FeatureTabs() {
  const [active, setActive] = useState(0)
  const tab = FEATURE_TABS[active]
  const PreviewC = tab.Preview
  return (
    <section className="l1-section" style={{ paddingTop: 40, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="Six tools" title="The engine, one tool at a time." body="Each tool works on its own — and gets more powerful when you use them together." />
        <div className="l1-tabbar">
          {FEATURE_TABS.map((t, i) => (
            <button key={t.id} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
              <span className="ix">{t.ix}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="l1-tabpanel">
          <div className="meta">
            <span className="eyebrow">{tab.eyebrow}</span>
            <h3>{tab.title}</h3>
            <p>{tab.body}</p>
            <ul>{tab.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
          <div className="preview">
            <PreviewC />
          </div>
        </div>
      </div>
    </section>
  )
}

function SpecGrid() {
  const cells = [
    { v: '14', l: 'Venues supported', b: 'Exchanges, custodians, qualified-custody, on-chain.' },
    { v: '9', l: 'Chains indexed', b: 'EVM, Bitcoin, Solana, Cosmos, and growing.' },
    { v: '8', u: 'Y', l: 'Backtest depth', b: 'Eight years of cross-chain market data, queried in under two seconds.' },
    { v: '12', l: 'Rule templates', b: 'Drop-in templates for the most common disciplines. Or write your own.' },
    { v: 'T+1', l: 'Settlement', b: 'Best-execution audit trail on every fill — captured in the journal.' },
    { v: 'SOC 2', l: 'Compliance', b: 'Type II, attested quarterly. Available to enterprise plans on request.' },
    { v: 'Daily', l: 'Evaluation', b: 'Every position, every rule, every cycle — evaluated by the engine on a daily cadence.' },
    { v: '100%', l: 'Auditable', b: 'Every deployment, realization, and rule firing carries provenance.' },
  ]
  return (
    <section className="l1-section" style={{ paddingTop: 0, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="By the numbers" title="Built like the desk you'd expect." />
        <div className="l1-specs">
          {cells.map((c, i) => (
            <div key={i} className="cell">
              <div className="l">{c.l}</div>
              <div className="v">{c.v}{c.u && <span className="u">{c.u}</span>}</div>
              <div className="b">{c.b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Architecture() {
  return (
    <section className="l1-section" style={{ paddingTop: 40, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="Architecture" title="A disciplined engine, cleanly bounded." body="You set your parameters and record your trades; LedgerOne runs your framework and returns a clear plan, alerts, and an auditable record you control. It never touches your funds or your exchange." />
        <div className="l1-arch">
          <div className="layer">
            <h5>Inputs</h5>
            <div className="node"><div className="t">Your parameters</div><div className="b">Risk profile · sell intensity · volatility · budget</div></div>
            <div className="node"><div className="t">Market data</div><div className="b">Public price feeds · spot · price history</div></div>
            <div className="node"><div className="t">Your trade log</div><div className="b">You record each buy and sell manually</div></div>
          </div>
          <div className="layer">
            <h5>LedgerOne · engine</h5>
            <div className="node"><div className="t">Allocation framework</div><div className="b">Targets · bands · per-level plan</div></div>
            <div className="node"><div className="t">Rules engine</div><div className="b">Position limits · profit-taking · versioned</div></div>
            <div className="node"><div className="t">Allocation agent</div><div className="b">Framework-aware · alert-driven</div></div>
          </div>
          <div className="layer">
            <h5>Outputs</h5>
            <div className="node"><div className="t">Action alerts</div><div className="b">Buy and sell signals you choose to act on</div></div>
            <div className="node"><div className="t">Reports</div><div className="b">P&amp;L · performance · PDF · CSV</div></div>
            <div className="node"><div className="t">Tax &amp; audit</div><div className="b">Per-lot accounting · full history</div></div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Integrations() {
  const cells = ['COINBASE', 'KRAKEN', 'BINANCE.US', 'FIREBLOCKS', 'ANCHORAGE', 'BITGO', 'SAFE', 'LEDGER', 'TREZOR', 'ARBITRUM', 'BASE', 'OPTIMISM']
  return (
    <section className="l1-section" style={{ paddingTop: 40, position: 'relative', zIndex: 1 }}>
      <div className="l1-wrap">
        <SectionHead eyebrow="Integrations" title="Integrated with the venues you already trust." />
        <div className="l1-integrations">
          {cells.map((c, i) => <div key={i} className="cell">{c}</div>)}
        </div>
      </div>
    </section>
  )
}

export default function PlatformPage() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <PlatformHeader />
      <ChromeDivider />
      <FeatureTabs />
      <SpecGrid />
      <Architecture />
      <Integrations />
      <L1ClosingCTA
        title="An engine built for the next ten years of investing."
        body="Configure your engine in minutes. Connect the venues you already trust. The system does the discipline."
      />
      <L1Footer />
    </>
  )
}
