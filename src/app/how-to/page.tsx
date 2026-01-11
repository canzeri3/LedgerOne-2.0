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
                                        <li className="flex items-start gap-2"><Check className="mt-0.5" /> <strong>It is strongly recommended to adhere to the plan and avoid discretionary deviations.</strong></li>

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
                    'Open the Buy/Sell Planner page for the asset you want to accumulate.',
                    'Set your Total Budget and Choose a Risk Profile.',
                    'Click “Save New” to generate your Buy Planner for the current cycle.',
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
'Set the Coin Volatility and choose your Sell Intensity.',
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
<Legend showCycle />
              </div>
            </Card>
          </section>

          {/* Learn the Features (linkable blocks) */}
<section id="walkthrough" aria-label="Learn the Features" className="scroll-mt-24">
  {/* Title + description (no full card behind the tiles) */}
  <div className="px-1">
    <SectionTitle icon={<LayoutDashboard className="h-5 w-5" />} title="Learn the Features" />
    <p className="text-slate-300 text-sm leading-6 mt-2">
      Short guides with a 2–3 min clip and an annotated screenshot. Keep it simple and action-driven.
    </p>
  </div>

  {/* Floating tiles */}
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
    <GuideTile
      href="#guide-buy-planner"
      title="Buy Planner"
      blurb="Institutional-style accumulation ladder."
    />

    <GuideTile
      href="#guide-add-trade"
      title="Add a Trade (per coin)"
      blurb="Record your external executed orders."
    />

    <GuideTile
      href="#guide-sell-planner"
      title="Sell Planner"
      blurb="Institutional-style scale out ladder"
    />

    <GuideTile
      href="#New Cycle"
      title="New Coin Cycle"
      blurb="LedgerOne’s cycle detection system."
    />

    <GuideTile
      href="#guide-risk"
      title="Risk Score (What it means)"
      blurb="Quantifiable portfolio risk metric."
    />

    <GuideTile
      href="#guide-shortcuts"
      title="Shortcuts & Tips"
      blurb="Search, sorting, keyboard hints."
    />
  </div>

  {/* End Learn the Features section here (tiles stay standalone/floating) */}
</section>

{/* Detailed Guide Sections (separate floating cards per feature) */}
<section aria-label="Detailed Guides" className="scroll-mt-24 mt-6 space-y-6">

                          <GuideDetail id="guide-buy-planner" title="Buy Planner">
                  <TwoCol>
                    <VideoSlot label="2–3 min: Configure Buy Planner" />
                    <ShotSlot label="Generated ladder + fill tracking (yellow/green states)" />
                  </TwoCol>

                  <p className="mt-3 text-sm text-slate-300 leading-6">
                    The Buy Planner is a rules-based accumulation framework. You define a fixed capital budget and select a risk profile; LedgerOne
                    then constructs a ladder of pre-defined levels from the current cycle, tracks fills against each tranche, and
                    displays execution signals through Dashboard alerts and yellow rows on the planner.
                  </p>

                <Bullets items={[
  'Navigate to the Buy/Sell Planner page',
    'Configure: set your Total Budget and select a Risk Profile to define your accumulation approach for this cycle.',
  'Execute: when a row turns yellow (“time to buy”), place the buy with your exchange/broker, then record the fill under that coin → Add Trade.',
  'Track: the planner shows what is planned versus what has been filled, keeping you accountable and consistent.',
'Governance: Risk Profile defines how cautious or assertive your plan is.',
]}/>

                  <div className="mt-4">
                    <BuyPlannerInstitutionalGuide />
                  </div>

                  <div className="mt-3"><LegendBuyPlanner /></div>
                </GuideDetail>


