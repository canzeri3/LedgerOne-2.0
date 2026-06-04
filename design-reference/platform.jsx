/* =============================================================
   LedgerOne · Platform / Features
   ============================================================= */
const { useState: pUseState } = React;

/* ------------------ PAGE HEADER ------------------ */
function PlatformHeader() {
  return (
    <section className="l1-pageheader" data-screen-label="01 Platform header">
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
              src="assets/app-icon-clean.png"
              alt="LedgerOne app icon"
              width="120"
              height="120" />
            
            <p className="lead">
              LedgerOne's engine translates your parameters into a fully
              automated systematic framework — across any supported digital
              asset. You define the inputs. The system does the rest.
            </p>
          </div>
        </div>
      </div>
    </section>);

}

/* ------------------ TABBED FEATURE EXPLORER ------------------ */

/* — preview renderers per feature — */
function PrevLedger() {
  const GREEN = '#3ECFA4',RED = '#E2604E';
  const groups = [
  { date: "5/31/2026", txns: [
    { side: "Sell", coin: "ETHEREUM", qty: "4", price: "$3,000.00", total: "-$12,000.00" }]
  },
  { date: "5/23/2026", txns: [
    { side: "Buy", coin: "ETHEREUM", qty: "18.75", price: "$1800.00", total: "+$15,000.00" },
    { side: "Buy", coin: "BITCOIN", qty: "1.625", price: "$32,000.00", total: "+$52,000.00" },
    { side: "Buy", coin: "ETHEREUM", qty: "7.5", price: "$1200.00", total: "+$6,000.00" }]
  },
  { date: "3/8/2026", txns: [
    { side: "Buy", coin: "BITCOIN", qty: "0.05427809", price: "$74,864.10", total: "+$4,063.48" }]
  }];

  const Chip = ({ label, caret }) =>
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px', whiteSpace: 'nowrap', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
      {label}{caret && <span style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>▾</span>}
    </span>;

  const cols = '58px 1fr 86px 96px';
  return (
    <div className="l1-tabpanel-preview-ledger">
      {/* toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)' }}>Transactions</div>
        <div style={{ display: 'flex', gap: 7 }}>
          <Chip label="All coins" caret />
          <Chip label="Date" caret />
          <span style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', padding: '5px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)' }}>8 shown</span>
        </div>
      </div>

      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        {/* column header */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
          <span>Side</span><span>Coin</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Total</span>
        </div>

        {groups.map((g, gi) =>
        <div key={gi}>
            <div style={{ padding: '9px 16px', background: 'var(--color-bg-base)', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>{g.date}</div>
            {g.txns.map((t, ti) => {
            const buy = t.side === 'Buy';
            const c = buy ? GREEN : RED;
            const last = gi === groups.length - 1 && ti === g.txns.length - 1;
            return (
              <div key={ti} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '13px 16px', borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
                  <span style={{ justifySelf: 'start', padding: '3px 11px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, color: c, background: buy ? 'rgba(62,207,164,0.10)' : 'rgba(226,96,78,0.10)', border: `1px solid ${buy ? 'rgba(62,207,164,0.32)' : 'rgba(226,96,78,0.34)'}` }}>{t.side}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-text-primary)', letterSpacing: '0.01em' }}>{t.coin}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 3 }}>@ {t.price}</div>
                  </div>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.qty}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: c, whiteSpace: 'nowrap' }}>{t.total}</span>
                </div>);

          })}
          </div>
        )}
      </div>
    </div>);

}

