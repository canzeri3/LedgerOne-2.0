'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Info, BookOpen, Video, ImageIcon, CheckCircle2, ListChecks, HelpCircle,
  LayoutDashboard, BarChart2, RefreshCw, Layers, Wallet, Cpu, ExternalLink, Bell
} from 'lucide-react'

/**
 * HOW TO USE — Institutional layout
 * Clean, scannable structure with sticky in-page TOC, short video slots, and annotated screenshot slots.
 * Order per request:
 *  1) Configure Buy Planner
 *  2) Add or import trades (buying is done on that coin’s page → Add Trade tab)
 * Plus:
 *  - Alerts appear on the Dashboard
 *  - Buy Planner row turns YELLOW when it’s time to buy
 *  - Buy Planner row turns GREEN when the level is filled
 */

const SECTIONS = [
  { id: 'intro',       label: 'Overview',            icon: BookOpen },
  { id: 'quickstart',  label: 'Quick Start',         icon: ListChecks },
  { id: 'walkthrough', label: 'Learn the Features',  icon: LayoutDashboard },
  { id: 'videos',      label: 'Tutorial Videos',     icon: Video },
  { id: 'shots',       label: 'Screenshots',         icon: ImageIcon },
  { id: 'faq',         label: 'FAQ',                 icon: HelpCircle },
  { id: 'resources',   label: 'Resources',           icon: ExternalLink },
]

