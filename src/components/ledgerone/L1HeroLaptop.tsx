'use client'

import Image from 'next/image'
import { useMemo, useState, useEffect } from 'react'

function buildSparkPath() {
  const seed = (n: number) => { const x = Math.sin(n) * 10000; return x - Math.floor(x) }
  const pts: { x: number; y: number }[] = []
  let v = 0.35
  for (let i = 0; i < 60; i++) {
    v += (seed(i + 1) - 0.42) * 0.10
    v = Math.max(0.10, Math.min(0.92, v))
    pts.push({ x: (i / 59) * 900, y: 230 - v * 180 - 12 })
  }
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1]
    const cx = (p.x + q.x) / 2
    d += ` Q ${q.x},${q.y} ${cx},${(p.y + q.y) / 2}`
  }
  return d
}

const HOLDINGS = [
  { sym: 'BTC', glyph: '₿', name: 'Bitcoin',   price: '$73,585.20', alloc: 38.72, amount: '1.67927809 BTC',        value: '$123,570.01', bar: '#F7931A', bg: '#F7931A', fg: '#fff' },
  { sym: 'ETH', glyph: 'Ξ', name: 'Ethereum',  price: '$2,009.77',  alloc: 36.18, amount: '57.46362264 ETH',       value: '$115,488.51', bar: '#7C6FF7', bg: '#23252F', fg: '#D6D9E6' },
  { sym: 'CRO', glyph: 'C', name: 'Cronos',    price: '$0.067625',  alloc: 23.84, amount: '1,125,000 CRO',         value: '$76,078.29',  bar: '#16C3D8', bg: '#14233F', fg: '#5B86C9' },
  { sym: 'AVAX',glyph: '▲', name: 'Avalanche', price: '$8.88',      alloc:  1.27, amount: '454.84714286 AVAX',     value: '$4,040.65',   bar: '#16C3D8', bg: '#E84142', fg: '#fff' },
]

const COINS = [
  { s: 'BTC',  n: 'Bitcoin',   r: 1,  fav: true },
  { s: 'ETH',  n: 'Ethereum',  r: 2,  fav: true },
  { s: 'AVAX', n: 'Avalanche', r: 26, fav: true },
  { s: 'USDT', n: 'Tether',    r: 3 },
  { s: 'BNB',  n: 'BNB',       r: 4 },
  { s: 'XRP',  n: 'XRP',       r: 5 },
  { s: 'USDC', n: 'USDC',      r: 6 },
  { s: 'SOL',  n: 'Solana',    r: 7 },
]