<GuideDetail id="guide-add-trade" title="Add a Trade (per coin)">
  <TwoCol>
    <VideoSlot label="1–2 min: Add a trade on a coin page" />
    <ShotSlot label="Coin page → Add Trade tab (annotated)" />
  </TwoCol>

  <p className="mt-3 text-sm text-slate-300 leading-6">
    Add Trade is your book of record for executed orders. LedgerOne does not place orders; it records what you executed
    and uses those entries to keep holdings, planner progress, realized/unrealized P&L, and reporting accurate and auditable.
  </p>

  <Bullets items={[
    'Navigate to the coin you executed on → open the Add Trade tab.',
    'Select Side (Buy / Sell).',
    'Enter the exact filled Price and Quantity. For Buys, Quantity can be entered as USD or Tokens (use the lock icon to unlock and switch modes). For Sells, Quantity is recorded in Tokens.',
    'Optionally add Fee and set the correct Date/Time to keep sequencing and reporting clean.',
    'Sell attribution: sells default to the Active Sell Planner, but you can override and select a Frozen planner version so the correct ladder’s progress updates.',
    'Click Add Trade and confirm the success message; holdings and planner fill states refresh immediately.',
    'For historical backfills or bulk entry, use Portfolio → CSV → Import.',
  ]}/>

  <div className="mt-4">
    <AddTradeInstitutionalGuide />
  </div>
</GuideDetail>


              <GuideDetail id="guide-sell-planner" title="Sell Planner">
  <TwoCol>
    <VideoSlot label="2–3 min: Create Sell Planner" />
    <ShotSlot label="Sell checkpoints + fill tracking (yellow/green states)" />
  </TwoCol>

  <p className="mt-3 text-sm text-slate-300 leading-6">
    The Sell Planner is a structured distribution framework. It defines how you scale out of a position in a controlled,
    repeatable way, with clear execution prompts, progress tracking, and Sell alerts—so profits are taken systematically
    rather than emotionally.
  </p>

 <Bullets
  items={[
    'Navigate: open the Buy/Sell Planner page for the coin and switch to the Sell Planner section.',
    'Configure: choose Coin Volatility and Sell Intensity, then click Generate Ladder to produce your Sell Planner.',
'Execute: when a row turns yellow (“time to sell”), execute the sell with your exchange/broker, then record it under that coin → Add Trade (select Active or the relevant Frozen planner version so fills apply to the correct ladder).',
    'Track: the planner shows progress through fill percentage; a row turns green (“level filled”) once that level is complete.',
    'Governance: Coin Volatility and Sell Intensity define how patient or assertive your distribution plan is.',
  ]}
/>


  <div className="mt-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-3">
    <div className="text-sm font-medium text-slate-200">Planner versioning</div>
   <div className="mt-1 text-sm text-slate-300 leading-6 space-y-2">
  <p>
    LedgerOne uses planner versioning to keep sell planning consistent and auditable over time.
  </p>

  <div className="space-y-1">
    <div className="font-semibold text-slate-200">When you generate a new Buy Planner</div>
    <ul className="list-disc list-inside space-y-1">
   <li>
  If you already have an active <span className="font-semibold text-slate-200">Sell Planner</span>, it now gets <span className="font-semibold text-slate-200">locked</span> as a prior version
  (it remains available and does not change).
</li>
<li>
  A new <span className="font-semibold text-slate-200">Sell Planner</span> becomes active for the current cycle using the same <span className="font-semibold text-slate-200">inputted</span> settings as your
  previous planner. You can adjust inputs and click{' '}
  <span className="font-semibold text-slate-200">Generate Ladder</span> to update the new version.
</li>

    </ul>
  </div>

  <div className="space-y-1">
    <div className="font-semibold text-slate-200">How tracking works</div>
    <ul className="space-y-1">
      <li className="flex gap-2">
        <span className="text-slate-400">→</span>
        <span>
          Each Sell Planner is tracked <span className="font-semibold text-slate-200">independently</span>.
        </span>
      </li>
      <li className="flex gap-2">
        <span className="text-slate-400">→</span>
        <span>
          Only sells you record and <span className="font-semibold text-slate-200">attach to a specific planner</span>{' '}
          update that planner’s row states and progress.
        </span>
      </li>
      <li className="flex gap-2">
        <span className="text-slate-400">→</span>
        <span>
          This prevents activity from being <span className="font-semibold text-slate-200">mixed across versions</span>.
        </span>
      </li>
    </ul>
  </div>