export default function HowToPage() {
  const [active, setActive] = useState<string>('intro')

  useEffect(() => {
    // Observe section in view to highlight TOC
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries.find((x) => x.isIntersecting)
        if (e?.target?.id) setActive(e.target.id)
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] }
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="w-full px-4 py-6 md:px-8" data-how-to-page>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">How to Use</h1>
          <p className="text-sm text-slate-400 mt-1">
            A guided path from configuring your Buy Planner to taking profit with your Sell Planner.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-slate-300 hover:text-white underline-offset-4 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Content + Right TOC */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_288px] gap-6">
        {/* MAIN CONTENT */}
        <div className="space-y-10">
           {/* Overview / Intro */}
          <section id="intro" aria-label="Overview" className="scroll-mt-24">
            <Card>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                <div className="min-w-0">
                  <SectionTitle icon={<BookOpen className="h-5 w-5" />} title="Overview" />
                  <p className="text-slate-300 text-sm leading-6 mt-2">
                    Start with a Buy Plan, then record fills and take profits with a Sell Plan. Keep it simple:
                    configure, wait for alerts/fills, execute, and track performance.
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2"><Check className="mt-0.5" /> <strong>Configure Buy Planner first.</strong></li>
                    <li className="flex items-start gap-2"><Check className="mt-0.5" /> Then <strong>add trades per coin</strong> from that coin’s page → <em>Add Trade</em> tab.</li>
                    <li className="flex items-start gap-2"><Check className="mt-0.5" /> Later, create a <strong>Sell Planner</strong> and follow alerts to realize gains.</li>
                  </ul>
                </div>

                {/* Intro Video placeholder (16:9). Replace with your embed */}
                <div className="w-full md:w-[480px] aspect-video rounded-xl bg-[rgb(28,29,31)] border border-[rgba(255,255,255,0.06)] overflow-hidden grid place-items-center">
                  <div className="text-xs text-slate-400 p-4 text-center leading-5">
                    Drop your 2–3 min intro video here (Buy → Fills → Sell workflow).<br/>
                    {/* Example:
                    <iframe
                      className="w-full h-full"
                      src="https://www.youtube.com/embed/VIDEO_ID"
                      title="LedgerOne Intro"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    /> */}
                    <Video className="mx-auto mt-2 h-6 w-6 opacity-70" />
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* Quick Start (ORDER: #1 Buy Planner, #2 Add/Import Trades) */}
          <section id="quickstart" aria-label="Quick Start" className="scroll-mt-24">
            <Card>
              <SectionTitle icon={<ListChecks className="h-5 w-5" />} title="Quick Start" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* #1 Configure Buy Planner */}
                <ChecklistCard
                  title="1) Configure a Buy Planner"
                  items={[
                    'Open the Buy/Sell Planner page for your coin.',
                    'Set a Total Budget and choose your Risk Metric.',
                    'Click Save New to generate New Planner.',
                    'Alerts will appear on the Dashboard when it is Time To Buy.',
                     'Made a mistake? Just update the values and click Save New.',
                  ]}
                  icon={<Layers className="h-4 w-4" />}
                />

                {/* #2 Add or import trades */}
                <ChecklistCard
                  title="2) Add or import trades"
                  items={[
                    'To buy a coin: go to that coin’s page → “Add Trade” tab.',
                    'Enter the exact quantity and price shown in your exchange’s filled order.',
                    'Or import multiple with CSV (Portfolio → CSV → Import).',
                  ]}
                  icon={<Wallet className="h-4 w-4" />}
                />

                <ChecklistCard
                  title="3) Create a Sell Planner"
                  items={[
                    'Open the Buy/Sell Planner page for your coin.',
                    'Set the Coin Volitility and choose your Sell Intensity.',
                    'Only once a Buy has been recorded, Click Generate Ladder.',
                    'Alerts will appear on the Dashboard when it is Time To Sell.',
                     'Made a mistake? Just update the values and Generate Ladder again.'
                  ]}
                  icon={<BarChart2 className="h-4 w-4" />}
                />

                <ChecklistCard
                  title="4) Update Coin Cycle"
                  items={[
                   'When a New Cycle alert appears, click it to open that coin’s Buy/Sell Planner.',
    'Enter your New Budget and New Risk Metric, then click Generate New.',
    'Your previous Sell Planner is saved automatically and a new one is created.',
    'No Sell Planner updates are needed after the first setup.',
                  ]}
                  icon={<RefreshCw className="h-4 w-4" />}

                />
              </div>

              {/* Tiny legend for planner row states */}
              <div className="mt-4 text-xs text-slate-300 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> Alerts surface on the Dashboard.</span>
                <Legend />
              </div>
            </Card>
          </section>

          {/* Learn the Features (linkable blocks) */}
          <section id="walkthrough" aria-label="Learn the Features" className="scroll-mt-24">
            <Card>
              <SectionTitle icon={<LayoutDashboard className="h-5 w-5" />} title="Learn the Features" />
              <p className="text-slate-300 text-sm leading-6 mt-2">
                Short guides with a 2–3 min clip and an annotated screenshot. Keep it simple and action-driven.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                <GuideTile
                  href="#guide-buy-planner"
                  title="Buy Planner"
                  blurb="Configure ladder levels based on Total Budget and your Risk Profile; Generate New."
                />
                <GuideTile
                  href="#guide-add-trade"
                  title="Add a Trade (per coin)"
                  blurb="Open the coin page → Add Trade tab; record your executed order."
                />
                <GuideTile
                  href="#guide-sell-planner"
                  title="Sell Planner"
                  blurb="Define Coin Volatility and Sell Intensity settings; generate the sell ladder."
                />
                <GuideTile
                  href="#guide-risk"
                  title="Risk Score (What it means)"
                  blurb="Structure, Volatility, Tail, Correlation, Liquidity → Combined Score."
                />
                <GuideTile
                  href="#guide-data"
                  title="New Coin Cycle"
                  blurb="New cycle detected → review the alert, update Buy Planner inputs, and create a new ladder."
                />
                <GuideTile
                  href="#guide-shortcuts"
                  title="Shortcuts & Tips"
                  blurb="Search, sorting, keyboard hints."
                />
              </div>

              {/* Detailed Guide Sections */}
              <div className="mt-8 space-y-8">
                <GuideDetail id="guide-buy-planner" title="Buy Planner">
                  <TwoCol>
                    <VideoSlot label="2–3 min: Configure Buy Planner" />
                    <ShotSlot label="Generated levels + Active toggles" />
                  </TwoCol>
                  <Bullets items={[
                    'Set Top Price (reference), Total Budget, Depth (70/90), Growth/level.',
                    'System generates buy ladder; toggle Active on levels you want.',
                    'Watch the Dashboard Alerts: your Buy Planner row turns yellow when it’s time to buy, and green after that level is filled.',
                  ]}/>
                  <div className="mt-3"><Legend /></div>
                </GuideDetail>

                <GuideDetail id="guide-add-trade" title="Add a Trade (per coin)">
                  <TwoCol>
                    <VideoSlot label="1–2 min: Add a trade on a coin page" />
                    <ShotSlot label="Coin page → Add Trade tab (annotated)" />
                  </TwoCol>
                  <Bullets items={[
                    'Navigate to the specific coin’s page (e.g., /coins/bitcoin).',
                    'Open the “Add Trade” tab to log your executed buy or sell.',
                    'For bulk imports, use Portfolio → CSV → Import.',
                  ]}/>
                </GuideDetail>

                <GuideDetail id="guide-sell-planner" title="Sell Planner">
                  <TwoCol>
                    <VideoSlot label="2–3 min: Create Sell Planner" />
                    <ShotSlot label="Targets & tiers with %/tokens" />
                  </TwoCol>
                  <Bullets items={[
                    'Define target prices and tokens/% to sell per tier.',
                    'Associate sells with the planner for precise fill tracking.',
                    'Alerts surface when price approaches targets; execute & record.',
                  ]}/>
                </GuideDetail>

                <GuideDetail id="guide-risk" title="Risk Score (What it means)">
                  <TwoCol>
                    <VideoSlot label="2–3 min: Interpreting the Risk Card" />
                    <ShotSlot label="Combined Risk card screenshot" />
                  </TwoCol>
                  <Bullets items={[
                    'Structure (cap tiers), Volatility (regime), Tail (downside stress), Correlation, Liquidity.',
                    'Combined score = Σ(weight×structure) × vol × tail × corr × liq.',
                    'Use it for sizing, rebalancing, and pausing aggressive plans.',
                  ]}/>
                </GuideDetail>

                <GuideDetail id="guide-data" title="Price & History Data">
                  <TwoCol>
                    <VideoSlot label="2–3 min: How price-history works" />
                    <ShotSlot label="Chart intervals & windows" />
                  </TwoCol>
                  <Bullets items={[
                    'New data core only: /api/prices and /api/price-history.',
                    'Intervals vary by window (minute/hourly/daily) for performance.',
                    'Charts align portfolio value with linear interpolation.',
                  ]}/>
                </GuideDetail>

                <GuideDetail id="guide-shortcuts" title="Shortcuts & Tips">
                  <TwoCol>
                    <VideoSlot label="1–2 min: Tips montage" />
                    <ShotSlot label="Holdings search & sort callouts" />
                  </TwoCol>
                  <Bullets items={[
                    'Use Holdings search to filter by name or symbol.',
                    'Sort by QTY/value to surface concentration quickly.',
                    'Switch timeframe tabs to analyze performance windows.',
                  ]}/>
                </GuideDetail>
              </div>
            </Card>
          </section>

          {/* Tutorial Videos gallery */}
          <section id="videos" aria-label="Tutorial Videos" className="scroll-mt-24">
            <Card>
              <SectionTitle icon={<Video className="h-5 w-5" />} title="Tutorial Videos" />
              <p className="text-slate-300 text-sm leading-6 mt-2">
                Keep videos short (2–5 min) and focused. Title them clearly—for example “Configure Buy Planner,”
                “Add a Trade on Coin Page,” or “Understanding the Risk Score.”
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <VideoThumb title="Configure Buy Planner" />
                <VideoThumb title="Add Trade on Coin Page" />
                <VideoThumb title="Create Sell Planner Targets" />
                <VideoThumb title="Exposure & Risk Explained" />
                <VideoThumb title="Charts & Timeframes" />
                <VideoThumb title="CSV Import" />
              </div>
            </Card>
          </section>

          {/* Screenshots (annotated) */}
          <section id="shots" aria-label="Screenshots" className="scroll-mt-24">
            <Card>
              <SectionTitle icon={<ImageIcon className="h-5 w-5" />} title="Screenshots with Callouts" />
              <p className="text-slate-300 text-sm leading-6 mt-2">
                Use callouts to highlight controls and interpretations. Keep file sizes modest for fast loads.
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <ShotThumb caption="Coin page → Add Trade tab" />
                <ShotThumb caption="Buy planner levels — generated ladder" />
                <ShotThumb caption="Sell planner targets — tiers & fills" />
                <ShotThumb caption="Risk score — combined metric" />
                <ShotThumb caption="Holdings table — sorting & search" />
                <ShotThumb caption="Portfolio growth — timeframe tabs" />
              </div>
            </Card>
          </section>

          {/* FAQ */}
          <section id="faq" aria-label="FAQ" className="scroll-mt-24">
            <Card>
              <SectionTitle icon={<HelpCircle className="h-5 w-5" />} title="FAQ" />
              <div className="mt-4 divide-y divide-slate-700/40">
                <Faq q="Where do I buy a coin / add a buy?" a="Go to that coin’s page (e.g., /coins/bitcoin), then open the “Add Trade” tab to record your executed buy. For multiple, use Portfolio → CSV → Import." />
                <Faq q="Should I configure the Buy Planner before adding trades?" a="Yes. Configure your Buy Plan first so alerts and ladders are ready. Then add trades (on coin pages) as you execute." />
                <Faq q="How will I know when it’s time to buy or when a level is filled?" a="You’ll see Alerts on the Dashboard. Your Buy Planner row turns yellow when it’s time to buy, and turns green once that level is filled." />
                <Faq q="How are risk factors combined?" a="Combined score = Σ(weight×structure) × vol × tail × corr × liq. It’s benchmarked to BTC regimes and liquidity tiers." />
                <Faq q="Can I use legacy price endpoints?" a="No. This app uses the NEW data core only: /api/prices and /api/price-history." />
              </div>
            </Card>
          </section>

          {/* Resources */}
          <section id="resources" aria-label="Resources" className="scroll-mt-24">
            <Card>
              <SectionTitle icon={<ExternalLink className="h-5 w-5" />} title="Resources" />
              <ul className="mt-2 text-sm text-slate-300 space-y-2">
                <li>• CSV template & import guide</li>
                <li>• Risk methodology explainer (PDF)</li>
                <li>• Release notes & changes</li>
                <li>• Support & contact</li>
              </ul>
            </Card>
          </section>

          {/* Footer note */}
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Info className="h-4 w-4" />
            This page is safe to expand anytime with more videos, images, and FAQs.
          </div>
        </div>

        {/* RIGHT STICKY IN-PAGE NAV */}
        <aside className="hidden xl:block">
          <div className="sticky top-20 rounded-xl bg-[rgb(28,29,31)] border border-[rgba(255,255,255,0.06)] p-3">
            <div className="text-xs font-semibold text-slate-300 mb-2">On this page</div>
            <nav className="space-y-1">
              {SECTIONS.map(s => {
                const Icon = s.icon
                const isActive = active === s.id
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={[
                      'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition',
                      isActive
                        ? 'bg-[rgba(137,128,213,0.12)] text-[rgb(205,195,255)] ring-1 ring-[rgba(167,128,205,0.35)]'
                        : 'text-slate-300 hover:text-white hover:bg-[rgba(255,255,255,0.06)]'
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4 opacity-80" />
                    <span>{s.label}</span>
                  </a>
                )
              })}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ——— Small building blocks (no external UI libs) ——— */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[rgb(28,29,31)] border border-[rgba(255,255,255,0.06)] p-4">
      {children}
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid place-items-center rounded-lg bg-[rgba(255,255,255,0.06)] h-9 w-9">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
    </div>
  )
}

