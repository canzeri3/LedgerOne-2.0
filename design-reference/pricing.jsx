/* =============================================================
   LedgerOne · Pricing section (home)
   Plans & access. Four purchasable tiers in a row, plus a
   forward-looking "Strategy" program as a wide banner.
   Reveals + staggers via the shared motion controller
   (.l1-pricing-card / .l1-pricing-grid are wired in
   site-animations.js + site-animations.css).
   ============================================================= */

const L1_PLANS = [
  {
    tier: "TIER 0",
    name: "LedgerOne Tracker",
    price: "Free",
    period: "",
    blurb: "Unlimited coin tracking and performance analytics — no planning tools.",
    features: [
      { t: "Dashboard & portfolio analytics", s: "Holdings, cost basis, P&L overview" },
      { t: "Coin pages", s: "Coin-specific analytics" },
      { t: "Transaction ledger", s: "Record buys / sells and track history" },
      { t: "Planners locked", s: "Planners + Portfolio Risk Metrics are locked", muted: true },
    ],
    cta: "Open the tracker",
    href: "platform.html",
    variant: "glass",
  },
  {
    tier: "TIER 1",
    name: "LedgerOne Standard",
    price: "$19",
    period: "/mo",
    blurb: "Built for focused portfolios — structured planning across your core positions.",
    features: [
      { t: "Buy Planner", s: "Rules-based accumulation ladders" },
      { t: "Sell Planner", s: "Structured exits and cycle planning" },
      { t: "Portfolio Risk Metrics", s: "Exposure & risk insights unlocked" },
      { t: "Planner assets cap", s: "Buy / Sell plans for up to 5 coins" },
    ],
    cta: "Request access",
    href: "pricing.html",
    variant: "glass",
  },
  {
    tier: "TIER 2",
    name: "LedgerOne Diversified",
    price: "$39",
    period: "/mo",
    recommended: true,
    blurb: "Built for diversified portfolios — structure planning across a broader set of assets.",
    features: [
      { t: "Everything in Standard", s: "All planning tools and portfolio visibility" },
      { t: "Higher capacity", s: "Up to 20 active planned coins (Buy + Sell)" },
    ],
    cta: "Request access",
    href: "pricing.html",
    variant: "primary",
  },
  {
    tier: "TIER 3",
    name: "LedgerOne Ultimate",
    price: "$59",
    period: "/mo",
    blurb: "Built for scale — unlimited planning across your entire portfolio.",
    features: [
      { t: "Everything in Standard", s: "Planning + portfolio visibility included" },
      { t: "Unlimited planned assets", s: "No cap on active planned coins" },
      { t: "Best for high conviction", s: "A rules-based system across a full book" },
      { t: "Same clean ledger", s: "Tracking and history remain core" },
    ],
    cta: "Request access",
    href: "pricing.html",
    variant: "glass",
  },
];

const L1_FUTURE = {
  tier: "TIER 4 · FUTURE",
  name: "LedgerOne Strategy",
  blurb: "A guided program to maximize the platform and leverage the LedgerOne methodology end to end.",
  features: [
    { t: "Institutional framework", s: "Institutional-grade methodology and standards" },
    { t: "Planner inputs", s: "Which inputs to use for specific assets" },
    { t: "Budget allocation", s: "How to set and adjust budgets per asset" },
    { t: "Timing control", s: "How to adapt inputs across market cycles" },
  ],
};

function L1PricingFeature({ f }) {
  return (
    <li className={"l1-pricing-feat" + (f.muted ? " is-muted" : "")}>
      <span className="ck"><L1Icon name={f.muted ? "lock" : "check"} size={12} /></span>
      <div className="txt">
        <span className="t">{f.t}</span>
        <span className="s">{f.s}</span>
      </div>
    </li>);

}

function L1PricingCard({ plan }) {
  const btnClass =
    "l1-btn l1-pricing-cta " +
    (plan.variant === "primary" ? "l1-btn-primary" : "l1-btn-glass");
  return (
    <div className={"l1-pricing-card" + (plan.recommended ? " is-recommended" : "")}>
      {plan.recommended && <span className="l1-pricing-badge">Recommended</span>}
      <span className="l1-pricing-tier">{plan.tier}</span>
      <h3 className="l1-pricing-name">{plan.name}</h3>
      <div className="l1-pricing-price">
        <span className="amt">{plan.price}</span>
        {plan.period && <span className="per">{plan.period}</span>}
      </div>
      <p className="l1-pricing-blurb">{plan.blurb}</p>
      <ul className="l1-pricing-feats">
        {plan.features.map((f, i) => <L1PricingFeature key={i} f={f} />)}
      </ul>
      <a href={plan.href} className={btnClass}>
        {plan.cta}
        <L1Icon name="arrowRight" size={14} />
      </a>
    </div>);

}

function L1Pricing() {
  return (
    <section className="l1-section l1-pricing" data-screen-label="02 Plans" style={{ paddingTop: 8 }}>
      <div className="l1-wrap">
        <div className="l1-pricing-grid">
          {L1_PLANS.map((p, i) => <L1PricingCard key={i} plan={p} />)}
        </div>

        {/* Forward-looking program — distinct, wide banner */}
        <div className="l1-pricing-card l1-pricing-future">
          <div className="l1-pricing-future-lead">
            <span className="l1-pricing-tier">{L1_FUTURE.tier}</span>
            <h3 className="l1-pricing-future-name">
              {L1_FUTURE.name}
              <span className="soon">Coming soon</span>
            </h3>
            <p className="l1-pricing-blurb">{L1_FUTURE.blurb}</p>
            <a href="contact.html" className="l1-btn l1-btn-glass l1-pricing-cta is-inline">
              Join the waitlist
              <L1Icon name="arrowRight" size={14} />
            </a>
          </div>
          <ul className="l1-pricing-feats l1-pricing-future-feats">
            {L1_FUTURE.features.map((f, i) => <L1PricingFeature key={i} f={f} />)}
          </ul>
        </div>
      </div>
    </section>);

}

Object.assign(window, { L1Pricing });

/* ------------------ PAGE HEADER ------------------ */
function PricingHeader() {
  return (
    <section className="l1-pageheader" data-screen-label="01 Pricing header">
      <div className="l1-pageheader-aurora" />
      <div className="l1-wrap">
        <div className="l1-pageheader-inner">
          <div>
            <div className="l1-pageheader-eyebrow">Pricing · Plans &amp; access</div>
            <h1>Plans built for disciplined portfolio management.</h1>
          </div>
          <p className="lead">
            Choose a tier by how many assets you want to actively plan.
            Tracking — holdings, cost basis, and performance — always stays
            free. Upgrade only when you want the planners working for you.
          </p>
        </div>
      </div>
    </section>);

}

/* ------------------ APP ------------------ */
function PricingApp() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <L1Nav active="pricing" />
      <PricingHeader />
      <L1Chrome />
      <L1Pricing />
      <L1ClosingCTA
        title="Start free. Upgrade when the plan does."
        body="Track your whole portfolio at no cost. When you're ready to let the engine plan deployments and realizations, move up a tier — your history comes with you."
        primary="Request access"
        secondary="Talk to our team" />

      <L1Footer />
    </>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<PricingApp />);