</div>

  </div>
  <div className="mt-4">
    <SellPlannerInstitutionalGuide />
  </div>

  <div className="mt-3">
    <LegendSellPlanner />
  </div>
</GuideDetail>


<GuideDetail id="New Cycle" title="New Coin Cycle">
  <TwoCol>
    <VideoSlot label="1–2 min: New Cycle alert workflow" />
    <ShotSlot label="Create New Cycle alert + refreshed planner (annotated)" />
  </TwoCol>

  <p className="mt-3 text-sm text-slate-300 leading-6">
    LedgerOne identifies when an asset enters a new major price cycle and surfaces a{' '}
    <span className="font-semibold text-slate-200">Create New Cycle</span> alert. A cycle refresh is a governance step:
    it resets your accumulation plan for the current phase while preserving prior-cycle sell planning history for clean,
    auditable tracking.
  </p>

  <div className="mt-3 text-sm text-slate-300 leading-6 space-y-3">
    <div className="space-y-1">
      <div className="font-semibold text-slate-200">What you do</div>
      <ul className="list-disc list-inside space-y-1">
        <li>Open the alert to navigate directly to the coin’s Buy/Sell Planner.</li>
        <li>
          Review and update your Buy Planner inputs for the new cycle (especially{' '}
          <span className="font-semibold text-slate-200">Total Budget</span> and{' '}
          <span className="font-semibold text-slate-200">Risk Profile</span>), then click{' '}
          <span className="font-semibold text-slate-200">Save New</span>.
        </li>
      </ul>
    </div>

    <div className="space-y-1">
      <div className="font-semibold text-slate-200">What LedgerOne does automatically</div>
      <ul className="space-y-1">
        <li className="flex gap-2">
          <span className="text-slate-400">→</span>
          <span>
            Creates a <span className="font-semibold text-slate-200">new Buy Planner</span> ladder for the updated cycle so
            future tracking reflects the refreshed plan.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-slate-400">→</span>
          <span>
            Locks the prior <span className="font-semibold text-slate-200">Sell Planner</span> as history (frozen), and a
            new Sell Planner version becomes active for the new cycle.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-slate-400">→</span>
          <span>
            Maintains <span className="font-semibold text-slate-200">clean attribution</span> so new activity is tracked
            against the current cycle rather than blended into prior versions.
          </span>
        </li>
      </ul>
    </div>
  </div>

  <div className="mt-3">
    <LegendRiskScore />
  </div>
</GuideDetail>


            <GuideDetail id="guide-risk" title="Risk Score (What it means)">
  <TwoCol>
    <VideoSlot label="2–3 min: Interpreting the Risk Card" />
    <ShotSlot label="Combined Risk card screenshot" />
  </TwoCol>

<p className="mt-3 text-sm text-slate-300 leading-6">
  The Risk Score is a standardized, portfolio-grade metric that summarizes your portfolio’s risk conditions into a single,
  comparable score. It decomposes risk into five components (Structural, Volatility, Tail Risk, Correlation, Liquidity)
  and rolls them up into a <span className="font-semibold text-slate-200">Total Combined Risk</span> number plus a level
  badge (Low / Moderate / High / Very High).
</p>

<Bullets
  items={[
    'Interpretation: higher score = higher-risk regime; lower score = more stable conditions.',
    'Purpose: governance and allocation consistency—used to compare, size, and review exposure (not an execution signal).',
    'How to use it: treat “Very High” as a caution regime (sizing discipline, concentration review), not a buy/sell trigger.',
  ]}
/>

  <div className="mt-4">
    <RiskScoreInstitutionalGuide />
  </div>

  <div className="mt-3">
    <LegendRiskScore />
  </div>
