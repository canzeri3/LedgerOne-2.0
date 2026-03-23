'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DrawLine, Parallax, Reveal, ScrollProgress, SplitRow } from '@/components/landing/ScrollEffects'
import { CoinLogoMini } from '@/components/landing/CoinLogoMini'
import { AboutGlow } from '@/components/landing/AboutGlow'
import { ParticleNetworkBackground } from '@/components/landing/ParticleNetworkBackground'
import Image from 'next/image'

type CoinRow = {
  symbol: string
  name: string
  // Planned path = strategy P/L for this asset (illustrative)
  plannedPct: number
  // Baseline = buy & hold P/L for this asset (illustrative)
  baselinePct: number
}

// Illustrative demo data only (no performance promises)
const DEMO_COIN_ROWS: CoinRow[] = [
  { symbol: 'BTC', name: 'Bitcoin', plannedPct: 0.814, baselinePct: 0.183 },
  { symbol: 'ETH', name: 'Ethereum', plannedPct: 0.462, baselinePct: 0.141 },
  { symbol: 'SOL', name: 'Solana', plannedPct: 0.688, baselinePct: 0.244 },
  { symbol: 'BNB', name: 'BNB', plannedPct: 0.919, baselinePct: 0.112 },
  { symbol: 'ADA', name: 'Cardano', plannedPct: 0.22, baselinePct: -0.061 },
  { symbol: 'XRP', name: 'XRP', plannedPct: 0.81, baselinePct: 0.067 },
  { symbol: 'DOGE', name: 'Dogecoin', plannedPct: 0.54, baselinePct: 0.091 },
  { symbol: 'AVAX', name: 'Avalanche', plannedPct: 0.33, baselinePct: 0.098 },
  { symbol: 'MATIC', name: 'Polygon', plannedPct: 0.17, baselinePct: -0.028 },
  { symbol: 'LINK', name: 'Chainlink', plannedPct: 0.276, baselinePct: 0.149 },
]

const PANEL_BUY_IMAGE = '/images/portfolio-plan-overview-back.png'
const PANEL_SELL_IMAGE = '/images/sell-planner-preview.png'
const PANEL_BALANCE_IMAGE = '/images/portfolio-balance-preview.png'

const PANEL_IMAGE_ASPECT = '1200 / 1000'

const PREVIEW_OPEN_MS = 280
const PREVIEW_CLOSE_MS = 260
const PREVIEW_IMAGE_SWAP_MS = 320
const PREVIEW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const IDLE_PRELOAD_PREVIEW_IMAGES = [PANEL_BUY_IMAGE, PANEL_SELL_IMAGE, PANEL_BALANCE_IMAGE]

const DEFERRED_SECTION_STYLE: CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '900px',
}

type PreviewKey = 'buy' | 'sell' | 'balance'

function fmtSignedPct(x: number) {
  const sign = x > 0 ? '+' : x < 0 ? '−' : ''
  const v = Math.abs(x) * 100
  return `${sign}${v.toFixed(1)}%`
}

function Pill({
  tone = 'slate',
  children,
  className = '',
}: {
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'indigo'
  children: ReactNode
  className?: string
}) {
  const base =
    'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium leading-none tracking-tight'

  const tones: Record<string, string> = {
    slate: 'border-slate-700/70 bg-slate-900/25 text-slate-300',
    green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
    red: 'border-red-500/25 bg-red-500/10 text-red-200',
    indigo: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-200',
  }

  return <span className={`${base} ${tones[tone] || tones.slate} ${className}`}>{children}</span>
}

function toneForDriftValue(driftPct: number): 'slate' | 'green' | 'amber' | 'indigo' {
  if (driftPct >= 0.01) return 'green'
  if (driftPct <= -0.01) return 'amber'
  return 'slate'
}

function Kicker({
  label,
  title,
  subtitle,
}: {
  label: string
  title: string
  subtitle: string
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>

      <div className="mx-auto max-w-[38rem]">
        <h2 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">{title}</h2>
        <DrawLine className="mt-3 opacity-70" />
      </div>

      <p className="text-sm leading-relaxed text-slate-300 sm:text-base">{subtitle}</p>
    </div>
  )
}

