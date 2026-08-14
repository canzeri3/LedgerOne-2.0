import Link from 'next/link'
import {
  LayoutDashboard,
  Wallet,
  BarChart3,
  FileSpreadsheet,
  ScrollText,
  Gauge,
  Settings as SettingsIcon,
  Eye,
  Calculator,
  Layers,
  Repeat,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
} from 'lucide-react'
import '@/app/planner/planner-skin.css'
import './how-to-skin.css'

/* ── Live demo: real planner-skin ladder ──────────────────────────────── */
function DemoLadder() {
  const Row = ({
    lvl, target, planned, missing, pct, width, cls,
  }: { lvl: number; target: string; planned: string; missing: string; pct: string; width: string; cls?: string }) => (
    <tr className={cls}>
      <td className="lvl"><span className="ix">{lvl}</span></td>
      <td className="tgt">{target}</td>
      <td className="num amt">{planned}</td>
      <td className="num amt">{missing}</td>
      <td>
        <div className="ldr-prog">
          <div className="ldr-prog-track"><div className="ldr-prog-fill" style={{ width }} /></div>
          <span className="ldr-prog-pct">{pct}</span>
        </div>
      </td>
    </tr>
  )
  return (
    <div className="pl" style={{ padding: 0 }}>
      <div className="pl-ladder" style={{ margin: 0, border: 0, background: 'transparent' }}>
        <div className="ldr-scroll">
          <table className="ldr" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th><span className="th-l">Lvl</span></th>
                <th><span className="th-l">Target</span></th>
                <th className="!text-right"><span className="th-l !justify-end">Planned&nbsp;$</span></th>
                <th className="!text-right"><span className="th-l !justify-end">Missing&nbsp;$</span></th>
                <th className="r"><span className="th-l">Progress</span></th>
              </tr>
            </thead>
            <tbody>
              <Row lvl={1} target="$62,000" planned="$2,000" missing="$0" pct="100%" width="100%" cls="done" />
              <Row lvl={2} target="$58,000" planned="$2,000" missing="$800" pct="60%" width="60%" cls="alert" />
              <Row lvl={3} target="$54,000" planned="$2,000" missing="$2,000" pct="0%" width="0%" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DemoBanner() {
  return (
    <div className="pl" style={{ padding: 0 }}>
      <div className="pl-banner" style={{ margin: 0 }}>
        <span className="dot" aria-hidden="true" />
        <b className="alert-txt">Actionable now</b>
        <span className="sep">·</span>
        <span><b className="tabular-nums">1</b> row</span>
        <span className="sep">·</span>
        <span>Buy <b className="tabular-nums">$9,447.19</b></span>
        <span className="sep">@</span>
        <span><b className="tabular-nums">$1,931.69</b></span>
      </div>
    </div>
  )
}

/* ── Reference accordion ──────────────────────────────────────────────── */
function Accordion({
  icon, title, sub, children, open = false,
}: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="ht-acc" open={open}>
      <summary>
        <span className="ht-acc-ic">{icon}</span>
        <span className="ht-acc-titles">
          <span className="ht-acc-title">{title}</span>
          <span className="ht-acc-sub">{sub}</span>
        </span>
        <ChevronDown className="ht-acc-chev h-4 w-4" />
      </summary>
      <div className="ht-acc-body">{children}</div>
    </details>
  )
}

function Spec({ rows }: { rows: { term: string; def: React.ReactNode }[] }) {
  return (
    <div className="ht-spec">
      {rows.map((r, i) => (
        <div key={i} className="ht-spec-row">
          <div className="ht-spec-term">{r.term}</div>
          <div className="ht-spec-def">{r.def}</div>
        </div>
      ))}
    </div>
  )
}

function Feature({
  icon, title, href, children,
}: { icon: React.ReactNode; title: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="ht-feat">
      <ArrowUpRight className="ht-feat-arrow h-4 w-4" />
      <div className="ht-feat-head"><span className="ht-feat-ic">{icon}</span>{title}</div>
      <div className="ht-feat-body">{children}</div>
    </Link>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="ht-faq">
      <summary>{q}<ChevronDown className="ht-faq-chev h-4 w-4" /></summary>
      <div className="ht-faq-body">{children}</div>
    </details>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
export default function HowToPage() {
  return (
    <div className="ht">
      {/* ── Hero ── */}
      <header className="ht-hero">
        <div className="ht-hero-aurora" aria-hidden="true" />
        <div className="ht-hero-grid" aria-hidden="true" />
        <div className="ht-hero-inner">
          <span className="ht-eyebrow">LedgerOne · Operating Manual</span>
          <h1 className="ht-h1">From first open to a running Buy &amp; Sell Planner.</h1>
          <p className="ht-lead">
            LedgerOne never places orders. It builds your accumulation and distribution ladders,
            signals the exact moment to act, and keeps an auditable record of everything you execute.
            Here&apos;s the full workflow — and how to read the app once it&apos;s live.
          </p>
          <div className="ht-hero-actions">
            <Link href="/planner" className="ht-btn ht-btn-primary">Open the Planner <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/dashboard" className="ht-btn ht-btn-ghost">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      {/* ── Part 1 · Workflow ── */}
      <section className="ht-section" aria-label="Your first session">
        <div className="ht-section-head">
          <span className="ht-section-eyebrow">01 — Get started</span>
          <h2 className="ht-section-title">Your first session, end to end</h2>
          <p className="ht-section-sub">
            One linear path. Five steps take you from an empty account to a fully configured pair of
            planners with your first trade recorded.
          </p>
        </div>

        <div className="ht-flow">
          <div className="ht-step">
            <div className="ht-step-node">1</div>
            <div className="ht-step-body">
              <span className="ht-step-tag">Step 01 · Select</span>
              <h3 className="ht-step-title">Pick a coin</h3>
              <div className="ht-step-text">
                <p>Open a coin from the sidebar list or search. Everything in LedgerOne is planned
                  <strong> per coin</strong> — each asset gets its own budget, ladders, and history.</p>
              </div>
            </div>
          </div>

          <div className="ht-step">
            <div className="ht-step-node">2</div>
            <div className="ht-step-body">
              <span className="ht-step-tag">Step 02 · Accumulate</span>
              <h3 className="ht-step-title">Build the Buy Planner</h3>
              <div className="ht-step-text">
                <p>Open <span className="ht-kbd">Planner</span>. Set your <strong>Total Budget</strong>, choose a <strong>Risk Profile</strong>,
                  then click <span className="ht-kbd">Save New Plan</span></p>
                <p className="ht-muted">A ladder of target prices appears, each with a planned amount.
                  Changed your mind? Edit the inputs and click <span className="ht-kbd">Edit Current Plan</span></p>
              </div>
            </div>
          </div>

          <div className="ht-step">
            <div className="ht-step-node">3</div>
            <div className="ht-step-body">
              <span className="ht-step-tag">Step 03 · Record</span>
              <h3 className="ht-step-title">Log your first trade</h3>
              <div className="ht-step-text">
                <p>When you buy on your exchange, return to the coin page →
                  <strong> Add Trade</strong>. Enter the exact filled <strong>Price</strong> and
                  <strong> Quantity</strong> (buys accept USD or tokens — the lock icon switches modes),
                  then click <span className="ht-kbd">Add Trade</span>.</p>
                <p className="ht-muted">The <strong>Update planner</strong> toggle is on by default, so
                  the trade fills your ladder. Turn it off to record to your portfolio only. Bulk history
                  imports via <span className="ht-kbd">CSV</span>.</p>
              </div>
            </div>
          </div>

          <div className="ht-step">
            <div className="ht-step-node">4</div>
            <div className="ht-step-body">
              <span className="ht-step-tag">Step 04 · Distribute</span>
              <h3 className="ht-step-title">Generate the Sell Planner</h3>
              <div className="ht-step-text">
                <p>On the <span className="ht-kbd">Planner</span> page, scroll to the Sell Planner, set <strong>Coin Volatility</strong>{' '}
                  and <strong>Sell Intensity</strong>, then click <span className="ht-kbd">Generate Ladder</span>.
                  Requires at least one recorded buy for the coin — the ladder distributes only what you currently hold.</p>
              </div>
            </div>
          </div>

          <div className="ht-step">
            <div className="ht-step-node">5</div>
            <div className="ht-step-body">
              <span className="ht-step-tag">Step 05 · Done</span>
              <h3 className="ht-step-title">You&apos;re live</h3>
              <div className="ht-step-text">
                <p>From here the app watches prices for you. When a level triggers you&apos;ll see a
                  <strong> yellow row</strong> on the planner and an <strong>alert</strong> on the
                  Dashboard. The next section shows exactly what that looks like.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="ht-rule" />

      {/* ── Part 2 · Reading the app ── */}
      <section className="ht-section" aria-label="Reading the app">
        <div className="ht-section-head">
          <span className="ht-section-eyebrow">02 — Read the signals</span>
          <h2 className="ht-section-title">The app speaks in rows and alerts</h2>
          <p className="ht-section-sub">
            Every planner communicates through row color and progress. Below is a live sample rendered
            with the exact component styling of your real planners.
          </p>
        </div>

        <div className="ht-window">
          <div className="ht-window-bar">
            <div className="ht-window-dots" aria-hidden="true"><i /><i /><i /></div>
            <div className="ht-window-title">buy-planner · bitcoin</div>
          </div>
          <div className="ht-window-body"><DemoLadder /></div>
        </div>

        <div className="ht-signal-grid">
          <div className="ht-signal">
            <div className="ht-signal-head"><span className="ht-signal-dot" style={{ color: '#3ECFA4', background: '#3ECFA4' }} />Green row</div>
            <div className="ht-signal-text">Level filled to 100%. Nothing to do — it&apos;s complete.</div>
          </div>
          <div className="ht-signal">
            <div className="ht-signal-head"><span className="ht-signal-dot" style={{ color: '#EFC435', background: '#EFC435' }} />Yellow row</div>
            <div className="ht-signal-text">Price reached this level. Time to act: execute at your exchange, then record it in Add Trade.</div>
          </div>
          <div className="ht-signal">
            <div className="ht-signal-head"><span className="ht-signal-dot" style={{ color: '#6C7189', background: '#6C7189' }} />Plain row</div>
            <div className="ht-signal-text">Level not reached yet. Waiting for price.</div>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <div className="ht-window">
            <div className="ht-window-bar">
              <div className="ht-window-dots" aria-hidden="true"><i /><i /><i /></div>
              <div className="ht-window-title">dashboard · alert banner</div>
            </div>
            <div className="ht-window-body"><DemoBanner /></div>
          </div>
        </div>

        <div className="ht-alertlist">
          <div className="ht-alertrow">
            <span className="ht-pill ht-pill-buy">Buy</span>
            <span>Price dropped to a Buy Planner level. Execute the buy at your exchange, then record it in Add Trade. The row turns <b>green</b> once the planned amount is filled.</span>
          </div>
          <div className="ht-alertrow">
            <span className="ht-pill ht-pill-sell">Sell</span>
            <span>Price rose to a Sell Planner level. Execute the sell, then record it in Add Trade — sells attach to the <b>Active</b> planner by default, or pick an older version.</span>
          </div>
          <div className="ht-alertrow">
            <span className="ht-pill ht-pill-cycle">New Cycle</span>
            <span>The market moved enough that your plan is out of date. Open <span className="ht-kbd">Planner</span>, review budget and risk, and <b>Save New Plan</b>. Your previous Sell Planner freezes as a numbered version; a fresh one goes active.</span>
          </div>
        </div>

        <div className="ht-loop">
          <b>The loop never changes:</b> alert fires <code>→</code> execute at your exchange <code>→</code> record it in Add Trade <code>→</code> the row fills and turns green.
        </div>
      </section>

      <hr className="ht-rule" />

      {/* ── Part 3 · Deep reference ── */}
      <section className="ht-section" aria-label="Reference">
        <div className="ht-section-head">
          <span className="ht-section-eyebrow">03 — Reference</span>
          <h2 className="ht-section-title">Every input, in depth</h2>
          <p className="ht-section-sub">
            Expand any control for the exact meaning of each field, state, and setting.
          </p>
        </div>

        <Accordion icon={<Layers className="h-4 w-4" />} title="Buy Planner" sub="Budget, risk profile, and row states" open>
          <div className="ht-mini">Key inputs</div>
          <Spec rows={[
            { term: 'Total Budget (USD)', def: 'The maximum capital you’ll deploy for this asset in the current cycle. Keeps planning disciplined and prevents adding risk by accident through unstructured buying.' },
            { term: 'Risk Profile', def: (
              <ul>
                <li><strong>Conservative</strong> — most patient pacing; reduces drawdown risk and avoids over-deployment during volatility.</li>
                <li><strong>Moderate</strong> — balanced pacing for disciplined accumulation; typical for larger, liquid core positions.</li>
                <li><strong>Aggressive</strong> — faster accumulation and higher exposure velocity when conviction is high.</li>
              </ul>
            ) },
          ]} />
          <div className="ht-mini">Execution &amp; tracking</div>
          <Spec rows={[
            { term: 'Yellow row — time to buy', def: 'An execution signal: market price reached this level’s targeted buy. Execute externally, then record the fill under Coin → Add Trade so the row can update.' },
            { term: 'Green row — level filled', def: 'A completion state: buys recorded while this planner is active count toward the level’s fill percentage. At 100%, the row turns green.' },
            { term: 'Off-Plan', def: 'Buys recorded away from designated levels are tagged Off-Plan and don’t contribute to completion — keeping attribution clean and surfacing discretionary deviations.' },
            { term: 'Alerts', def: 'Buy alerts surface on the Dashboard when levels become actionable. New Cycle alerts indicate it’s time to refresh the plan for the current market phase.' },
          ]} />
          <div className="ht-note">LedgerOne does not place orders. Execute buys externally, then log the exact fill price and quantity under Coin → Add Trade.</div>
        </Accordion>

        <Accordion icon={<Wallet className="h-4 w-4" />} title="Add a Trade" sub="Your book of record for executed orders">
          <div className="ht-mini">Key fields</div>
          <Spec rows={[
            { term: 'Side', def: 'Buy or Sell. Determines how position and realized results update, supporting accurate, auditable performance reporting.' },
            { term: 'Quantity', def: (<><p>Enter the filled quantity to keep an accurate record of executed size.</p><ul><li><strong>Buys</strong> can be entered as USD or tokens (lock icon switches modes).</li><li><strong>Sells</strong> are recorded in tokens.</li></ul></>) },
            { term: 'Execution price', def: 'The filled price from your exchange order — the record of execution value.' },
            { term: 'Timestamp', def: 'The execution time. Defaults to now for immediate entries; accurate timestamps keep sequencing and reporting reliable.' },
          ]} />
          <div className="ht-mini">Planner attribution</div>
          <Spec rows={[
            { term: 'Buys (automatic)', def: 'Buy entries auto-tag to the active planner for that coin — no manual selection needed.' },
            { term: 'Sells (choose version)', def: 'Sells default to the Active Sell Planner, but you can assign them to any Frozen version so the correct ladder’s progress updates. If Planner [2] is signaling, attribute the sell to Planner [2].' },
            { term: 'Update planner toggle', def: 'On by default so the trade fills your ladder. Switch it off to record to your portfolio only, without touching any planner.' },
          ]} />
        </Accordion>

        <Accordion icon={<BarChart3 className="h-4 w-4" />} title="Sell Planner" sub="Structured distribution and versioning">
          <div className="ht-mini">Settings</div>
          <Spec rows={[
            { term: 'Coin Volatility', def: 'Sets how broad the plan should be. More volatile assets generally benefit from a wider, more patient distribution.' },
            { term: 'Sell Intensity', def: 'Sets how assertively the plan reduces exposure — from gradual trimming to faster reduction.' },
          ]} />
          <div className="ht-mini">Signals &amp; versioning</div>
          <Spec rows={[
            { term: 'Yellow / Green rows', def: 'Yellow = the next planned sell checkpoint is active; execute the sell. Green = that level is 100% filled by attributed sells.' },
            { term: 'Freezing', def: 'When you save a new Buy Planner, any active Sell Planner locks as a numbered version (still visible next to the Active tab, tracked independently). A fresh Active planner is created for the new cycle.' },
          ]} />
        </Accordion>

        <Accordion icon={<Repeat className="h-4 w-4" />} title="New Coin Cycle" sub="Refreshing your plan for a new phase">
          <div className="ht-mini">What you do</div>
          <Spec rows={[
            { term: 'Open the alert', def: 'It navigates straight to the coin’s Buy/Sell Planner.' },
            { term: 'Refresh inputs', def: 'Review your Total Budget and Risk Profile for the new cycle, then click Save New Plan.' },
          ]} />
          <div className="ht-mini">What LedgerOne does automatically</div>
          <Spec rows={[
            { term: 'New Buy ladder', def: 'Builds a fresh Buy Planner for the updated cycle so future tracking reflects the refreshed plan.' },
            { term: 'Locks prior Sell Planner', def: 'The previous Sell Planner freezes as history; a new version becomes active for the new cycle.' },
            { term: 'Clean attribution', def: 'New activity tracks against the current cycle rather than blending into prior versions.' },
          ]} />
        </Accordion>

        <Accordion icon={<Gauge className="h-4 w-4" />} title="Risk Score" sub="A single, comparable portfolio risk metric">
          <p className="ht-step-text" style={{ marginBottom: 4 }}>
            A standardized score decomposing portfolio risk into five components, rolled up into a
            Total Combined Risk number plus a level badge (Low / Moderate / High / Very High). It&apos;s a
            governance metric — used to size and review exposure, not to time trades.
          </p>
          <div className="ht-mini">Components</div>
          <Spec rows={[
            { term: 'Structural', def: 'Baseline composition risk from the quality/tier mix you hold. More established assets tend to be more resilient.' },
            { term: 'Volatility', def: 'Realized volatility regime (annualized). Higher volatility means larger swings and a wider range of outcomes.' },
            { term: 'Tail Risk', def: 'Downside stress sensitivity — how the portfolio behaves during sharp risk-off periods.' },
            { term: 'Correlation', def: 'Diversification behavior relative to BTC. Higher correlation raises concentration risk.' },
            { term: 'Liquidity', def: 'Market depth (rank/liquidity), informing sizing discipline and concentration governance.' },
            { term: 'Total Combined Risk', def: 'One comparable number: Σ(weight × structural) × vol × tail × corr × liq. Use it for sizing and governance, not trade timing.' },
          ]} />
        </Accordion>

        <Accordion icon={<Calculator className="h-4 w-4" />} title="Shortcuts &amp; tips" sub="Faster ways to work">
          <Spec rows={[
            { term: 'Header calculator', def: 'Add up totals across planner rows (toggle Tokens / $), then Copy the result where you need it.' },
            { term: 'Quick portfolio import', def: 'Already hold a position without every fill? Add a single Buy using your total tokens and average entry price to initialize holdings and cost basis immediately.' },
            { term: 'Holdings search & sort', def: 'Filter holdings by name or symbol; sort by quantity or value to surface concentration quickly.' },
            { term: 'Timeframe tabs', def: 'Switch performance windows on charts to analyze different periods.' },
          ]} />
        </Accordion>
      </section>

      <hr className="ht-rule" />

      {/* ── Features ── */}
      <section className="ht-section" aria-label="Features">
        <div className="ht-section-head">
          <span className="ht-section-eyebrow">04 — Around the app</span>
          <h2 className="ht-section-title">Everywhere else worth knowing</h2>
        </div>
        <div className="ht-feat-grid">
          <Feature icon={<LayoutDashboard className="h-4 w-4" />} title="Dashboard" href="/dashboard">Holdings, growth, recent trades — and the alerts button, which rings yellow when something needs you.</Feature>
          <Feature icon={<Wallet className="h-4 w-4" />} title="Portfolio" href="/portfolio">Allocation donut, value history, and CSV export of your full trade record.</Feature>
          <Feature icon={<BarChart3 className="h-4 w-4" />} title="Planner" href="/planner">The full Buy &amp; Sell workspace for any coin, with plan-history versions.</Feature>
          <Feature icon={<FileSpreadsheet className="h-4 w-4" />} title="CSV import" href="/csv">Backfill history or bulk-add trades from your exchange export.</Feature>
          <Feature icon={<ScrollText className="h-4 w-4" />} title="Audit Log" href="/audit">Every trade and planner action, logged and exportable.</Feature>
          <Feature icon={<Gauge className="h-4 w-4" />} title="Risk Score" href="/dashboard">One number for how far your portfolio sits from its plan.</Feature>
          <Feature icon={<SettingsIcon className="h-4 w-4" />} title="Display currency" href="/settings">Switch the whole app between USD, CAD, and EUR from the header or Settings.</Feature>
          <Feature icon={<Eye className="h-4 w-4" />} title="Privacy mode" href="/dashboard">The eye icon masks every amount on screen — for screen-sharing or public spaces.</Feature>
          <Feature icon={<Calculator className="h-4 w-4" />} title="Calculator" href="/dashboard">Quick position math from the header without leaving the page.</Feature>
        </div>
      </section>

      <hr className="ht-rule" />

      {/* ── FAQ ── */}
      <section className="ht-section" aria-label="FAQ">
        <div className="ht-section-head">
          <span className="ht-section-eyebrow">05 — FAQ</span>
          <h2 className="ht-section-title">Quick answers</h2>
        </div>
        <div>
          <Faq q="Does LedgerOne place trades for me?">No. It plans levels, alerts you, and records what you executed. Every order happens at your exchange or broker.</Faq>
          <Faq q="Why is a row yellow?">The live price reached that level’s target and the planned amount isn’t filled yet. Execute at your exchange, record it in Add Trade, and the row turns green as it fills.</Faq>
          <Faq q="I recorded a trade but the planner didn't move.">Check two things: the <strong>Update planner</strong> toggle was on when you added the trade, and — for sells — the trade was attached to the right planner version (Active vs. a frozen number).</Faq>
          <Faq q="Should I configure the Buy Planner before adding trades?">Yes. Configure your Buy Plan first so alerts and ladders are ready, then add trades as you execute.</Faq>
          <Faq q="What happens when I save a new Buy Planner?">Your current Sell Planner freezes as a numbered version — its history stays visible and keeps tracking independently. A new Active sell planner is created for the new cycle.</Faq>
          <Faq q="I typed a trade wrong. How do I fix it?">Open the coin’s trades list, delete the incorrect entry, and re-add it with the exact fill details from your exchange.</Faq>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <div className="ht-cta">
        <div>
          <h3 className="ht-cta-title">Ready when you are.</h3>
          <p className="ht-cta-sub">Pick a coin, set a budget, and save your first Buy Planner — the rest is just following the signals.</p>
        </div>
        <Link href="/planner" className="ht-btn ht-btn-primary ht-btn-lg" style={{ padding: '13px 26px', fontSize: 15 }}>
          Open the Planner <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