function PrevAllocation() {
  const AMBER = '#EFC435';
  const rows = [
  { lvl: 1, target: "$1,049.37", missing: "$4,440.97", act: true },
  { lvl: 2, target: "$918.20", missing: "$5,551.21", act: true },
  { lvl: 3, target: "$787.03", missing: "$6,939.02", act: true },
  { lvl: 4, target: "$655.86", missing: "$8,673.77", act: false },
  { lvl: 5, target: "$524.69", missing: "$10,842.22", act: false },
  { lvl: 6, target: "$393.51", missing: "$13,552.81", act: false }];

  const cols = '30px 1fr 1fr 78px';
  return (
    <div>
      {/* actionable banner */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', padding: '13px 16px', marginBottom: 16, border: `1px solid rgba(239,196,53,0.32)`, background: 'rgba(239,196,53,0.05)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', color: AMBER }}><span style={{ width: 6, height: 6, borderRadius: 999, background: AMBER, boxShadow: `0 0 8px ${AMBER}` }} />Actionable now</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>3 alert rows</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>$16,931.20 <span style={{ color: 'var(--color-text-muted)' }}>remaining</span></span>
      </div>

      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
          <span>Lvl</span><span>Target</span><span>Missing $</span><span style={{ textAlign: 'right' }}>Progress</span>
        </div>
        {rows.map((r, i) => {
          const c = r.act ? AMBER : 'var(--color-text-primary)';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c }}>{r.lvl}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c }}>{r.target}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c }}>{r.missing}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
                <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--color-bg-elevated)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.act ? AMBER : 'var(--color-text-muted)', minWidth: 24, textAlign: 'right' }}>0%</span>
              </div>
            </div>);

        })}
        {/* totals */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '13px 16px', background: 'var(--color-bg-base)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Tot</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>87.4244</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--color-text-primary)' }}>$50,000.00</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)' }}>Avg —</span>
        </div>
      </div>
    </div>);

}

function PrevRules() {
  const Field = ({ label, children }) =>
  <div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8, letterSpacing: '0.02em' }}>{label}</div>
      {children}
    </div>;

  const Badge = ({ children, tone }) =>
  <span style={{ padding: '3px 9px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, whiteSpace: 'nowrap',
    color: tone === 'accent' ? 'var(--color-accent-purple)' : 'var(--color-text-secondary)',
    background: 'var(--color-bg-elevated)', border: `1px solid ${tone === 'accent' ? 'var(--color-accent-purple-muted)' : 'var(--color-border)'}` }}>{children}</span>;

  const Selector = ({ value, badge, badgeTone, open }) =>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px', background: 'var(--color-bg-surface)', border: `1px solid ${open ? 'var(--color-accent-purple-muted)' : 'var(--color-border)'}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }}>{value}</span>
        {badge && <Badge tone={badgeTone}>{badge}</Badge>}
      </div>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--color-text-muted)', transform: open ? 'none' : 'rotate(180deg)' }}>▲</span>
    </div>;

  const Dashes = ({ n, on }) =>
  <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
      {Array.from({ length: 8 }).map((_, i) =>
    <span key={i} style={{ width: 18, height: 6, borderRadius: 2, background: i < n ? on ? 'var(--color-accent-purple)' : 'var(--color-text-muted)' : 'var(--color-bg-elevated)', opacity: i < n ? on ? 1 : 0.55 : 1 }} />
    )}
    </div>;

  const Opt = ({ name, badge, dashes, sub, sel }) =>
  <div style={{ padding: '13px 16px', borderRadius: 8, background: sel ? 'var(--color-bg-elevated)' : 'transparent', border: sel ? '1px solid var(--color-accent-purple-muted)' : '1px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: sel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{name}</span>
        <Badge tone={sel ? 'accent' : 'muted'}>{badge}</Badge>
      </div>
      {dashes != null && <Dashes n={dashes} on={sel} />}
      {sub && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.45 }}>{sub}</div>}
    </div>;

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Risk profile — expanded picker */}
      <Field label="Risk profile">
        <Selector value="Moderate" badge="6 levels" open />
        <div style={{ marginTop: 8, padding: 6, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, display: 'grid', gap: 2 }}>
          <Opt name="Conservative profile" badge="8 levels" dashes={8} />
          <Opt name="Moderate profile" badge="6 levels" dashes={6} sel />
          <Opt name="Aggressive profile" badge="3 levels" dashes={3} />
        </div>
      </Field>

      {/* Sell Intensity + Coin Volatility */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Sell Intensity">
          <Selector value="Balanced Trim" badge="Standard" />
        </Field>
        <Field label="Coin Volatility">
          <Selector value="Low" badge="Tight" />
        </Field>
      </div>

      {/* Total budget */}
      <Field label="Total budget ($)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--color-text-muted)' }}>$</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, letterSpacing: '0.02em', color: 'var(--color-text-primary)' }}>50,000</span>
        </div>
      </Field>
    </div>);

}

