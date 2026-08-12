'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Eye, EyeOff, Info, Percent } from 'lucide-react'
import { displayCurrencySymbol, fmtCurrency } from '@/lib/format'
import CoinLogo from '@/components/common/CoinLogo'
import { AlertsTooltip } from '@/components/common/AlertsTooltip'
import MobileGrowthChart, { type Point } from '@/components/dashboard/MobileGrowthChart'
import MobileTransactions from '@/components/dashboard/MobileTransactions'

type Timeframe = '24h' | '7d' | '30d' | '90d' | '1y' | 'YTD' | 'Max'
type TradeLite = { coingecko_id: string; side: 'buy' | 'sell'; price: number; quantity: number; fee: number; trade_time: string }
type CoinMeta = { coingecko_id: string; symbol: string; name: string }
type AssetPerformance = { id: string; delta: number; pct: number }

const TIMEFRAMES: Timeframe[] = ['24h', '7d', '30d', '90d', '1y', 'YTD', 'Max']
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
const ACCENT = 'rgb(137,128,213)'
const RANGE_DATE = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

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

function splitCents(text: string): [string, string] {
  const i = text.lastIndexOf('.')
  if (i < 0) return [text, '']
  return [text.slice(0, i), text.slice(i)]
}

function signedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${fmtCurrency(Math.abs(value))}`
}

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
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
        style={{ backgroundColor: ACCENT }}
      />
    </button>
  )
}

function TimeframeRow({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div className="scrollbar-auto-hide overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <div className="flex w-max items-center gap-2 px-5 pb-1">
        {TIMEFRAMES.map(opt => {
          const active = value === opt
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt)}
              className={[
                'min-w-[58px] select-none rounded-full border px-4 py-2 text-[12px] font-medium uppercase tracking-wide transition-colors focus:outline-none',
                active
                  ? 'border-[rgb(137,128,213)] bg-[rgba(137,128,213,0.12)] text-[rgb(137,128,213)]'
                  : 'border-[rgb(58,59,63)] text-slate-400',
              ].join(' ')}
            >
              {TF_LABEL[opt]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  tf: Timeframe
  onTfChange: (tf: Timeframe) => void
  showTotalPL: boolean
  onShowTotalPLChange: (v: boolean) => void
  chartSeries: Point[]
  chartLoading: boolean
  liveValue: number
  delta: number
  pct: number
  realizedProfit: number
  unrealizedProfit: number
  performanceBasis: number
  assetPerformance: AssetPerformance[]
  coinIds: string[]
  historiesMapLive: Record<string, Point[]>
  trades: TradeLite[] | undefined
  coins: CoinMeta[] | undefined
  tradesByCoinForAlerts: Map<string, TradeLite[]>
}

export default function MobileDashboard({
  tf,
  onTfChange,
  showTotalPL,
  onShowTotalPLChange,
  chartSeries,
  chartLoading,
  liveValue,
  delta,
  pct,
  realizedProfit,
  unrealizedProfit,
  performanceBasis,
  assetPerformance,
  coinIds,
  historiesMapLive,
  trades,
  coins,
  tradesByCoinForAlerts,
}: Props) {
  const [assetsOpen, setAssetsOpen] = useState(true)
  const [performanceUnit, setPerformanceUnit] = useState<'percent' | 'currency'>('percent')
  const [performanceHidden, setPerformanceHidden] = useState(false)
  const currencySymbol = displayCurrencySymbol()

  const [headWhole, headCents] = splitCents(fmtCurrency(liveValue))
  const up = pct >= 0

  const assets = useMemo(() => {
    const qty = new Map<string, number>()
    coinIds.forEach(id => qty.set(id, 0))
    for (const tr of trades ?? []) {
      const cur = qty.get(tr.coingecko_id) ?? 0
      qty.set(tr.coingecko_id, cur + (tr.side === 'buy' ? tr.quantity : -tr.quantity))
    }

    return coinIds
      .map(id => {
        const series = historiesMapLive[id] ?? []
        const last = series.length ? series[series.length - 1].v : null
        const first = series.length ? series[0].v : null
        const amount = qty.get(id) ?? 0
        const price = last != null && Number.isFinite(last) ? last : null
        const value = price != null && Number.isFinite(amount) ? price * amount : 0
        const pct24h = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null
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
      .filter(r => r.amount !== 0 || r.value !== 0)
      .sort((a, b) => b.value - a.value)
  }, [coinIds, historiesMapLive, trades, coins])

  const performanceRows = useMemo(
    () => assetPerformance.map(row => {
      const meta = (coins ?? []).find(c => c.coingecko_id === row.id)
      return {
        ...row,
        symbol: (meta?.symbol || row.id).toUpperCase(),
        name: normalizeAssetName(meta?.name || row.id),
      }
    }),
    [assetPerformance, coins]
  )

  const performancePercentSeries = useMemo(() => {
    const first = chartSeries[0]?.v ?? 0
    return chartSeries.map(point => ({
      ...point,
      v: performanceBasis > 0 ? ((point.v - first) / performanceBasis) * 100 : 0,
    }))
  }, [chartSeries, performanceBasis])

  const rangeText = useMemo(() => {
    if (chartSeries.length < 2) return 'Waiting for range data'
    return `${RANGE_DATE.format(new Date(chartSeries[0].t))} – ${RANGE_DATE.format(new Date(chartSeries[chartSeries.length - 1].t))}`
  }, [chartSeries])

  return (
    <div data-dashboard-mobile className="pb-2">
      <div className="flex items-end gap-6 border-b border-[rgb(41,42,45)] px-5 pt-1">
        <Tab label="Overview" active={!showTotalPL} onClick={() => onShowTotalPLChange(false)} />
        <Tab label="Performance" active={showTotalPL} onClick={() => onShowTotalPLChange(true)} />
      </div>

      {showTotalPL ? (
        <div data-dashboard-performance>
          <section className="px-5 pb-1 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14px] font-medium text-slate-400">
                  <span>{TF_LABEL[tf]} crypto profit &amp; loss</span>
                  <button
                    type="button"
                    onClick={() => setPerformanceHidden(v => !v)}
                    aria-label={performanceHidden ? 'Show performance amounts' : 'Hide performance amounts'}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 active:bg-white/5"
                  >
                    {performanceHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div
                  className="mt-2 font-display text-[40px] font-bold leading-none tracking-tight"
                  style={{ color: delta >= 0 ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}
                >
                  {performanceHidden ? '••••••' : signedCurrency(delta)}
                </div>

                <div className="mt-3 flex items-center gap-1.5" style={{ color: delta >= 0 ? POS : NEG }}>
                  <span className="text-[17px] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {signedPercent(pct)}
                  </span>
                  <Info className="h-4 w-4 text-slate-500" aria-hidden="true" />
                </div>
                <div className="mt-2 text-[12.5px] text-slate-500">{rangeText}</div>
              </div>

              <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] p-1">
                <button
                  type="button"
                  aria-label="Show performance as percent"
                  aria-pressed={performanceUnit === 'percent'}
                  onClick={() => setPerformanceUnit('percent')}
                  className={[
                    'inline-flex h-9 w-10 items-center justify-center rounded-full transition-colors',
                    performanceUnit === 'percent' ? 'bg-[rgba(137,128,213,0.2)] text-[rgb(137,128,213)]' : 'text-slate-400',
                  ].join(' ')}
                >
                  <Percent className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Show performance in currency"
                  aria-pressed={performanceUnit === 'currency'}
                  onClick={() => setPerformanceUnit('currency')}
                  className={[
                    'inline-flex h-9 w-10 items-center justify-center rounded-full transition-colors',
                    performanceUnit === 'currency' ? 'bg-[rgba(137,128,213,0.2)] text-[rgb(137,128,213)]' : 'text-slate-400',
                  ].join(' ')}
                >
                  <span className="text-[17px] font-medium leading-none" aria-hidden="true">
                    {currencySymbol}
                  </span>
                </button>
              </div>
            </div>
          </section>

          <div className="relative mt-5 h-[220px] w-full border-y border-[rgb(41,42,45)]">
            {chartLoading && chartSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12.5px] text-slate-500">
                Loading performance history…
              </div>
            ) : (
              <MobileGrowthChart
                data={performanceUnit === 'percent' ? performancePercentSeries : chartSeries}
                valueMode={performanceUnit}
                showGrid
                markersRight
              />
            )}
          </div>

          <div className="mt-4">
            <TimeframeRow value={tf} onChange={onTfChange} />
          </div>

          <section
            data-performance-summary
            aria-label="Portfolio performance summary"
            className="mt-4 grid w-full grid-cols-3 border-y border-[rgb(41,42,45)]"
          >
            <div className="min-w-0 px-3 py-4 text-center">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Assets held
              </div>
              <div
                className="mt-1.5 truncate text-[15px] font-semibold text-slate-100"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {assets.length}
              </div>
            </div>

            <div className="min-w-0 border-l border-[rgb(41,42,45)] px-2 py-4 text-center">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-500">
                Realized P&amp;L
              </div>
              <div
                className="mt-1.5 truncate text-[13px] font-semibold"
                style={{
                  color: realizedProfit > 0 ? POS : realizedProfit < 0 ? NEG : 'rgb(226,228,235)',
                  fontVariantNumeric: 'tabular-nums',
                }}
                title={signedCurrency(realizedProfit)}
              >
                {performanceHidden ? '••••' : signedCurrency(realizedProfit)}
              </div>
            </div>

            <div className="min-w-0 border-l border-[rgb(41,42,45)] px-2 py-4 text-center">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-500">
                Unrealized P&amp;L
              </div>
              <div
                className="mt-1.5 truncate text-[13px] font-semibold"
                style={{
                  color: unrealizedProfit > 0 ? POS : unrealizedProfit < 0 ? NEG : 'rgb(226,228,235)',
                  fontVariantNumeric: 'tabular-nums',
                }}
                title={signedCurrency(unrealizedProfit)}
              >
                {performanceHidden ? '••••' : signedCurrency(unrealizedProfit)}
              </div>
            </div>
          </section>

          <section className="mt-6 w-full overflow-hidden border-y border-[rgb(41,42,45)]">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">Asset performance</h2>
              <span className="text-[11px] uppercase tracking-wide text-slate-500">{TF_LABEL[tf]}</span>
            </div>

            {performanceRows.length === 0 ? (
              <div className="border-t border-[rgb(41,42,45)] px-4 py-5 text-[12.5px] text-slate-400">
                No performance data is available for this range yet.
              </div>
            ) : (
              <ul>
                {performanceRows.map(row => {
                  const positive = row.delta >= 0
                  const currencyValue = performanceHidden ? '••••' : signedCurrency(row.delta)
                  const percentValue = signedPercent(row.pct)
                  const primaryValue = performanceUnit === 'percent' ? percentValue : currencyValue
                  const secondaryValue = performanceUnit === 'percent' ? currencyValue : percentValue
                  return (
                    <li key={row.id} className="border-t border-[rgb(41,42,45)] first:border-t">
                      <Link
                        href={`/coins/${row.id}`}
                        className="flex items-center gap-3 px-4 py-4 transition-colors active:bg-[rgb(32,33,35)]"
                      >
                        <CoinLogo symbol={row.symbol} name={row.name} className="h-9 w-9 flex-none" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-semibold text-slate-100">{row.name}</div>
                          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{row.symbol}</div>
                        </div>
                        <div className="flex-none text-right" style={{ color: positive ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}>
                          <div data-asset-performance-primary className="text-[15px] font-medium">
                            {primaryValue}
                          </div>
                          <div data-asset-performance-secondary className="mt-0.5 text-[12.5px] opacity-80">
                            {secondaryValue}
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="px-5 pt-5">
            <div
              className="mb-2 mt-1.5 font-display text-4xl font-bold tracking-tight text-slate-100"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {headWhole}
              <span className="text-slate-500">{headCents}</span>
            </div>
            <div className="flex items-center gap-2.5 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[15px] font-medium',
                  up ? 'bg-[rgba(116,170,98,0.12)] text-[rgb(116,170,98)]' : 'bg-[rgba(214,66,78,0.1)] text-[rgb(214,66,78)]',
                ].join(' ')}
              >
                <span>{up ? '▴' : '▾'}</span>
                <span>{Math.abs(pct).toFixed(2)}</span>
                <span>%</span>
              </span>
              <span className="text-[15px]" style={{ color: up ? POS : NEG }}>
                {delta >= 0 ? '+' : '-'}{fmtCurrency(Math.abs(delta))}
              </span>
              <span className="text-[12px] text-slate-500">{TF_LABEL[tf]}</span>
            </div>
          </div>

          <div className="relative mt-4 h-[160px] w-full">
            {chartLoading && chartSeries.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-[12.5px] text-slate-500">
                Loading portfolio history…
              </div>
            ) : (
              <MobileGrowthChart data={chartSeries} />
            )}
          </div>

          <div className="mt-3">
            <TimeframeRow value={tf} onChange={onTfChange} />
          </div>

          <div className="mt-4 border-t border-[rgb(41,42,45)] px-5 pb-4 pt-4">
            <div data-mobile-alert-pill>
              <AlertsTooltip coinIds={coinIds} tradesByCoin={tradesByCoinForAlerts} coins={coins} />
            </div>
          </div>

          <div className="border-t border-[rgb(41,42,45)] pt-4">
            <button
              type="button"
              onClick={() => setAssetsOpen(v => !v)}
              aria-expanded={assetsOpen}
              className="flex select-none items-center gap-1.5 px-5 pb-1 text-[15px] font-semibold tracking-tight text-[rgb(137,128,213)] focus:outline-none"
            >
              My assets
              <ChevronDown className={['h-4 w-4 transition-transform', assetsOpen ? '' : '-rotate-90'].join(' ')} />
            </button>

            {assetsOpen && (assets.length === 0 ? (
              <div className="px-5 py-4 text-[12.5px] text-slate-400">
                No holdings yet. Add your first trade to see your assets here.
              </div>
            ) : (
              <ul className="mt-1">
                {assets.map(asset => (
                  <li key={asset.id}>
                    <Link href={`/coins/${asset.id}`} className="flex items-center gap-3.5 px-5 py-3.5 transition-colors active:bg-[rgb(32,33,35)]">
                      <CoinLogo symbol={asset.symbol} name={asset.name} className="h-9 w-9 flex-none" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-slate-100">{asset.name}</div>
                        <div className="mt-0.5 truncate text-[12.5px] text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {Number.isFinite(asset.amount) ? `${asset.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${asset.symbol}` : '—'}
                        </div>
                      </div>
                      <div className="flex-none text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <div className="text-[15px] font-medium text-slate-100">{fmtCurrency(asset.value)}</div>
                        <div className="mt-0.5 text-[12.5px]" style={{ color: asset.pct24h == null ? 'rgb(100,116,139)' : asset.pct24h >= 0 ? POS : NEG }}>
                          {asset.pct24h == null ? '—' : `${asset.pct24h >= 0 ? '+' : '-'}${Math.abs(asset.pct24h).toFixed(2)}%`}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>

          <div className="mt-5">
            <MobileTransactions coins={coins} />
          </div>
        </>
      )}
    </div>
  )
}
