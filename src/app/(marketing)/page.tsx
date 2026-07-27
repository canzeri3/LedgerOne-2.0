'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { L1Nightsky, L1Grain, L1Icon, L1ClosingCTA, L1Footer, L1HeroLaptop } from '@/components/ledgerone'
import { supabaseBrowser } from '@/lib/supabaseClient'

/* Session-aware Dashboard link — unchanged working component. */
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
          Investing with a<br />Clear Plan
        </h1>
        <p className="l1-hero-sub">
          LedgerOne brings institutional-level strategy to crypto investors — helping them track
          their portfolio, plan smarter buying and selling decisions, and stay disciplined with a
          clear long-term plan.
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

/* ---- 1 · The promise -------------------------------------- */
function PromiseBlock() {
  return (
    <section className="hm hm-promise">
      <div className="hm-narrow">
        <p className="hm-eyebrow">Why LedgerOne</p>
        <h2>
          Crypto that grows <span className="accent">while you sleep.</span>
        </h2>
        <p>
          You set the rules once. LedgerOne plans every move and guides you through the dips, the
          profit-taking, and the moments others panic. No charts to watch. No decisions to
          second-guess.
        </p>
      </div>
    </section>
  )
}

/* ---- 2 · Before / after ----------------------------------- */
function BeforeAfter() {
  return (
    <section className="hm" style={{ paddingTop: 0 }}>
      <div className="hm-narrow">
        <div className="hm-split">
          <div className="hm-panel before">
            <p className="hm-panel-tag">Doing it yourself</p>
            <h3>Every dip is a decision. Every decision is stress.</h3>
            <ul className="hm-feelings">
              <li><span className="dot"></span>Checking prices at 3am.</li>
              <li><span className="dot"></span>Selling the bottom in fear.</li>
              <li><span className="dot"></span>Buying the top on FOMO.</li>
              <li><span className="dot"></span>Always wondering: did I miss it?</li>
            </ul>
            <svg className="hm-spark" viewBox="0 0 300 92" preserveAspectRatio="none" aria-hidden="true">
              <path className="hm-spark-line" d="M0,46 L26,22 L50,64 L78,28 L104,76 L132,34 L160,80 L190,44 L218,82 L248,38 L274,70 L300,52" />
            </svg>
          </div>

          <div className="hm-panel after">
            <p className="hm-panel-tag">With LedgerOne</p>
            <h3>A plan that already acted — before you woke up.</h3>
            <ul className="hm-feelings">
              <li><span className="dot"></span>Bought the dip — automatically.</li>
              <li><span className="dot"></span>Took profit at your target.</li>
              <li><span className="dot"></span>Held the line when others panicked.</li>
              <li><span className="dot"></span>You slept through all of it.</li>
            </ul>
            <svg className="hm-spark" viewBox="0 0 300 92" preserveAspectRatio="none" aria-hidden="true">
              <path className="hm-spark-line" d="M0,78 C50,72 80,66 130,54 C180,42 210,30 260,18 C275,14 288,12 300,9" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- 3 · The dream ---------------------------------------- */
function Dream() {
  return (
    <section className="hm hm-dream" style={{ paddingTop: 0 }}>
      <div className="hm-narrow">
        <p className="hm-eyebrow">The outcome</p>
        <h2>While you lived your life, the engine kept working.</h2>
        <p className="sub">
          Discipline doesn&apos;t take days off. Here&apos;s a year of it — and where you were.
        </p>

        <div className="hm-curve-wrap">
          <div className="hm-curve-top">
            <div>
              <p className="l">Portfolio value</p>
              <span className="v">$48,745</span>
              <span className="delta">  ▴ 67.45% this year</span>
            </div>
            <div className="hm-curve-legend">
              <span><i style={{ background: '#9B8CFF' }}></i>Your portfolio</span>
              <span><i style={{ background: '#3ECFA4' }}></i>Engine acted</span>
            </div>
          </div>

          <div className="hm-curve">
            <svg viewBox="0 0 1180 360" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="hmFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(124,111,247,0.28)" />
                  <stop offset="100%" stopColor="rgba(124,111,247,0)" />
                </linearGradient>
              </defs>
              <path
                fill="url(#hmFill)"
                stroke="none"
                d="M0,305 C80,298 120,290 200,280 S340,250 420,252 S560,212 640,200 S760,160 820,186 S960,150 1040,118 S1140,92 1180,72 L1180,360 L0,360 Z"
              />
              <path
                className="hm-curve-line"
                d="M0,305 C80,298 120,290 200,280 S340,250 420,252 S560,212 640,200 S760,160 820,186 S960,150 1040,118 S1140,92 1180,72"
              />
            </svg>

            <div className="hm-marker m1" style={{ left: '23.7%', top: '75.6%' }}>
              <div className="moment">You were asleep</div>
              <div className="action">bought the dip</div>
              <div className="pin"></div>
            </div>
            <div className="hm-marker m2" style={{ left: '54.2%', top: '55.6%' }}>
              <div className="moment">You were on vacation</div>
              <div className="action">took profit</div>
              <div className="pin"></div>
            </div>
            <div className="hm-marker m3" style={{ left: '88.1%', top: '32.8%' }}>
              <div className="moment">You just lived</div>
              <div className="action">compounded</div>
              <div className="pin"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- 4 · Three steps -------------------------------------- */
const STEPS = [
  { n: '01', ic: 'sliders' as const, t: 'Set your rules.', b: 'Pick your risk, your capital, and the coins you want. Five minutes, once.' },
  { n: '02', ic: 'refresh' as const, t: 'It tells you when to act.', b: 'Get an alert the instant it’s time to buy or sell — or set it to place the orders for you.' },
  { n: '03', ic: 'chart' as const, t: 'Watch it compound.', b: 'Gains recycle into the next cycle. You check in when you feel like it.' },
]

function Steps() {
  return (
    <section className="hm" style={{ paddingTop: 0 }}>
      <div className="hm-narrow">
        <div className="hm-steps-head">
          <h2>Set it once. It runs forever.</h2>
        </div>
        <div className="hm-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="hm-step">
              <div className="n">{s.n}</div>
              <div className="ic"><L1Icon name={s.ic} size={22} /></div>
              <h4>{s.t}</h4>
              <p>{s.b}</p>
              <div className="arrow"><L1Icon name="arrowRight" size={20} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
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
      <PromiseBlock />
      <BeforeAfter />
      <Dream />
      <Steps />
      <L1ClosingCTA
        title="Stop reacting. Start compounding."
        body="Risk profile in. Capital in. The engine deploys, realizes, and compounds across cycles — without intervention."
      />
      <L1Footer />
    </>
  )
}