function PortfolioSnapshot() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const spark = useMemo(() => buildSparkPath(), [])

  return (
    <div className="lp-portfolio">
      <aside className="lp-side">
        <div className="lp-side-brand">
          <Image src="/ledgerone-logo.png" alt="LedgerOne" width={120} height={44} style={{ objectFit: 'contain', objectPosition: 'left center' }} />
        </div>
        <div className="lp-side-grp">
          <div className="lp-side-item cur">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
            <span>Dashboard</span>
          </div>
          {[
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>, label: 'Planner' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v0H5a2 2 0 0 0-2 2z"/><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="16.5" cy="13" r="1.2"/></svg>, label: 'Portfolio' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>, label: 'Audit Log' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/></svg>, label: 'CSV' },
            { icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.85a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9z"/></svg>, label: 'Settings' },
          ].map(({ icon, label }) => (
            <div key={label} className="lp-side-item">{icon}<span>{label}</span></div>
          ))}
        </div>

        <div className="lp-coins-head">
          <div className="lp-coins-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.66 2.69 3 6 3s6-1.34 6-3V7"/><path d="M9 15v2c0 1.66 2.69 3 6 3s6-1.34 6-3v-5c0-1.3-1.64-2.4-3.95-2.82"/></svg>
            <span>Coins</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div className="lp-coins-search">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-3.6-3.6"/></svg>
          <span>Search coins…</span>
        </div>
        <div className="lp-coin-list">
          {COINS.map((c) => (
            <div key={c.s} className="lp-coin">
              <span className="cs">{c.s}</span>
              <span className="cn">{c.n}</span>
              <span className="rk">#{c.r}</span>
              {c.fav && (
                <svg className="star" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M12 2l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.8 6.1 20.8l1.2-6.6L2.4 9l6.7-.9z"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="lp-main">
        <div className="lp-top">
          <div className="lp-crumb">Workspace / <b>Portfolio</b></div>
          <div className="lp-search">Search tickers, rules…</div>
        </div>
        <div className="lp-content">
          <div className="lp-h1">
            <div>
              <h1>Portfolio</h1>
              <div className="sub">Live · last refreshed 14s ago</div>
            </div>
            <div className="lp-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span>Alerts</span>
            </div>
          </div>

          <div className="lp-kpi-row">
            {[
              { lbl: 'Net asset value',  val: '$248,920.47', delta: '↗ +1.29%',       cls: 'pos' },
              { lbl: '30D Performance',  val: '+12.84%',     delta: 'vs. BTC +4.1pt', cls: 'neut' },
              { lbl: 'Cash on hand',     val: '$18,402.00',  delta: '7.4% of NAV',   cls: 'neut' },
              { lbl: 'Drawdown · 90D',   val: '+31.21%',     delta: '↘ within cap',  cls: 'neg', deltaColor: 'rgb(62,207,164)' },
            ].map(({ lbl, val, delta, cls, deltaColor }) => (
              <div key={lbl} className="lp-kpi">
                <div className="lbl">{lbl}</div>
                <div className="val">{val}</div>
                <div className={`delta ${cls}`} style={deltaColor ? { color: deltaColor } : undefined}>{delta}</div>
              </div>
            ))}
          </div>

          <div className="lp-chart">
            <div className="lp-chart-head">
              <div>
                <div className="lp-chart-title">Portfolio balance</div>
                <div className="lp-chart-val">$248,920.47</div>
                <div className="lp-chart-meta pos">↗ +$28,194.12 · +12.84% · over 30D</div>
              </div>
              <div className="lp-seg">
                <span>24H</span><span>7D</span><span className="on">30D</span><span>90D</span><span>1Y</span>
              </div>
            </div>
            <svg viewBox="0 0 900 240" preserveAspectRatio="none" className="lp-chart-svg">
              <defs>
                <linearGradient id="lpFill2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C6FF7" stopOpacity="0.32"/>
                  <stop offset="100%" stopColor="#7C6FF7" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[60, 120, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2="900" y2={y} stroke="#22243A" strokeDasharray="2 6"/>
              ))}
              {mounted && (
                <>
                  <path d={`${spark} L 900,240 L 0,240 Z`} fill="url(#lpFill2)"/>
                  <path d={spark} fill="none" stroke="#9B8BFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </>
              )}
            </svg>
          </div>

          <div className="lp-table">
            <div className="lp-table-head">
              <h2>Portfolio Holdings</h2>
              <span className="lp-table-link">All assets →</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Price</th>
                  <th>Allocation</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {HOLDINGS.map((r) => (
                  <tr key={r.sym}>
                    <td>
                      <div className="lp-ticker">
                        <div className="sym" style={{ background: r.bg, borderColor: r.bg, color: r.fg, fontFamily: 'var(--font-display,serif)', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{r.glyph}</div>
                        <div className="lp-ticker-name">
                          <span className="nm">{r.name}</span>
                          <span className="tk">{r.sym}</span>
                        </div>
                      </div>
                    </td>
                    <td className="lp-price">{r.price}</td>
                    <td>
                      <div className="lp-alloc">
                        <span className="pct">{r.alloc.toFixed(2)}%</span>
                        <div className="track"><div className="fill" style={{ width: r.alloc + '%', background: r.bar }}/></div>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{r.amount}</td>
                    <td className="num" style={{ textAlign: 'right', color: '#fff' }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function useLaptopOpenAnimation() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    function arm(laptop: HTMLElement) {
      laptop.classList.add('no-anim', 'is-armed')
      void laptop.offsetWidth // force reflow to commit closed state without transition
      laptop.classList.remove('no-anim')

      function open() {
        setTimeout(() => laptop.classList.add('is-open'), 220)
      }

      if (!('IntersectionObserver' in window)) { open(); return }
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { open(); obs.unobserve(entry.target) }
        })
      }, { threshold: 0.35 })
      obs.observe(laptop)
    }

    function findLaptop(attempts: number) {
      const laptop = document.querySelector('.l1-laptop') as HTMLElement | null
      if (laptop) { arm(laptop); return }
      if (attempts > 60) return
      setTimeout(() => findLaptop(attempts + 1), 100)
    }

    findLaptop(0)
  }, [])
}

export function L1HeroLaptop() {
  useLaptopOpenAnimation()
  return (
    <div className="l1-laptop-scaler">
      <div className="l1-laptop" aria-hidden="true">
        <div className="l1-laptop-glow"/>
        <div className="l1-laptop-lid">
          <div className="l1-laptop-screen">
            <div className="l1-laptop-notch"/>
            <div className="l1-laptop-display">
              <PortfolioSnapshot/>
            </div>
          </div>
        </div>
        <div className="l1-laptop-hinge"/>
        <div className="l1-laptop-base">
          <div className="l1-laptop-base-shadow"/>
          <div className="l1-laptop-base-slot"/>
        </div>
      </div>
    </div>
  )
}