function PrevAgent() {
  const GREEN = '#3ECFA4',RED = '#E2604E',AMBER = '#EFC435';
  const alerts = [
  { side: "Buy", coin: "AVAX" },
  { side: "Buy", coin: "BCH" },
  { side: "Buy", coin: "BNB" },
  { side: "Buy", coin: "TON" },
  { side: "Buy", coin: "WBETH" },
  { side: "Sell", coin: "AVAX" },
  { side: "Sell", coin: "BTC" },
  { side: "Sell", coin: "ETH" }];

  return (
    <div>
      {/* actionable banner */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', padding: '13px 16px', marginBottom: 14, border: '1px solid rgba(239,196,53,0.32)', background: 'rgba(239,196,53,0.05)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', color: AMBER }}><span style={{ width: 6, height: 6, borderRadius: 999, background: AMBER, boxShadow: `0 0 8px ${AMBER}` }} />Actionable now</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>4 alert rows</span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>$25,604.97 <span style={{ color: 'var(--color-text-muted)' }}>remaining</span></span>
      </div>

      {/* alerts header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>Alerts</span>
          <span style={{ minWidth: 26, textAlign: 'center', padding: '3px 8px', borderRadius: 999, background: 'var(--color-accent-purple-muted)', color: 'var(--color-accent-purple)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>11</span>
        </div>
      </div>

      {/* alert list */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 6, display: 'grid', gap: 2 }}>
        {alerts.map((a, i) => {
          const buy = a.side === 'Buy';
          const c = buy ? GREEN : RED;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 12px', borderRadius: 7 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: c, background: buy ? 'rgba(62,207,164,0.10)' : 'rgba(226,96,78,0.10)', border: `1px solid ${buy ? 'rgba(62,207,164,0.34)' : 'rgba(226,96,78,0.36)'}` }}>
                <span style={{ fontSize: 12, lineHeight: 1 }}>{buy ? '↑' : '↗'}</span>{a.side}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)', letterSpacing: '0.01em' }}>{a.coin}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>›</span>
            </div>);

        })}
      </div>
    </div>);

}

