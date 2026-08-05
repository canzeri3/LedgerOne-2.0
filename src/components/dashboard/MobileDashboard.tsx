'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import CoinLogo from '@/components/common/CoinLogo'
import { AlertsTooltip } from '@/components/common/AlertsTooltip'
import MobileGrowthChart, { type Point } from '@/components/dashboard/MobileGrowthChart'
import MobileTransactions from '@/components/dashboard/MobileTransactions'

/* Structurally identical to the dashboard page's local Timeframe union. */
type Timeframe = '24h' | '7d' | '30d' | '90d' | '1y' | 'YTD' | 'Max'
type TradeLite = { coingecko_id: string; side: 'buy' | 'sell'; price: number; quantity: number; fee: number; trade_time: string }
type CoinMeta = { coingecko_id: string; symbol: string; name: string }

const TIMEFRAMES: Timeframe[] = ['24h', '7d', '30d', '90d', '1y', 'YTD', 'Max']

/** Short pill labels, in the spirit of the reference layout's 24H / 1W / 1M row. */
const TF_LABEL: Record<Timeframe, string> = {
  '24h': '24H',
  '7d': '1W',
  '30d': '1M',
  '90d': '3M',
  '1y': '1Y',
  'YTD': 'YTD',
  'Max': 'ALL',
}

const POS = 'rgb(116,170,98)'
const NEG = 'rgb(214,66,78)'

/** Display-only: turn slug/ALL-CAPS names into Title Case, matching the holdings table. */
function normalizeAssetName(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return s
  const isSlugLike = /^[a-z0-9-]+$/.test(s)
  const isAllCaps = s === s.toUpperCase() && /[A-Z]/.test(s)
  if (!isSlugLike && !isAllCaps) return s
  return s
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Split a formatted currency string so the fractional part can be de-emphasised. */
function splitCents(text: string): [string, string] {
  const i = text.lastIndexOf('.')
  if (i < 0) return [text, '']
  return [text.slice(0, i), text.slice(i)]
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'relative select-none pb-2 font-display text-[24px] font-semibold tracking-tight transition-colors focus:outline-none',
        active ? 'text-slate-100' : 'text-slate-500',
      ].join(' ')}
    >
      {label}
      <span
        aria-hidden="true"
        className={[
          'absolute inset-x-0 bottom-0 h-[2.5px] rounded-full transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{ backgroundColor: 'rgb(137,128,213)' }}
      />
    </button>
  )
}

