'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, X } from 'lucide-react'
import CoinLogo from '@/components/common/CoinLogo'
import { fmtCurrency, fmtPct } from '@/lib/format'
import { useMenuTransition } from '@/lib/useMenuTransition'

export type MobileHoldingDetail = {
  cid: string
  symbol: string
  name: string
  qty: number
  avg: number
  value: number
  costBasisRemaining: number
  unrealUsd: number
  realizedUsd: number
  totalPnl: number
}

type Props = {
  holding: MobileHoldingDetail | null
  onClose: () => void
}

function signedCurrency(value: number): string {
  if (value > 0) return `+${fmtCurrency(value)}`
  if (value < 0) return `−${fmtCurrency(Math.abs(value))}`
  return fmtCurrency(0)
}

function pnlPercent(value: number, basis: number): string {
  return basis > 0 ? fmtPct(value / basis) : '—'
}

function DetailCell({ label, value, sub, tone = 'neutral', wide = false }: {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral'
  wide?: boolean
}) {
  const toneClass = tone === 'positive'
    ? 'text-[rgb(116,170,98)]'
    : tone === 'negative'
      ? 'text-[rgb(214,66,78)]'
      : 'text-slate-100'

  return (
    <div className={`min-w-0 border-t border-white/10 px-4 py-3.5 ${wide ? 'col-span-2' : ''}`}>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.075em] text-slate-400">{label}</div>
      <div className={`mt-1.5 truncate text-[14px] font-semibold tabular-nums ${toneClass}`} title={value}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10.5px] text-slate-400 tabular-nums">{sub}</div> : null}
    </div>
  )
}

export default function MobileHoldingSheet({ holding, onClose }: Props) {
  const open = holding != null
  const { mounted, shown } = useMenuTransition(open, 420)
  const [displayHolding, setDisplayHolding] = useState<MobileHoldingDetail | null>(holding)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (holding) setDisplayHolding(holding)
  }, [holding])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusId = window.requestAnimationFrame(() => closeRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusId)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!mounted || !displayHolding) return null

  const basis = displayHolding.costBasisRemaining
  const unrealTone = displayHolding.unrealUsd > 0 ? 'positive' : displayHolding.unrealUsd < 0 ? 'negative' : 'neutral'
  const realizedTone = displayHolding.realizedUsd > 0 ? 'positive' : displayHolding.realizedUsd < 0 ? 'negative' : 'neutral'
  const totalTone = displayHolding.totalPnl > 0 ? 'positive' : displayHolding.totalPnl < 0 ? 'negative' : 'neutral'

  return (
    <div className="l1-coinsheet-root md:hidden" role="presentation">
      <div
        className={['l1-coinsheet-backdrop', shown ? 'is-open' : ''].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        data-mobile-holding-sheet
        className={['l1-coinsheet mobile-holding-sheet', shown ? 'is-open' : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-holding-sheet-title"
      >
        <div className="mobile-holding-sheet-scroll">
          <div className="flex items-center gap-3 px-3 pb-4 pt-2">
            <CoinLogo
              symbol={displayHolding.symbol}
              name={displayHolding.name}
              className="h-11 w-11 shrink-0 shadow-none"
            />
            <div className="min-w-0 flex-1">
              <h2 id="mobile-holding-sheet-title" className="truncate font-display text-[19px] font-semibold text-slate-100">
                {displayHolding.name}
              </h2>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                {displayHolding.symbol} · Holding details
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-slate-200 active:bg-white/15"
              aria-label="Close holding details"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-black/15">
            <div className="px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Position value</div>
              <div className="mt-1.5 font-display text-[28px] font-bold leading-none text-slate-100 tabular-nums">
                {fmtCurrency(displayHolding.value)}
              </div>
            </div>

            <div className="grid grid-cols-2">
              <DetailCell label="Quantity" value={displayHolding.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })} />
              <DetailCell label="Average cost" value={fmtCurrency(displayHolding.avg)} />
              <DetailCell label="Money invested" value={fmtCurrency(displayHolding.costBasisRemaining)} />
              <DetailCell label="Current value" value={fmtCurrency(displayHolding.value)} />
              <DetailCell
                label="Unrealized P&L"
                value={signedCurrency(displayHolding.unrealUsd)}
                sub={pnlPercent(displayHolding.unrealUsd, basis)}
                tone={unrealTone}
              />
              <DetailCell
                label="Realized P&L"
                value={signedCurrency(displayHolding.realizedUsd)}
                sub={pnlPercent(displayHolding.realizedUsd, basis)}
                tone={realizedTone}
              />
              <DetailCell
                label="Total P&L"
                value={signedCurrency(displayHolding.totalPnl)}
                sub={pnlPercent(displayHolding.totalPnl, basis)}
                tone={totalTone}
                wide
              />
            </div>
          </div>

          <Link
            href={`/coins/${displayHolding.cid}`}
            onClick={onClose}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(101,87,207)] px-4 py-3 text-[12.5px] font-semibold text-white active:bg-[rgb(114,101,218)]"
          >
            Open coin workspace
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}