function Check({ className }: { className?: string }) {
  return <CheckCircle2 className={['h-4 w-4 text-emerald-400', className].filter(Boolean).join(' ')} />
}

function ChecklistCard({
  title, items, icon,
}: { title: string; items: string[]; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] p-3 bg-[rgb(34,35,39)]">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-8 w-8 rounded-md bg-[rgba(255,255,255,0.06)] grid place-items-center">
          {icon ?? <Cpu className="h-4 w-4" />}
        </div>
        <div className="font-medium">{title}</div>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-300">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GuideTile({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgb(34,35,39)] p-3 hover:bg-[rgba(255,255,255,0.06)] transition"
    >
      <div className="font-medium">{title}</div>
      <div className="text-sm text-slate-400 mt-1">{blurb}</div>
    </a>
  )
}

function GuideDetail({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="text-sm font-semibold text-slate-200 mb-2">{title}</div>
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] p-3 bg-[rgb(34,35,39)]">
        {children}
      </div>
    </section>
  )
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}

function VideoSlot({ label = 'Short walkthrough video (2–3 min)' }: { label?: string }) {
  return (
    <div className="aspect-video rounded-md bg-[rgb(28,29,31)] border border-[rgba(255,255,255,0.06)] overflow-hidden grid place-items-center">
      <div className="text-xs text-slate-400 p-3 text-center leading-5">
        {label}<br/>
        {/* Example:
        <iframe
          className="w-full h-full"
          src="https://www.youtube.com/embed/VIDEO_ID"
          title="How-To"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        /> */}
        <Video className="mx-auto mt-2 h-5 w-5 opacity-70" />
      </div>
    </div>
  )
}