</GuideDetail>



             <GuideDetail id="guide-shortcuts" title="Shortcuts & Tips">
  <TwoCol>
    <VideoSlot label="1–2 min: Tips montage" />
    <ShotSlot label="Holdings search & sort callouts" />
  </TwoCol>

  <Bullets items={[
    'Header Calculator: use the calculator in the top header to add up totals across planner rows (toggle Tokens / $). Use Copy to paste the total where needed.',
    'Quick portfolio import: if you already hold a position and you do not have every individual fill, add a single Buy trade using the total Tokens you hold and your average entry price. This initializes holdings and cost basis immediately.',
    'Best practice: if you later import full history (CSV) or add individual trades, auditability and metrics become more precise. Use the “average entry” method when you do not have the full fill-by-fill record.',
    'Use Holdings search to filter by name or symbol.',
    'Sort by QTY/value to surface concentration quickly.',
    'Switch timeframe tabs to analyze performance windows.',
  ]}/>
</GuideDetail>

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
className="block rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgb(34,35,39)] p-3 hover:bg-[rgb(54,55,56)] transition"
    >
      <div className="font-medium">{title}</div>
      <div className="text-sm text-slate-400 mt-1">{blurb}</div>
    </a>
  )
}

function GuideDetail({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card>
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="mt-3 space-y-4">{children}</div>
      </Card>
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

/** Matches the New Cycle alert purple badge in src/components/common/AlertsTooltip.tsx */
function BadgeCycle({ label = 'create new cycle' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[rgb(63,56,126)]/35 text-[rgb(214,210,255)] ring-1 ring-[rgb(136,128,213)]/60">
      {label}
    </span>
  )
}

/** Matches Sell badge red (rose) used in src/components/common/AlertsTooltip.tsx */
function BadgeRed({ label = 'sell' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30">
      {label}
    </span>
  )
}

function Legend({ showCycle = false }: { showCycle?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-400">Planner row states:</span>
      <BadgeYellow label="time to buy" />
      <BadgeGreen label="level filled" />

      <span className="text-slate-400">Alerts:</span>
      <BadgeGreen label="Buy" />
      <BadgeRed label="Sell" />
      {showCycle ? <BadgeCycle label="create new cycle" /> : null}
    </div>
  )
}
/** Sell Planner card legend ONLY: show Sell alert pill */
function LegendSellPlanner() {
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-400">Planner row states:</span>
      <BadgeYellow label="time to buy" />
      <BadgeGreen label="level filled" />

      <span className="text-slate-400">Alerts:</span>
      <BadgeRed label="Sell" />
    </div>
  )
}
/* ─────────────────────────────────────────────────────────────
   Institutional definitions: Buy Planner (How-To)
   ───────────────────────────────────────────────────────────── */

type DefItem = { term: React.ReactNode; definition: React.ReactNode }

function MiniHeading({ children }: { children: any }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </div>
  )
}

function DefGrid({ items }: { items: DefItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((it, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgb(34,35,39)] p-3 shadow-[0_10px_25px_rgba(0,0,0,0.25)]"
        >
          <div className="text-sm font-medium text-slate-200">{it.term}</div>
          <div className="mt-1 text-sm text-slate-300 leading-6">{it.definition}</div>
        </div>
      ))}
    </div>
  )
}