/* ------------------------------------------
   Institutional card system (single style)
------------------------------------------- */

function InfoCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string
  title: string
  body: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-[#191a1c] p-6 shadow-[0_14px_40px_rgba(0,0,0,0.34)] transition-[transform,box-shadow] duration-300 hover:-translate-y-[1px] hover:shadow-[0_18px_50px_rgba(0,0,0,0.42)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_26%,rgba(0,0,0,0.12)_100%)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />

      <div className="relative">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
        ) : null}

        <p className={`${eyebrow ? 'mt-2' : ''} text-sm font-semibold tracking-tight text-slate-100`}>{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
      </div>
    </div>
  )
}

function InfoCardTight({ title, body }: { title: string; body: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-[#191a1c] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.34)] transition-[transform,box-shadow] duration-300 hover:-translate-y-[1px] hover:shadow-[0_18px_50px_rgba(0,0,0,0.42)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_26%,rgba(0,0,0,0.12)_100%)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />

      <div className="relative">
        <p className="text-sm font-semibold tracking-tight text-slate-100">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------
   Preview panel system
------------------------------------------- */

function Panel({
  children,
  activePreview,
  expanded,
  renderExpandedControls,
}: {
  children: ReactNode
  activePreview?: PreviewKey | null
  expanded?: boolean
  renderExpandedControls?: (preview: PreviewKey) => ReactNode
}) {
  const open = !!expanded
const showExpandedShell = open || !!activePreview

const getPreviewControlsOffsetClass = (preview: PreviewKey) =>
  preview === 'buy' ? '-mt-44' : preview === 'sell' ? '-mt-40' : '-mt-36'
  return (
    <div className="relative isolate overflow-visible">
      {/* Base card */}
  <div
  className={`relative z-10 overflow-hidden rounded-3xl transition-[background-color,box-shadow,opacity] ${
    open
      ? 'bg-transparent shadow-none opacity-0'
      : 'bg-[rgba(29,30,33,0.68)] shadow-[0_14px_40px_rgba(0,0,0,0.30)] opacity-100'
  }`}
  style={{
    transitionDuration: `${open ? 420 : 680}ms`,
    transitionTimingFunction: PREVIEW_EASE,
  }}
>
        <div
          className={`pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_26%,rgba(0,0,0,0.12)_100%)] transition-opacity ${
            open ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            transitionDuration: `${open ? 420 : 620}ms`,
            transitionTimingFunction: PREVIEW_EASE,
          }}
        />

        <div
          className={`pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-opacity ${
            open ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            transitionDuration: `${open ? 420 : 620}ms`,
            transitionTimingFunction: PREVIEW_EASE,
          }}
        />

          <div
className={`relative transform-gpu transition-[opacity,transform] ${
              open ? 'translate-y-1 scale-[0.992] opacity-0' : 'translate-y-0 scale-100 opacity-100'
          }`}
          style={{
            transitionDuration: `${open ? 260 : 320}ms`,
            transitionTimingFunction: PREVIEW_EASE,
          }}
        >
          {children}
        </div>
      </div>

      {/* Expanded image shell */}
      <div
        className={`absolute inset-0 z-20 ${showExpandedShell ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!showExpandedShell}
      >
        <div
className={`absolute inset-0 transform-gpu will-change-[opacity,transform] transition-[opacity,transform] ${
                open
              ? 'opacity-100 scale-[1.02] -translate-y-1'
              : 'opacity-0 scale-[0.992] translate-y-2'
          }`}
          style={{
            transitionDuration: `${open ? PREVIEW_OPEN_MS : PREVIEW_CLOSE_MS}ms`,
            transitionTimingFunction: PREVIEW_EASE,
          }}
        >
{/* Image stack + attached pills */}
<div
  className="absolute left-[39%] top-[44%] w-[122%] -translate-x-1/2 -translate-y-1/2"
  style={{ aspectRatio: PANEL_IMAGE_ASPECT }}
>
  <div className="relative h-full w-full">
    <div
className={`absolute inset-0 transform-gpu transition-[opacity,transform] ${
          activePreview === 'buy' ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.008]'
      }`}
      style={{
        transitionDuration: `${PREVIEW_IMAGE_SWAP_MS}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Image
        src={PANEL_BUY_IMAGE}
        alt=""
        fill
        priority={activePreview === 'buy'}
        loading={activePreview === 'buy' ? 'eager' : 'lazy'}
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="select-none object-contain object-center drop-shadow-[0_24px_56px_rgba(0,0,0,0.38)]"
      />
    </div>

    <div
      className={`absolute inset-0 transform-gpu will-change-[opacity,transform] transition-[opacity,transform] ${
        activePreview === 'sell' ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.008]'
      }`}
      style={{
        transitionDuration: `${PREVIEW_IMAGE_SWAP_MS}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Image
        src={PANEL_SELL_IMAGE}
        alt=""
        fill
        priority={activePreview === 'sell'}
        loading={activePreview === 'sell' ? 'eager' : 'lazy'}
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="select-none object-contain object-center drop-shadow-[0_24px_56px_rgba(0,0,0,0.38)]"
      />
    </div>

    <div
      className={`absolute inset-0 transform-gpu will-change-[opacity,transform] transition-[opacity,transform] ${
        activePreview === 'balance' ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.008]'
      }`}
      style={{
        transitionDuration: `${PREVIEW_IMAGE_SWAP_MS}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Image
        src={PANEL_BALANCE_IMAGE}
        alt=""
        fill
        priority={activePreview === 'balance'}
        loading={activePreview === 'balance' ? 'eager' : 'lazy'}
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="select-none object-contain object-center drop-shadow-[0_24px_56px_rgba(0,0,0,0.38)]"
      />
    </div>

    {renderExpandedControls ? (
      <>
        <div
className={`absolute left-1/2 top-full z-20 ${getPreviewControlsOffsetClass('buy')} -translate-x-1/2 transition-[opacity,transform] ${
              open && activePreview === 'buy'
              ? 'pointer-events-auto translate-y-0 opacity-100 scale-100'
              : 'pointer-events-none translate-y-0 opacity-0 scale-[1.008]'
          }`}
          style={{
            transitionDuration: `${PREVIEW_IMAGE_SWAP_MS}ms`,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {renderExpandedControls('buy')}
        </div>

        <div
className={`absolute left-1/2 top-full z-20 ${getPreviewControlsOffsetClass('sell')} -translate-x-1/2 transition-[opacity,transform] ${
              open && activePreview === 'sell'
              ? 'pointer-events-auto translate-y-0 opacity-100 scale-100'
              : 'pointer-events-none translate-y-0 opacity-0 scale-[1.008]'
          }`}
          style={{
            transitionDuration: `${PREVIEW_IMAGE_SWAP_MS}ms`,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {renderExpandedControls('sell')}
        </div>

        <div
className={`absolute left-1/2 top-full z-20 ${getPreviewControlsOffsetClass('balance')} -translate-x-1/2 transition-[opacity,transform] ${
              open && activePreview === 'balance'
              ? 'pointer-events-auto translate-y-0 opacity-100 scale-100'
              : 'pointer-events-none translate-y-0 opacity-0 scale-[1.008]'
          }`}
          style={{
            transitionDuration: `${PREVIEW_IMAGE_SWAP_MS}ms`,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {renderExpandedControls('balance')}
        </div>
      </>
    ) : null}
    </div>
</div>

        </div>
      </div>
    </div>
  )
}

function MetricTile({
  label,
  value,
  note,
  accent = 'text-slate-200',
}: {
  label: string
  value: string
  note: string
  accent?: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/15 p-3 transition-colors hover:border-slate-700/70">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.16] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65 group-hover:opacity-75" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium text-slate-400">{label}</p>
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
        </div>

        <p className={`mt-1 text-lg font-semibold tracking-tight ${accent}`}>{value}</p>
        <p className="mt-1 text-[11px] text-slate-500">{note}</p>
      </div>
    </div>
  )
}

function PanelHeader() {
  return (
<header className="relative z-10 flex items-start justify-between gap-4 px-5 py-4">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />

      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full border border-indigo-400/30 bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.9)]" />
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">LedgerOne · Overview</p>
          <p className="text-md font-semibold tracking-tight text-slate-100">Portfolio Plan Overview</p>
          <p className="text-[11px] text-slate-500">LG1 Strategy vs Buy &amp; Hold</p>
        </div>
      </div>

      <div className="pt-0.5">
        <Pill tone="green">Plan vs Baseline</Pill>
      </div>
    </header>
  )
}

/* -----------------------------
   Institutional blocks
--------------------------------*/

function SecurityDataSection() {
  return (
    <section id="security" className="space-y-6">
      <div className="mx-auto max-w-3xl space-y-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          TRUST · SECURITY & DATA
        </p>
        <h3 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
          Built for planning and tracking — not custody.
        </h3>
        <DrawLine className="mx-auto max-w-[26rem] opacity-60" />

        <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
          LedgerOne is designed as a portfolio workflow tool. It helps you define rules, track progress, and stay
          consistent — without acting as a custodian or broker.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InfoCardTight title="No custody" body="LedgerOne is a planning workspace. It does not hold your assets." />
        <InfoCardTight
          title="No execution"
          body="LedgerOne does not place trades. Your actions remain under your control."
        />
        <InfoCardTight
          title="Process-first design"
          body="The product is built to support discipline: targets, bands, ladders, and clean reporting."
        />
      </div>
    </section>
  )
}

type FaqItem = { q: string; a: string }

const FAQ: FaqItem[] = [
  {
    q: 'Is LedgerOne investment advice?',
    a: 'No. LedgerOne is a planning and tracking tool. It helps you organize your own process and reporting.',
  },
  {
    q: 'Does LedgerOne custody funds or connect to my wallet?',
    a: 'LedgerOne is designed as a workflow tool. It does not act as a custodian. (If you add integrations later, keep them clearly disclosed and permission-scoped.)',
  },
  {
    q: 'Does LedgerOne place trades?',
    a: 'No. LedgerOne does not execute trades. It is designed to support rules-based decision-making and review.',
  },
  {
    q: 'Who is it best for?',
    a: 'Long-horizon investors who want a structured workflow: allocations, bands, ladders, and consistent review.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most users can define a basic structure quickly, then refine over time. The goal is a repeatable process, not a perfect day-one configuration.',
  },
]

function FAQSection() {
  return (
    <section id="faq" className="space-y-6">
      <div className="mx-auto max-w-3xl space-y-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">FAQ · QUICK CLARITY</p>
        <h3 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
          Common questions, answered directly.
        </h3>
        <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
          Keep the workflow simple. Keep expectations precise.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-2">
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#1f2021] px-5 py-4 transition-colors hover:border-slate-700/70"
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.14] via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-500/12 to-transparent opacity-65 group-hover:opacity-80" />

            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-100">
              <span>{item.q}</span>
              <span className="text-slate-400 transition group-open:rotate-45">+</span>
            </summary>

            <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function LandingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="pb-5 pt-5">
      <div className="w-full border-t border-slate-800/60 pt-6">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500">
              © {year} LedgerOne. Planning &amp; tracking tool — It does not provide investment advice.
            </p>

            <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded-full border border-slate-700/70 bg-slate-900/20 px-3 py-1">No custody</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/20 px-3 py-1">No execution</span>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/20 px-3 py-1">
                Rules-based workflow
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
const [selectedPreview, setSelectedPreview] = useState<PreviewKey | null>(null)
const [displayedPreview, setDisplayedPreview] = useState<PreviewKey | null>(null)
const [previewVisible, setPreviewVisible] = useState(false)
const [statsVisible, setStatsVisible] = useState(false)

  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    let idleHandle: number | null = null
    let timeoutHandle: number | null = null

    const preloadImages = () => {
      if (cancelled) return

      for (const src of IDLE_PRELOAD_PREVIEW_IMAGES) {
        const image = new window.Image()
        image.decoding = 'async'
        image.src = src
      }
    }

    const idleScheduler = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (typeof idleScheduler.requestIdleCallback === 'function') {
      idleHandle = idleScheduler.requestIdleCallback(
        () => {
          preloadImages()
        },
        { timeout: 1200 }
      )
    } else {
      timeoutHandle = window.setTimeout(preloadImages, 350)
    }

    return () => {
      cancelled = true
      if (idleHandle !== null && typeof idleScheduler.cancelIdleCallback === 'function') {
        idleScheduler.cancelIdleCallback(idleHandle)
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle)
      }
    }
  }, [])

  const runNextFrame = (fn: () => void) => {
    requestAnimationFrame(fn)
  }

  const closePreview = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }

    setSelectedPreview(null)
    setPreviewVisible(false)

    previewTimerRef.current = setTimeout(() => {
      setDisplayedPreview(null)
      previewTimerRef.current = null
    }, PREVIEW_CLOSE_MS)
  }

  const handlePreviewClick = (next: PreviewKey) => {
  if (previewTimerRef.current) {
    clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
  }

  if (selectedPreview === next && previewVisible) {
    closePreview()
    return
  }

  setSelectedPreview(next)

  if (displayedPreview !== next) {
    setDisplayedPreview(next)
  }

  if (!previewVisible) {
    runNextFrame(() => setPreviewVisible(true))
  }
}

const handleStatsToggle = () => {
  if (statsVisible) {
    closePreview()
  }

  setStatsVisible((current) => !current)
}


const renderExpandedPreviewPills = (current: PreviewKey | null) => {
  if (!current) return null

  return (
    <div className="inline-flex w-max flex-nowrap items-center justify-center gap-3 whitespace-nowrap">
      <button
        type="button"
        onClick={current === 'buy' ? closePreview : () => handlePreviewClick('buy')}
        className="inline-flex shrink-0 justify-center transform-gpu transition-transform duration-200 ease-out hover:scale-[1.05]"
      >
        <Pill tone={current === 'buy' ? 'slate' : 'green'} className="w-[176px] shrink-0 justify-center whitespace-nowrap">
          {current === 'buy' ? 'Overview' : 'Buy Planner'}
        </Pill>
      </button>

      <button
        type="button"
        onClick={current === 'sell' ? closePreview : () => handlePreviewClick('sell')}
        className="inline-flex shrink-0 justify-center transform-gpu transition-transform duration-200 ease-out hover:scale-[1.05]"
      >
        <Pill tone={current === 'sell' ? 'slate' : 'red'} className="w-[176px] shrink-0 justify-center whitespace-nowrap">
          {current === 'sell' ? 'Overview' : 'Sell Planner'}
        </Pill>
      </button>

      <button
        type="button"
        onClick={current === 'balance' ? closePreview : () => handlePreviewClick('balance')}
        className="inline-flex shrink-0 justify-center transform-gpu transition-transform duration-200 ease-out hover:scale-[1.05]"
      >
        <Pill tone={current === 'balance' ? 'slate' : 'indigo'} className="w-[176px] shrink-0 justify-center whitespace-nowrap">
          {current === 'balance' ? 'Overview' : 'Portfolio Balance'}
        </Pill>
      </button>
    </div>
  )
}

  return (
    <>
      <ScrollProgress />

<div className="flex flex-col gap-16">
  <div className="relative isolate">
<div className="pointer-events-none absolute -top-20 -bottom-80 left-[calc(50%-50vw)] right-[calc(50%-50vw)] z-0">
  <ParticleNetworkBackground className="absolute inset-0 h-full w-full opacity-[0.86]" />
  <div className="absolute inset-x-0 -bottom-24 h-[42rem] bg-gradient-to-b from-transparent via-[#131415]/72 to-[#131415]" />
</div>


    {/* HERO + PREVIEW */}
    <section id="overview" className="relative z-10 pt-16 sm:pt-[4.5rem] lg:pt-[5.5rem]">
      <Parallax
        className="pointer-events-none absolute left-1/2 top-3 h-44 w-[48rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/8 to-sky-500/10 blur-3xl"
        strengthY={28}
        strengthX={10}
        startAt={1.0}
        endAt={0.2}
      />

<div className="relative z-20 mb-5 flex justify-end pr-4 sm:pr-6 lg:pr-10">
    <button
    type="button"
    onClick={handleStatsToggle}
    aria-pressed={statsVisible}
    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-[transform,border-color,background-color,color,box-shadow] duration-300 hover:-translate-y-[1px] ${
      statsVisible
        ? 'border-indigo-500/45 bg-indigo-500/12 text-indigo-100 shadow-[0_10px_28px_rgba(79,70,229,0.18)]'
        : 'border-slate-700/70 bg-slate-900/35 text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45'
    }`}
  >
    <span
      className={`h-2 w-2 rounded-full transition-colors duration-300 ${
        statsVisible
          ? 'bg-indigo-300 shadow-[0_0_12px_rgba(165,180,252,0.95)]'
          : 'bg-slate-500'
      }`}
    />
    <span>Stats</span>
  </button>
</div>

<div className="relative z-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">

<Reveal className="max-w-xl space-y-8">
  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/5 px-3.5 py-1.5 text-xs font-medium text-emerald-200">
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
    <span>Portfolio planning workspace</span>
  </div>

    <div className="space-y-2">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
        Institutional discipline for personal crypto investing.
      </h1>
<div className="mt-4 h-[3px] w-full max-w-[52rem] bg-gradient-to-r from-indigo-400/60 via-sky-400/20 to-transparent" />
    </div>

  <p className="text-base leading-relaxed text-slate-400 sm:text-[1.075rem]">
    Build structured allocations, define clear rules, and track execution against your plan—so decisions stay
    consistent through volatility.
  </p>

  <div className="flex flex-wrap items-center gap-3">
    <Link
      href="/login"
      className="inline-flex items-center justify-center rounded-full bg-indigo-600/85 px-6 py-3 text-[15px] font-medium text-slate-100 shadow-md shadow-indigo-950/20 transition hover:bg-indigo-500/85"
    >
      Sign in
    </Link>
    <Link
      href="/signup"
      className="inline-flex items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/30 px-6 py-3 text-[15px] font-medium text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45"
    >
      Request access
    </Link>
  </div>

  <p className="text-sm text-slate-500">
    Already onboarded?{' '}
    <Link
      href="/dashboard"
      className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/30 px-3 py-1 text-xs font-medium leading-none text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45"
    >
      Open dashboard
    </Link>
  </p>
</Reveal>

  
{/* PREVIEW */}
<div
  className={`min-w-0 transition-[opacity,transform] ${
    statsVisible
      ? 'translate-y-0 scale-100 opacity-100'
      : 'pointer-events-none translate-y-2 scale-[0.985] opacity-0'
  }`}
  style={{
    transitionDuration: '520ms',
    transitionTimingFunction: PREVIEW_EASE,
  }}
  aria-hidden={!statsVisible}
>
  <Reveal className="relative -mx-10 -my-8 px-10 py-8" delayMs={120}>
    <Parallax
      className="pointer-events-none absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-indigo-500/[0.14] via-emerald-500/[0.09] to-sky-500/[0.12] blur-[30px]"
      strengthY={18}
      strengthX={-10}
      startAt={1.0}
      endAt={0.2}
    />

    <div className="relative z-10">
      <Panel
        activePreview={displayedPreview}
        expanded={previewVisible}
        renderExpandedControls={renderExpandedPreviewPills}
      >
        <PanelHeader />

        <div className="px-5 pb-5">
          <div className="mt-3 grid grid-cols-3 gap-3">            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handlePreviewClick('buy')}
                className={`inline-flex min-w-[120px] justify-center transform-gpu transition-transform duration-200 ease-out hover:scale-[1.05] ${
                  selectedPreview === 'buy' ? 'scale-[1.03]' : ''
                }`}
              >
                <Pill tone="green" className="w-[176px] justify-center">
                  Buy Planner
                </Pill>
              </button>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handlePreviewClick('sell')}
                className={`inline-flex min-w-[120px] justify-center transform-gpu transition-transform duration-200 ease-out hover:scale-[1.05] ${
                  selectedPreview === 'sell' ? 'scale-[1.03]' : ''
                }`}
              >
                <Pill tone="red" className="w-[176px] justify-center">
                  Sell Planner
                </Pill>
              </button>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handlePreviewClick('balance')}
                className={`inline-flex min-w-[120px] justify-center transform-gpu transition-transform duration-200 ease-out hover:scale-[1.05] ${
                  selectedPreview === 'balance' ? 'scale-[1.03]' : ''
                }`}
              >
                <Pill tone="indigo" className="w-[176px] justify-center">
                  Portfolio Chart
                </Pill>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="mt-4 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">

              </p>
            </div>

<div className="mt-2 overflow-hidden rounded-2xl border border-[#061626] bg-slate-950/10 shadow-[0_0_0_1px_rgba(6,22,38,0.1)]">
              <div className="sticky top-0 z-10 bg-slate-950/18 backdrop-blur-sm">
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-3 py-2 text-[11px] font-medium text-slate-400">
                  <span>Coin</span>
                  <span className="text-right">LG1 Planner</span>
                  <span className="text-right">Baseline</span>
                  <span className="text-right">Drift</span>
                </div>
                <div className="h-px bg-slate-800/70" />
              </div>

              <div className="h-[220px] overflow-y-auto">
                {DEMO_COIN_ROWS.map((row) => {
                  const drift = row.plannedPct - row.baselinePct
                  return (
                    <div
                      key={row.symbol}
                      className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-slate-800/40 px-3 py-2 text-[11px] text-slate-200 last:border-b-0 hover:bg-slate-900/25"
                    >
                      <div className="flex items-center gap-2">
                        <CoinLogoMini symbol={row.symbol} name={row.name} sizePx={20} className="h-5 w-5" />

                        <div className="flex flex-col leading-tight">
                          <span className="text-[11px] font-semibold text-slate-100">{row.symbol}</span>
                          <span className="text-[10px] text-slate-500">{row.name}</span>
                        </div>
                      </div>

                      <div className="text-right tabular-nums text-slate-200">{fmtSignedPct(row.plannedPct)}</div>
                      <div className="text-right tabular-nums text-slate-400">{fmtSignedPct(row.baselinePct)}</div>
                      <div className="flex justify-end">
                        <Pill tone={toneForDriftValue(drift)}>{fmtSignedPct(drift)}</Pill>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-2 text-[10px] text-slate-500">Data starts January 1, 2020.</p>
          </div>
        </div>
      </Panel>
    </div>
  </Reveal>
</div>
          </div>
        </section>

{/* TRUST STRIP */}
<div className="relative z-10 mt-6 lg:mt-8">
  <Reveal>
    <section id="methodology" className="rounded-2xl border border-slate-800/60 bg-[#151618] px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-slate-300">
          Institutional-style workflows for long-horizon crypto investors—built around process, discipline, risk
          controls, and clean reporting.
        </p>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">
            Any portfolio size
          </span>
          <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">
            Long-horizon focus
          </span>
          <span className="rounded-full border border-slate-700/70 bg-slate-900/35 px-3 py-1">
            Rules-based workflow
          </span>
        </div>
      </div>
    </section>
  </Reveal>
</div>

</div>

{/* VALUE PILLARS */}
<section id="pillars" className="space-y-8">
  <Reveal>
    <Kicker
      label="LEDGERONE · PRINCIPLES"
      title="Built around clarity, discipline, and reporting."
      subtitle="LedgerOne is designed to reduce noise and increase consistency—by turning portfolio management into a repeatable workflow."
    />
  </Reveal>

  <SplitRow className="grid gap-6 lg:grid-cols-3">
    <Reveal delayMs={0}>
      <InfoCard
        title="Rules-first planning"
        body="Define targets, bands, and ladder levels up front—so actions follow a plan, not headlines."
      />
    </Reveal>

    <Reveal delayMs={90}>
      <InfoCard
        title="Portfolio-level visibility"
        body="Track positions, progress, and drift in one place with clean, calm reporting."
      />
    </Reveal>

    <Reveal delayMs={180}>
      <InfoCard
        title="Risk posture and guardrails"
        body="Stay within a defined mandate using structured constraints that help keep decisions consistent."
      />
    </Reveal>
  </SplitRow>
</section>

{/* WORKFLOW */}
<section id="planner" className="space-y-8">
  <Reveal>
    <Kicker
      label="PRODUCT · WORKFLOW"
      title="A simple workflow that keeps your portfolio on-plan."
      subtitle="Define rules → execute with discipline → review progress over time."
    />
  </Reveal>

  <SplitRow className="grid gap-6 lg:grid-cols-3">
    <Reveal delayMs={0}>
      <InfoCard
        eyebrow="01 · Define"
        title="Define your allocation rules"
        body="Set targets, bands, and ladder levels per asset—before markets move."
      />
    </Reveal>

    <Reveal delayMs={90}>
      <InfoCard
        eyebrow="02 · Execute"
        title="Execute with discipline"
        body="Identify when a level is in range, triggered, or filled—so actions follow the plan."
      />
    </Reveal>

    <Reveal delayMs={180}>
      <InfoCard
        eyebrow="03 · Review"
        title="Review risk & progress"
        body="Track drift, exposure, and plan adherence with clean portfolio-level reporting."
      />
    </Reveal>
  </SplitRow>
</section>

{/* ABOUT */}
<section id="about" className="relative overflow-visible">
  <Reveal className="relative mx-auto max-w-3xl space-y-4 overflow-visible px-2 text-center">
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        LEDGERONE · ABOUT
      </span>
    </div>

    <div className="relative isolate mx-auto max-w-3xl">
      <AboutGlow />

      <div className="relative z-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
          A calmer way to manage a crypto portfolio.
        </h2>

        <DrawLine className="mx-auto max-w-[26rem] opacity-60" />

        <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
          LedgerOne started as a simple need: manage crypto positions with the same structure used in
          institutional portfolio workflows. Spreadsheets were fragile, dashboards were noisy, and most tools
          were built for watching—not planning. LedgerOne focuses on your ledger, your rules, and clean
          reporting so decisions stay consistent across volatility.
        </p>
      </div>
    </div>
  </Reveal>
</section>

{/* WHO IT'S FOR */}
<section id="teams" className="space-y-8">
  <Reveal>
    <Kicker
      label="RESOURCES · WHO IT’S FOR"
      title="Designed for investors who want structure."
      subtitle="A rules-based workspace that prioritizes clarity and consistency over noise."
    />
  </Reveal>

  <SplitRow className="grid gap-6 lg:grid-cols-3">
    <Reveal delayMs={0}>
      <InfoCard
        title="Everyday investors"
        body="Replace spreadsheets with a single workspace for positions, cost basis, and planning."
      />
    </Reveal>

    <Reveal delayMs={90}>
      <InfoCard
        title="Process-driven allocators"
        body="Set guardrails and allocation bands to reduce reactive decisions during volatility."
      />
    </Reveal>

    <Reveal delayMs={180}>
      <InfoCard
        title="Long-horizon builders"
        body="Scale in and out over months or years with a plan you can actually stick to."
      />
    </Reveal>
  </SplitRow>
</section>

{/* SECURITY & DATA */}
<Reveal>
  <SecurityDataSection />
</Reveal>

{/* FINAL CTA */}
<Reveal>
  <section
    id="pricing"
    className="relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#151618] px-6 py-6"
  >
    <Parallax
      className="pointer-events-none absolute -left-24 -top-20 h-40 w-64 rounded-full bg-gradient-to-r from-indigo-500/10 via-emerald-500/6 to-sky-500/10 blur-3xl"
      strengthY={22}
      strengthX={18}
      startAt={1.0}
      endAt={0.0}
    />
    <Parallax
      className="pointer-events-none absolute -bottom-24 -right-24 h-44 w-72 rounded-full bg-gradient-to-r from-sky-500/10 via-emerald-500/6 to-indigo-500/10 blur-3xl"
      strengthY={18}
      strengthX={-16}
      startAt={1.0}
      endAt={0.0}
    />

    <div className="relative flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-100">Ready to bring structure to your portfolio?</p>
        <p className="text-sm text-slate-400">Sign in or request access to start using LedgerOne.</p>
      </div>

      <div className="flex flex-nowrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-slate-50 shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/35 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/45"
        >
          Request access
        </Link>
      </div>
    </div>

    <p className="relative mt-4 text-center text-[11px] text-slate-500"></p>
  </section>
</Reveal>

{/* FAQ */}
<Reveal>
  <FAQSection />
</Reveal>

{/* FOOTER */}
<Reveal>
  <LandingFooter />
</Reveal>
      </div>
    </>
  )
}