function StatCell({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' | 'neutral' }) {
  const color = tone === 'pos' ? POS : tone === 'neg' ? NEG : 'rgb(203,213,225)'
  return (
    <div className="min-w-0 flex-1 border-l border-[rgb(41,42,45)] px-3 first:border-l-0 first:pl-0">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div
        className="mt-1 truncate text-[15px] font-medium"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  )
}

function toneOf(n: number): 'pos' | 'neg' | 'neutral' {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'neutral'
}

type Props = {
  tf: Timeframe
  onTfChange: (tf: Timeframe) => void
  showTotalPL: boolean
  onShowTotalPLChange: (v: boolean) => void
  chartSeries: Point[]
  chartLoading: boolean
  liveValue: number
  totalProfit: number
  realizedProfit: number
  unrealizedProfit: number
  delta: number
  pct: number
  coinIds: string[]
  historiesMapLive: Record<string, Point[]>
  trades: TradeLite[] | undefined
  coins: CoinMeta[] | undefined
  tradesByCoinForAlerts: Map<string, TradeLite[]>
}

/**
 * Phone layout for /dashboard: segmented Overview/Performance tabs over a
 * full-bleed chart, a single alert pill, and a tappable asset list.
 * All numbers are passed in from the page — this component fetches nothing.
 */
export default function MobileDashboard({
  tf,
  onTfChange,
  showTotalPL,
  onShowTotalPLChange,
  chartSeries,
  chartLoading,
  liveValue,
  totalProfit,
  realizedProfit,
  unrealizedProfit,
  delta,
  pct,
  coinIds,
  historiesMapLive,
  trades,
  coins,
  tradesByCoinForAlerts,
}: Props) {
  const [assetsOpen, setAssetsOpen] = useState(true)

  const headline = fmtCurrency(showTotalPL ? totalProfit : liveValue)
  const [headWhole, headCents] = splitCents(headline)
  const up = pct >= 0

  /** Holdings + 24h move, derived from the live (1-day) history already on the page. */
  const assets = useMemo(() => {
    const qty = new Map<string, number>()
    coinIds.forEach(id => qty.set(id, 0))
    for (const tr of trades ?? []) {
      const cur = qty.get(tr.coingecko_id) ?? 0
      qty.set(tr.coingecko_id, cur + (tr.side === 'buy' ? tr.quantity : -tr.quantity))
    }

    const out = coinIds.map(id => {
      const series = historiesMapLive[id] ?? []
      const last = series.length ? series[series.length - 1].v : null
      const first = series.length ? series[0].v : null
      const amount = qty.get(id) ?? 0
      const price = last != null && Number.isFinite(last) ? last : null
      const value = price != null && Number.isFinite(amount) ? price * amount : 0
      const pct24h =
        first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null
      const meta = (coins ?? []).find(c => c.coingecko_id === id)
      return {
        id,
        symbol: (meta?.symbol || id).toUpperCase(),
        name: normalizeAssetName(meta?.name || id),
        amount,
        value,
        pct24h,
      }
    })

    return out
      .filter(r => (r.amount || 0) !== 0 || (r.value || 0) !== 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  }, [coinIds, historiesMapLive, trades, coins])

  return (
    <div data-dashboard-mobile className="pb-2">
      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex items-end gap-6 border-b border-[rgb(41,42,45)] px-5 pt-1">
        <Tab label="Overview" active={!showTotalPL} onClick={() => onShowTotalPLChange(false)} />
        <Tab label="Performance" active={showTotalPL} onClick={() => onShowTotalPLChange(true)} />
      </div>

      {/* ── Headline value + delta ───────────────────────────── */}
      <div className="px-5 pt-5">
        <div
          className="font-display text-[38px] font-bold leading-none tracking-tight text-slate-100"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {headWhole}
          <span className="text-slate-500">{headCents}</span>
        </div>
        <div
          className="mt-2.5 flex items-baseline gap-2 whitespace-nowrap text-[14px]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <span style={{ color: up ? POS : NEG }}>
            {delta >= 0 ? '+' : '-'}
            {fmtCurrency(Math.abs(delta))}
          </span>
          <span style={{ color: up ? POS : NEG }}>
            ({up ? '+' : '-'}
            {Math.abs(pct).toFixed(2)}%)
          </span>
          <span className="text-slate-500">{TF_LABEL[tf]}</span>
        </div>
      </div>

      {/* ── Chart (edge to edge) ─────────────────────────────── */}
      <div className="relative mt-4 h-[160px] w-full">
        {chartLoading && chartSeries.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-[12.5px] text-slate-500">
            Loading portfolio history…
          </div>
        ) : (
          <MobileGrowthChart data={chartSeries} />
        )}
      </div>

      {/* ── Timeframe pills ──────────────────────────────────── */}
      <div className="scrollbar-auto-hide mt-3 overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <div className="flex w-max items-center gap-2 px-5 pb-1">
          {TIMEFRAMES.map(opt => {
            const active = tf === opt
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={active}
                onClick={() => onTfChange(opt)}
                className={[
                  'select-none rounded-full border px-4 py-2 text-[12px] font-medium uppercase tracking-wide transition-colors focus:outline-none',
                  active
                    ? 'border-[rgb(137,128,213)] text-[rgb(137,128,213)]'
                    : 'border-[rgb(58,59,63)] text-slate-400',
                ].join(' ')}
              >
                {TF_LABEL[opt]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── P&L breakdown (Performance tab only) ─────────────── */}
      {showTotalPL && (
        <div className="mt-4 flex items-start border-t border-[rgb(41,42,45)] px-5 pt-4">
          <StatCell label="Total P&L" value={fmtCurrency(totalProfit)} tone={toneOf(totalProfit)} />
          <StatCell label="Realized" value={fmtCurrency(realizedProfit)} tone={toneOf(realizedProfit)} />
          <StatCell label="Unrealized" value={fmtCurrency(unrealizedProfit)} tone={toneOf(unrealizedProfit)} />
        </div>
      )}

      {/* ── Single alert pill (replaces buy/sell/deposit row) ── */}
      <div className="mt-4 border-t border-[rgb(41,42,45)] px-5 pb-4 pt-4">
        <div data-mobile-alert-pill>
          <AlertsTooltip coinIds={coinIds} tradesByCoin={tradesByCoinForAlerts} coins={coins} />
        </div>
      </div>

      {/* ── My assets ────────────────────────────────────────── */}
      <div className="border-t border-[rgb(41,42,45)] pt-4">
        <button
          type="button"
          onClick={() => setAssetsOpen(v => !v)}
          aria-expanded={assetsOpen}
          className="flex select-none items-center gap-1.5 px-5 pb-1 text-[15px] font-medium text-[rgb(137,128,213)] focus:outline-none"
        >
          My assets
          <ChevronDown
            className={['h-4 w-4 transition-transform', assetsOpen ? '' : '-rotate-90'].join(' ')}
          />
        </button>

        {assetsOpen &&
          (assets.length === 0 ? (
            <div className="px-5 py-4 text-[12.5px] text-slate-400">
              No holdings yet. Add your first trade to see your assets here.
            </div>
          ) : (
            <ul className="mt-1">
              {assets.map(a => (
                <li key={a.id}>
                  <Link
                    href={`/coins/${a.id}`}
                    className="flex items-center gap-3.5 px-5 py-3.5 transition-colors active:bg-[rgb(32,33,35)]"
                  >
                    <CoinLogo symbol={a.symbol} name={a.name} className="h-9 w-9 flex-none" />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium text-slate-100">{a.name}</div>
                      <div
                        className="mt-0.5 truncate text-[12.5px] text-slate-500"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {Number.isFinite(a.amount)
                          ? `${a.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${a.symbol}`
                          : '—'}
                      </div>
                    </div>

                    <div className="flex-none text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <div className="text-[15px] font-medium text-slate-100">{fmtCurrency(a.value)}</div>
                      <div
                        className="mt-0.5 text-[12.5px]"
                        style={{
                          color: a.pct24h == null ? 'rgb(100,116,139)' : a.pct24h >= 0 ? POS : NEG,
                        }}
                      >
                        {a.pct24h == null
                          ? '—'
                          : `${a.pct24h >= 0 ? '+' : '-'}${Math.abs(a.pct24h).toFixed(2)}%`}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {/* ── Transactions ─────────────────────────────────────── */}
      <div className="mt-5">
        <MobileTransactions coins={coins} />
      </div>
    </div>
  )
}