function BuyPlannerInstitutionalGuide() {
  return (
<div className="space-y-4">
        <MiniHeading>Key inputs</MiniHeading>
        <DefGrid
          items={[
            {
  term: <span className="font-bold text-slate-100">Total Budget (USD)</span>,
              definition:
                'The maximum capital you are willing to deploy for this asset in the current cycle. This keeps planning disciplined and prevents “adding risk by accident” through unstructured buying.',
            },
       {
  term: <span className="font-bold text-slate-100">Risk Profile</span>,
  definition: (
    <div className="space-y-2">

<ul className="list-disc list-inside space-y-1">
  <li>
    <span className="font-semibold text-slate-200">Conservative:</span>{' '}
    Highest caution and most patient pacing. Designed to reduce drawdown risk and avoid over-deployment during volatility.
  </li>
  <li>
    <span className="font-semibold text-slate-200">Moderate:</span>{' '}
    Balanced pacing for disciplined accumulation—typically appropriate for larger, more liquid assets and core positions.
  </li>
  <li>
    <span className="font-semibold text-slate-200">Aggressive:</span>{' '}
    Faster accumulation and higher exposure velocity. Optimized for building position size efficiently when conviction is high.
  </li>
</ul>

    </div>
  ),
},



            
          ]}
        />

     <MiniHeading>Execution and tracking</MiniHeading>
<DefGrid
  items={[
    {
      term: <span className="font-bold text-slate-100">Planner row state: “time to buy” (yellow)</span>,
      definition:
        'An execution signal: when a ladder row turns yellow, market price has reached that level’s targeted buy. Execute the buy externally, then record the fill under Coin → Add Trade so the row can update.',
    },
    {
      term: <span className="font-bold text-slate-100">Planner row state: “level filled” (green)</span>,
      definition:
        'A completion state: buys you record while this Buy Planner is active count toward the level’s fill percentage. When fill reaches 100%, the ladder row turns green, confirming the level is complete.',
    },
    {
      term: <span className="font-bold text-slate-100">Off-Plan</span>,
      definition:
        'Buys recorded away from this planner’s designated levels are tagged Off-Plan and do not contribute to level completion. This keeps plan attribution clean and highlights discretionary deviations.',
    },
    {
      term: <span className="font-bold text-slate-100">Alerts: Buy / Create New Cycle</span>,
      definition:
        'Buy alerts surface on the Dashboard when one or more levels become actionable. Create New Cycle alerts indicate it’s time to refresh your Buy Planner so it stays aligned with the current market phase.',
    },
  ]}
/>


        <div className="text-xs text-slate-400 leading-5">
          Practical rule: execute buys externally, then log the exact fill price/quantity under{' '}
          <span className="text-slate-300">Coin → Add Trade</span>. LedgerOne does not place orders; it provides the plan,
          the accounting, and the governance layer.
        </div>
      </div>
  
  )
}
function AddTradeInstitutionalGuide() {
  return (
<div className="space-y-4">
        <MiniHeading>What this is</MiniHeading>
        <DefGrid
          items={[
            {
              term: <span className="font-semibold text-slate-100">Trade record</span>,
              definition:
                'A single, timestamped entry representing an executed buy or sell. This is the source of truth for what actually happened in your portfolio.',
            },
            {
              term: <span className="font-semibold text-slate-100">Why it matters</span>,
              definition:
                'Trade records drive accurate holdings, cost tracking, and planner completion. Clean inputs produce clean reporting.',
            },
          ]}
        />

        <MiniHeading>Key fields and what they mean</MiniHeading>
        <DefGrid
          items={[
            {
              term: <span className="font-semibold text-slate-100">Side</span>,
              definition:
                'Whether the execution was a Buy or a Sell. This determines how the position and realized results update; supporting accurate, auditable performance reporting.',
            },
            {
              term: <span className="font-semibold text-slate-100">Quantity</span>,
              definition: (
  <div className="space-y-2">
    <p>
      Execute the buy/sell externally, then enter the filled quantity here to maintain an accurate record of executed
      size and exposure.
    </p>

    <ul className="list-disc list-inside space-y-1">
      <li>
        <span className="font-semibold text-slate-200">Buys</span> are recorded as a USD amount.
      </li>
      <li>
        <span className="font-semibold text-slate-200">Sells</span> are recorded as a token amount.
      </li>
    </ul>
  </div>
),

            },
            {
              term: <span className="font-semibold text-slate-100">Execution price</span>,
              definition:
'Execute the buy/sell price externally, then enter the filled price here to keep an accurate record of the execution value.',
            },
            {
              term: <span className="font-semibold text-slate-100">Timestamp</span>,
              definition:
'The execution timestamp. For immediate entries, it defaults to the current date and time; maintaining accurate timestamps supports correct sequencing and reliable historical reporting.',
            },
          ]}
        />

        <MiniHeading>Planner attribution</MiniHeading>
<DefGrid
  items={[
    {
      term: <span className="font-semibold text-slate-100">Buy attribution (automatic)</span>,
      definition: (
        <div className="space-y-2">
          <p>
            Buy entries are automatically tagged to the active planner context for that coin, so you do not need to select a Buy Planner manually.
            This keeps accumulation tracking simple and consistent.
          </p>
        </div>
      ),
    },
    {
      term: <span className="font-semibold text-slate-100">Sell attribution (select planner version)</span>,
      definition: (
        <div className="space-y-2">
          <p>
            Sell entries default to the <span className="font-semibold text-slate-200">Active</span> Sell Planner, but you can override to any{' '}
            <span className="font-semibold text-slate-200">Frozen</span> planner version so the correct ladder’s fills and progress update.
          </p>

          <ul className="list-disc list-inside space-y-1">
            <li>
              If a specific Sell Planner version is signaling (e.g., Planner [2] is yellow), record the sell and assign it to that planner version.
            </li>
            <li>
              This prevents sells from being mixed across versions and keeps reporting auditable.
            </li>
          </ul>
        </div>
      ),
    },
    {
      term: <span className="font-semibold text-slate-100">Off-Plan</span>,
      definition: (
        <div className="space-y-2">
          <p>
            Trades that do not align with the planner’s intended levels are tracked separately and do not contribute to ladder completion.
            This preserves clean attribution and prevents discretionary activity from overstating plan progress.
          </p>

          <ul className="list-disc list-inside">
            <li>
              <span className="font-semibold text-slate-200">
                It is strongly recommended to adhere to the plan and avoid discretionary deviations.
              </span>
            </li>
          </ul>
        </div>
      ),
    },
  ]}
/>

      </div>
  )
}