function ShotSlot({ label = 'Annotated screenshot' }: { label?: string }) {
  return (
    <div className="h-[220px] rounded-md bg-[rgb(28,29,31)] border border-[rgba(255,255,255,0.06)] overflow-hidden grid place-items-center">
      <div className="text-xs text-slate-400 p-3 text-center leading-5">
        {label}<br/>
        {/* Drop a <Image /> or <img /> here. Keep width <= 1600px for performance. */}
        <ImageIcon className="mx-auto mt-2 h-5 w-5 opacity-70" />
      </div>
    </div>
  )
}

function VideoThumb({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgb(34,35,39)] overflow-hidden">
      <div className="aspect-video bg-[rgb(28,29,31)] grid place-items-center">
        <Video className="h-6 w-6 opacity-70" />
      </div>
      <div className="p-3 text-sm font-medium">{title}</div>
    </div>
  )
}

function ShotThumb({ caption }: { caption: string }) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgb(34,35,39)] overflow-hidden">
      <div className="h-[160px] bg-[rgb(28,29,31)] grid place-items-center">
        <ImageIcon className="h-6 w-6 opacity-70" />
      </div>
      <div className="p-3 text-sm text-slate-300">{caption}</div>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-4"
      >
        <span className="font-medium text-slate-200 text-sm">{q}</span>
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="mt-2 text-sm text-slate-300 leading-6">{a}</p>}
    </div>
  )
}

/* Small legend / badges */
function BadgeYellow({ label = 'yellow' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-yellow-400/20 text-yellow-200 ring-1 ring-yellow-400/30">
      {label}
    </span>
  )
}
function BadgeGreen({ label = 'green' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30">
      {label}
    </span>
  )
}
function Legend() {
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-400">Planner row states:</span>
      <BadgeYellow label="time to buy" />
      <BadgeGreen label="level filled" />
    </div>
  )
}

/* Bullets helper used in guide sections */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm text-slate-300">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2">
          <Check className="mt-0.5" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}