function PrevReporting() {
  const GREEN = '#54CC72',RED = '#E2604E',PURP = '#9B8BFF';
  // value series: rise → peak → decline → low plateau → slight recovery
  const pts = (() => {
    const N = 64;
    const noise = (n) => {let x = Math.sin(n * 12.9898) * 43758.5453;return x - Math.floor(x);};
    const arr = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let base;
      if (t < 0.18) base = 0.72 + t / 0.18 * 0.20;else
      if (t < 0.55) base = 0.92 - (t - 0.18) / 0.37 * 0.62;else
      if (t < 0.72) base = 0.30 - (t - 0.55) / 0.17 * 0.10;else
      base = 0.20 + (t - 0.72) / 0.28 * 0.16;
      let v = base + (noise(i) - 0.5) * 0.05;
      v = Math.max(0.06, Math.min(0.96, v));
      arr.push({ x: t * 600, y: 188 - v * 176 });
    }
    return arr;
  })();
  const linePath = (() => {
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i],q = pts[i - 1];
      const cx = (p.x + q.x) / 2;
      d += ` Q ${q.x.toFixed(1)},${q.y.toFixed(1)} ${cx.toFixed(1)},${((p.y + q.y) / 2).toFixed(1)}`;
    }
    return d;
  })();
  const yLabels = ["$131,076.00", "$129,071.89", "$126,571.89", "$124,071.89", "$121,571.89"];
  const xLabels = ["May 24, 11:00 AM", "May 26, 06:34 PM", "May 29, 02:07 AM", "May 31, 11:09 AM"];
  const ranges = ["Total P&L", "24H", "7D", "30D", "90D", "1Y", "YTD", "MAX"];

  const Stat = ({ l, v, c, arrow }) =>
  <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '13px 15px', position: 'relative' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{l}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: c || 'var(--color-text-primary)', marginTop: 6, letterSpacing: '-0.01em' }}>{v}</div>
      {arrow && <span style={{ position: 'absolute', top: 12, right: 13, color: GREEN, fontSize: 12 }}>↗</span>}
    </div>;


  return (
    <div>
      {/* asset header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, background: '#F7931A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>₿</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--color-text-primary)' }}>Bitcoin</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>BTC</span>
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 1 }}>Ledger</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#EFC435', fontSize: 13 }}>★</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--color-text-primary)' }}>$73,540.00</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: 999, border: `1px solid rgba(226,96,78,0.34)`, background: 'rgba(226,96,78,0.08)', fontFamily: 'var(--font-mono)', fontSize: 11, color: RED }}>↘ -0.34%</span>
        </div>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
        <Stat l="Current Value" v="$123,494.11" />
        <Stat l="Holdings (Qty)" v="1.67927809" />
        <Stat l="Avg Price" v="$33,385.47" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <Stat l="Unrealized P/L" v="+$67,430.63" c={GREEN} arrow />
        <Stat l="Realized P/L" v="$0.0000" />
        <Stat l="Total P/L" v="+$67,430.63" c={GREEN} arrow />
      </div>

      {/* value chart panel */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Value</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, color: 'var(--color-text-primary)', marginTop: 4, letterSpacing: '-0.01em' }}>$123,494.11</div>
            <div style={{ ...{ fontFamily: 'var(--font-mono)', fontSize: 12, color: RED, marginTop: 4 }, color: "rgb(84, 204, 114)" }}>3.70% ($4,745.50)</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 230 }}>
            {ranges.map((r) => {
              const on = r === '7D';
              return <span key={r} style={{ padding: '4px 9px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: on ? PURP : 'var(--color-text-secondary)', border: `1px solid ${on ? 'var(--color-accent-purple-muted)' : 'transparent'}` }}>{r}</span>;
            })}
          </div>
        </div>

        {/* chart */}
        <div style={{ position: 'relative', height: 180 }}>
          {yLabels.map((lab, i) =>
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${i / (yLabels.length - 1) * 100}%`, display: 'flex', alignItems: 'center', gap: 8, transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', width: 74, flexShrink: 0 }}>{lab}</span>
              <span style={{ flex: 1, borderTop: '1px dashed #22243A' }} />
            </div>
          )}
          <svg viewBox="0 0 600 200" preserveAspectRatio="none" style={{ position: 'absolute', left: 82, top: 0, width: 'calc(100% - 82px)', height: '100%', display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="rpFill2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PURP} stopOpacity="0.22" />
                <stop offset="100%" stopColor={PURP} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={linePath + ` L 600,200 L 0,200 Z`} fill="url(#rpFill2)" />
            <path d={linePath} fill="none" stroke={PURP} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingLeft: 82 }}>
          {xLabels.map((d, i) => <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)' }}>{d}</span>)}
        </div>
      </div>
    </div>);

}

function PrevCustody() {
  const venues = [
  { n: "Coinbase", k: "Exchange" },
  { n: "Kraken", k: "Exchange" },
  { n: "Binance", k: "Exchange" },
  { n: "Ledger", k: "Hardware wallet" },
  { n: "Crypto.com", k: "Exchange" },
  { n: "Any other", k: "Exchange or wallet" }];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Trade anywhere · log it here</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-purple)' }}>Exchange-agnostic</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {venues.map((v, i) =>
        <div key={i} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{v.n}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 4, letterSpacing: '0.04em' }}>{v.k}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-success)', letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
              works
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 14, padding: '14px 18px', background: 'rgba(94,84,192,0.08)', border: '1px solid var(--color-accent-purple-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6, letterSpacing: '0.02em' }}>
        <span style={{ color: 'var(--color-accent-purple-hover)' }}>NO ACCESS NEEDED ·</span> LedgerOne never touches your funds or keys. You trade on your own exchange and record it here.
      </div>
    </div>);

}

const FEATURE_TABS = [
{ id: "ledger", ix: "01", label: "Capital ledger", eyebrow: "Capital ledger",
  title: "Every move, recorded in one place.",
  body: "A complete record of what you bought, sold, and why. Execute each trade on your exchange in line with your LedgerOne strategy, then record it here in seconds — maintaining a single, accurate history for tax season and portfolio review.",
  bullets: ["Log your trades in a few taps", "Logs every buy, sell, and rule it follows", "Keeps your full history in one place", "Download as CSV or PDF anytime"],
  Preview: PrevLedger },
{ id: "planning", ix: "02", label: "Allocation framework", eyebrow: "Allocation framework",
  title: "Your goals, turned into a plan.",
  body: "Specify your intended allocation and risk tolerance, and LedgerOne translates them into a precise plan — target holdings for each asset, entry points, and profit-taking levels.",
  bullets: ["Splits your money into clear buckets", "Sets a safe min and max for each asset", "Test your plan against 8 years of history", "See exactly what changes when you adjust it"],
  Preview: PrevAllocation },
{ id: "rules", ix: "03", label: "Rules engine", eyebrow: "Rules engine",
  title: "Your rules, enforced without exception.",
  body: "Define the parameters you're comfortable with — position sizing, profit-taking, and when to stay on the sidelines — and LedgerOne enforces them with discipline. No emotional decisions, no deviations.",
  bullets: ["12 ready-made rule templates to build from", "Apply rules to a single asset or your entire portfolio", "Receive alerts before any threshold is breached", "Every change versioned and auditable"],
  Preview: PrevRules },
{ id: "agent", ix: "04", label: "Allocation agent", eyebrow: "Allocation agent",
  title: "It runs your plan, so you don't have to watch.",
  body: "LedgerOne keeps an eye on your portfolio around the clock and acts on the plan you set — buying, selling, and taking profit at the right moments. Then it tells you exactly what it did. No constant approvals, no stress.",
  bullets: ["Watches your portfolio 24/7", "Buys and sells at the targets you set", "Plain-language summary of every action", "Shows the tax impact before it acts"],
  Preview: PrevAgent },
{ id: "reporting", ix: "05", label: "Reporting", eyebrow: "Reporting",
  title: "Your books and taxes, done for you.",
  body: "Gains, losses, short- vs. long-term, and how you're doing against the market — all worked out automatically as you go. Export it whenever you or your accountant needs it.",
  bullets: ["Tracks your gains and losses live", "Short- and long-term tax breakdown", "See how you're doing vs. the market", "Export to PDF, CSV, or your accountant"],
  Preview: PrevReporting },
{ id: "custody", ix: "06", label: "Venue integration", eyebrow: "Venue integration",
  title: "Works with whatever exchange you use.",
  body: "LedgerOne is exchange-agnostic. You place trades on the exchange or wallet you already trust, then record them here — so your strategy and full history stay in one place, no matter where you trade. Direct exchange sync is on the roadmap.",
  bullets: ["Compatible with any exchange or wallet", "Trade where you already do — nothing to move", "Record each trade manually in seconds", "Direct exchange sync coming soon"],
  Preview: PrevCustody }];


function FeatureTabs() {
  const [active, setActive] = pUseState(0);
  const tab = FEATURE_TABS[active];
  const PreviewC = tab.Preview;
  return (
    <section className="l1-section" data-screen-label="02 Feature tabs" style={{ paddingTop: 40 }}>
      <div className="l1-wrap">
        <L1SectionHead
          eyebrow="Six tools"
          title="The engine, one tool at a time."
          body="Each tool works on its own — and gets more powerful when you use them together." />
        
        <div className="l1-tabbar">
          {FEATURE_TABS.map((t, i) =>
          <button key={t.id} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
              <span className="ix">{t.ix}</span> {t.label}
            </button>
          )}
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
    </section>);

}

/* ------------------ SPEC GRID ------------------ */
function SpecGrid() {
  const cells = [
  { v: "14", l: "Venues supported", b: "Exchanges, custodians, qualified-custody, on-chain." },
  { v: "9", l: "Chains indexed", b: "EVM, Bitcoin, Solana, Cosmos, and growing." },
  { v: "8", u: "Y", l: "Backtest depth", b: "Eight years of cross-chain market data, queried in under two seconds." },
  { v: "12", l: "Rule templates", b: "Drop-in templates for the most common disciplines. Or write your own." },
  { v: "T+1", l: "Settlement", b: "Best-execution audit trail on every fill — captured in the journal." },
  { v: "SOC 2", l: "Compliance", b: "Type II, attested quarterly. Available to enterprise plans on request." },
  { v: "Daily", l: "Evaluation", b: "Every position, every rule, every cycle \u2014 evaluated by the engine on a daily cadence." },
  { v: "100%", l: "Auditable", b: "Every deployment, realization, and rule firing carries provenance." }];

  return (
    <section className="l1-section" data-screen-label="03 Specs" style={{ paddingTop: 0 }}>
      <div className="l1-wrap">
        <L1SectionHead
          eyebrow="By the numbers"
          title="Built like the desk you'd expect." />
        
        <div className="l1-specs">
          {cells.map((c, i) =>
          <div key={i} className="cell">
              <div className="l">{c.l}</div>
              <div className="v">{c.v}{c.u && <span className="u">{c.u}</span>}</div>
              <div className="b">{c.b}</div>
            </div>
          )}
        </div>
      </div>
    </section>);

}

/* ------------------ ARCHITECTURE ------------------ */
function Architecture() {
  return (
    <section className="l1-section" data-screen-label="04 Architecture" style={{ paddingTop: 40 }}>
      <div className="l1-wrap">
        <L1SectionHead
          eyebrow="Architecture"
          title="A disciplined engine, cleanly bounded."
          body="You set your parameters and record your trades; LedgerOne runs your framework and returns a clear plan, alerts, and an auditable record you control. It never touches your funds or your exchange." />
        
        <div className="l1-arch">
          <div className="layer">
            <h5>Inputs</h5>
            <div className="node">
              <div className="t">Your parameters</div>
              <div className="b">Risk profile · sell intensity · volatility · budget</div>
            </div>
            <div className="node">
              <div className="t">Market data</div>
              <div className="b">Public price feeds · spot · price history</div>
            </div>
            <div className="node">
              <div className="t">Your trade log</div>
              <div className="b">You record each buy and sell manually</div>
            </div>
          </div>
          <div className="layer">
            <h5>LedgerOne · engine</h5>
            <div className="node">
              <div className="t">Allocation framework</div>
              <div className="b">Targets · bands · per-level plan</div>
            </div>
            <div className="node">
              <div className="t">Rules engine</div>
              <div className="b">Position limits · profit-taking · versioned</div>
            </div>
            <div className="node">
              <div className="t">Allocation agent</div>
              <div className="b">Framework-aware · alert-driven</div>
            </div>
          </div>
          <div className="layer">
            <h5>Outputs</h5>
            <div className="node">
              <div className="t">Action alerts</div>
              <div className="b">Buy and sell signals you choose to act on</div>
            </div>
            <div className="node">
              <div className="t">Reports</div>
              <div className="b">P&L · performance · PDF · CSV</div>
            </div>
            <div className="node">
              <div className="t">Tax & audit</div>
              <div className="b">Per-lot accounting · full history</div>
            </div>
          </div>
        </div>
      </div>
    </section>);

}

/* ------------------ INTEGRATIONS ------------------ */
function Integrations() {
  const cells = [
  "COINBASE", "KRAKEN", "BINANCE.US", "FIREBLOCKS", "ANCHORAGE", "BITGO",
  "SAFE", "LEDGER", "TREZOR", "ARBITRUM", "BASE", "OPTIMISM"];

  return (
    <section className="l1-section" data-screen-label="05 Integrations" style={{ paddingTop: 40 }}>
      <div className="l1-wrap">
        <L1SectionHead
          eyebrow="Integrations"
          title="Integrated with the venues you already trust." />
        
        <div className="l1-integrations">
          {cells.map((c, i) => <div key={i} className="cell">{c}</div>)}
        </div>
      </div>
    </section>);

}

/* ------------------ APP ------------------ */
function PlatformApp() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <L1Nav active="platform" />
      <PlatformHeader />
      <L1Chrome />
      <FeatureTabs />
      <SpecGrid />
      <Architecture />
      <Integrations />
      <L1ClosingCTA
        title="An engine built for the next ten years of investing."
        body="Configure your engine in minutes. Connect the venues you already trust. The system does the discipline."
        primary="Request Access"
        secondary="Talk to our Team" />
      
      <L1Footer />
    </>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<PlatformApp />);