function SellPlannerInstitutionalGuide() {
  return (
      <div className="space-y-4">
        <MiniHeading>What it does</MiniHeading>
        <DefGrid
          items={[
            {
              term: <span className="font-semibold text-slate-100">Sell Planner</span>,
              definition:
                'A coin-level distribution plan that structures how exposure is reduced as the market advances, supported by alerts and completion tracking.',
            },
            {
              term: <span className="font-semibold text-slate-100">Why it matters</span>,
              definition:
                'It converts intention into process—helping you take profits systematically while maintaining consistent exposure management.',
            },
          ]}
        />

        <MiniHeading>Settings (high-level)</MiniHeading>
        <DefGrid
          items={[
            {
              term: <span className="font-semibold text-slate-100">Coin Volatility</span>,
              definition:
                'Sets how broad the plan should be based on the asset’s typical behavior—more volatile assets generally benefit from a wider, more patient distribution plan.',
            },
            {
              term: <span className="font-semibold text-slate-100">Sell Intensity</span>,
              definition:
                'Sets how assertively the plan reduces exposure—ranging from gradual trimming to more aggressive exposure reduction.',
            },
          ]}
        />

        <MiniHeading>Execution signals and tracking</MiniHeading>
        <DefGrid
          items={[
            {
              term: <span className="font-semibold text-slate-100">Planner row state: “time to sell” (yellow)</span>,
              definition:
                'An execution signal: when a row turns yellow, the next planned sell checkpoint is active. Execute the sell externally; status updates as fills occur.',
            },
            {
              term: <span className="font-semibold text-slate-100">Planner row state: “level filled” (green)</span>,
              definition:
                'A confirmation state: only sells recorded and attributed to this planner contribute to the fill percentage. When fill reaches 100%, the row turns green, confirming completion.',
            },
            {
              term: <span className="font-semibold text-slate-100">Alerts: Sell</span>,
              definition:
                'Sell alerts surface when one or more planned sell checkpoints are active, providing a clear prompt to execute.',
            },
    
          ]}
        />

        <MiniHeading>Attribution discipline</MiniHeading>
        <DefGrid
          items={[
            {
              term: <span className="font-semibold text-slate-100">Attached to the correct planner</span>,
              definition: (
                <div className="space-y-2">
                  <p>
                    Only sells attributed to the appropriate planner are recognized for that planner’s completion states.
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <span className="font-semibold text-slate-200">Sell entries:</span>{' '}
                      when recording a sell, select the corresponding planner (e.g., if Planner [2] is highlighted in yellow,
                      attach the sell to Planner 2).
                    </li>
                  </ul>
                </div>
              ),
            },
            {
              term: <span className="font-semibold text-slate-100">Off-Plan</span>,
              definition: (
                <div className="space-y-2">
                  <p>
                    Trades not attributed to this planner’s levels are tracked separately and do not contribute to planner
                    completion. This preserves clean attribution and prevents non-plan activity from overstating progress.
                  </p>
                  <ul className="list-disc list-inside">
                    <li>
                      <span className="font-semibold text-slate-200">
                        It is strongly recommended to adhere to the plan and avoid discretionary deviations.
                      </span>
                    </li>
                  </ul>
                </div>
              ),
            },
          ]}
        />
      </div>
  )
}
function RiskScoreInstitutionalGuide() {
  return (
      <div className="space-y-4">
        <MiniHeading>Risk components (what each metric means)</MiniHeading>

<DefGrid
  items={[
    {
      term: <span className="font-semibold text-slate-100">Structural</span>,
      definition:
        'Baseline composition risk derived from the quality/tier mix of what you hold. More established assets tend to be more resilient; thinner assets can be more sensitive to capital flows.',
    },
    {
      term: <span className="font-semibold text-slate-100">Volatility</span>,
      definition:
        'Realized volatility regime (annualized). Higher volatility implies larger swings and a wider range of outcomes, which increases position risk if sizing is not controlled.',
    },
    {
      term: <span className="font-semibold text-slate-100">Tail Risk</span>,
      definition:
        'Downside stress sensitivity—how the portfolio tends to behave during sharp risk-off periods. When stress conditions are active, tail risk increases.',
    },
    {
      term: <span className="font-semibold text-slate-100">Correlation</span>,
      definition:
        'Diversification behavior relative to BTC (portfolio-weighted). Higher correlation increases concentration risk; lower correlation improves diversification.',
    },
{
  term: <span className="font-semibold text-slate-100">Liquidity</span>,
definition: (
  <div className="space-y-2">
    <p>Market depth (rank/liquidity).</p>

    <ul className="list-disc list-inside space-y-1">

    
      <li>
        <span className="font-semibold text-slate-200">Implication:</span>{' '}
        informs sizing discipline and concentration governance for long-term accumulation.
      </li>
    </ul>
  </div>
),
},

    {
      term: <span className="font-semibold text-slate-100">Total Combined Risk</span>,
      definition:
        'A single comparable metric that consolidates the above dimensions. Formula (as shown in the Portfolio card): Σ(weight × structural) × vol × tail × corr × liq. Use it for sizing and governance, not trade timing.',
    },
  ]}
/>
      </div>
  )
}


/**
 * Buy Planner card legend ONLY:
 * - No Sell pill
 * - Show "create new cycle" next to Alerts
 */
function LegendBuyPlanner() {
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-400">Planner row states:</span>
      <BadgeYellow label="time to buy" />
      <BadgeGreen label="level filled" />

      <span className="text-slate-400">Alerts:</span>
      <BadgeGreen label="Buy" />
      <BadgeCycle label="create new cycle" />
    </div>
  )
}

/** Risk Score card legend ONLY: show New Cycle alert pill */
function LegendRiskScore() {
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-400">Alerts:</span>
      <BadgeCycle label="create new cycle" />
    </div>
  )
}


/* Bullets helper used in guide sections */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm text-slate-300">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2">
          {/* Prevent the icon from shrinking when text wraps */}
          <Check className="mt-0.5 shrink-0" />
          <span className="flex-1">{t}</span>
        </li>
      ))}
    </ul>
  )
}

