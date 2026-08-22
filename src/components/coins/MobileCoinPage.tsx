'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Activity, ArrowLeft, BellPlus, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import CoinLogo from '@/components/common/CoinLogo'
import MobileGrowthChart, { type Point } from '@/components/dashboard/MobileGrowthChart'
import { useHistory, usePrice, usePrices } from '@/lib/dataCore'
import { fmtCurrency } from '@/lib/format'
import { computePnl, type Trade as PnlTrade } from '@/lib/pnl'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { useFavorites } from '@/lib/useFavorites'

const POS = 'rgb(116,170,98)'
const NEG = 'rgb(214,66,78)'
const ACCENT = 'rgb(137,128,213)'

type TfKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'ytd' | 'max'

const TF_LABEL: Record<TfKey, string> = {
  '24h': '24H',
  '7d': '1W',
  '30d': '1M',
  '90d': '3M',
  '1y': '1Y',
  ytd: 'YTD',
  max: 'Max',
}
const TF_ORDER: TfKey[] = ['24h', '7d', '30d', '90d', '1y', 'ytd', 'max']

function ytdDays(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1).getTime()
  return Math.max(1, Math.ceil((Date.now() - start) / 86_400_000))
}

function daysFor(tf: TfKey): number {
  switch (tf) {
    case '24h': return 1
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case '1y': return 365
    case 'ytd': return ytdDays()
    case 'max': return 3650
  }
}

function intervalFor(days: number): 'minute' | 'hourly' | 'daily' {
  if (days === 1) return 'minute'
  if (days <= 7) return 'hourly'
  return 'daily'
}

/** Split a formatted currency string so the fractional part can be de-emphasised. */
function splitCents(text: string): [string, string] {
  const i = text.lastIndexOf('.')
  if (i < 0) return [text, '']
  return [text.slice(0, i), text.slice(i)]
}

/**
 * Position value over the window: quantity held at each price point × that price.
 * Trades before the window are folded into the opening quantity.
 */
function buildValueSeries(points: Array<{ t: number; p: number }>, trades: PnlTrade[]): Point[] {
  if (!points.length) return []

  const sorted = [...trades].sort(
    (a, b) => new Date(a.trade_time).getTime() - new Date(b.trade_time).getTime()
  )

  let ti = 0
  let qty = 0
  const out: Point[] = []

  for (const pt of points) {
    while (ti < sorted.length && new Date(sorted[ti].trade_time).getTime() <= pt.t) {
      const tr = sorted[ti++]
      qty += tr.side === 'buy' ? Number(tr.quantity ?? 0) : -Number(tr.quantity ?? 0)
    }
    const v = qty * Number(pt.p ?? 0)
    out.push({ t: pt.t, v: Number.isFinite(v) ? Math.max(0, v) : 0 })
  }

  return out
}

function CircleButton({
  children,
  onClick,
  href,
  label,
  active,
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  label: string
  active?: boolean
}) {
  const cls = [
    'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full transition-colors',
    'bg-[rgb(32,33,35)] active:bg-[rgb(41,42,45)]',
    active ? 'text-[rgb(242,205,73)]' : 'text-slate-300',
  ].join(' ')

  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {children}
    </button>
  )
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div
        className="mt-1.5 truncate text-[19px] font-medium"
        style={{ color: color ?? 'rgb(226,232,240)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  )
}

/** Small progress ring used for the portfolio-diversity share. */
function ShareRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(1, pct))
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] flex-none" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgb(58,59,63)" strokeWidth="2.5" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={ACCENT}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${c * clamped} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}

type Props = {
  id: string
  name: string
  symbol: string
  /** Existing desktop sections (add trade, planners, trades list), rendered below. */
  children?: ReactNode
}

/**
 * Phone layout for /coins/[id]. Mirrors the mobile dashboard: headline is the
 * value of this position (not the market price), charted over the selected
 * window with the dashboard's chart and type scale.
 */
export default function MobileCoinPage({ id, name, symbol, children }: Props) {
  const router = useRouter()
  const { user } = useUser()
  const { isFavorite, toggle, isLoading: favLoading } = useFavorites()
  const [tf, setTf] = useState<TfKey>('24h')
  const timeframeScrollRef = useRef<HTMLDivElement | null>(null)
  const [timeframeEdges, setTimeframeEdges] = useState({ left: false, right: false })

  const days = daysFor(tf)
  const { row } = usePrice(id)
  const { points, isLoading: histLoading } = useHistory(id, days, intervalFor(days), 'USD')

  const livePrice = row?.price ?? null

  // Trades for this coin → position stats
  const { data: coinTrades } = useSWR<PnlTrade[]>(
    user ? ['/mobile-coin/trades', user.id, id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('side,price,quantity,fee,trade_time')
        .eq('user_id', user!.id)
        .eq('coingecko_id', id)
        .order('trade_time', { ascending: true })
      if (error) throw error
      return (data ?? []).map((t: any) => ({
        side: (String(t.side).toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
        price: Number(t.price ?? 0),
        quantity: Number(t.quantity ?? 0),
        fee: Number(t.fee ?? 0),
        trade_time: String(t.trade_time),
      }))
    },
    { refreshInterval: 60_000, keepPreviousData: true }
  )

  const pnl = useMemo(() => computePnl(coinTrades ?? []), [coinTrades])
  const positionValue = livePrice != null ? pnl.positionQty * livePrice : 0
  const unrealized = livePrice != null ? positionValue - pnl.costBasis : 0

  // Value of this holding across the window, with the last point pinned to live.
  const valueSeries = useMemo<Point[]>(() => {
    const base = buildValueSeries(Array.isArray(points) ? points : [], coinTrades ?? [])
    if (!base.length) return base
    const out = base.slice()
    out[out.length - 1] = { ...out[out.length - 1], v: positionValue }
    return out
  }, [points, coinTrades, positionValue])

  const { delta, pct } = useMemo(() => {
    if (valueSeries.length < 2) return { delta: 0, pct: 0 }
    const first = valueSeries[0].v
    const last = valueSeries[valueSeries.length - 1].v
    const d = last - first
    return { delta: d, pct: first > 0 ? (d / first) * 100 : 0 }
  }, [valueSeries])

  const up = delta >= 0
  const [headWhole, headCents] = splitCents(fmtCurrency(positionValue))

  // Whole-portfolio holdings, for this coin's share of total value
  const { data: allTrades } = useSWR<Array<{ coingecko_id: string; side: string; quantity: number }>>(
    user ? ['/mobile-coin/all-trades', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('trades')
        .select('coingecko_id,side,quantity')
        .eq('user_id', user!.id)
      if (error) throw error
      return (data ?? []) as any
    },
    { refreshInterval: 120_000, keepPreviousData: true }
  )

  const qtyByCoin = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of allTrades ?? []) {
      const cur = m.get(t.coingecko_id) ?? 0
      const q = Number(t.quantity ?? 0)
      m.set(t.coingecko_id, cur + (String(t.side).toLowerCase() === 'sell' ? -q : q))
    }
    return m
  }, [allTrades])

  const portfolioIds = useMemo(
    () => Array.from(qtyByCoin.keys()).filter(k => (qtyByCoin.get(k) ?? 0) > 0).sort(),
    [qtyByCoin]
  )

  const { rows: portfolioRows } = usePrices(portfolioIds)

  const share = useMemo(() => {
    if (!portfolioIds.length || positionValue <= 0) return 0
    let total = 0
    for (const r of portfolioRows ?? []) {
      const qty = qtyByCoin.get(r.id) ?? 0
      const price = Number(r.price ?? 0)
      if (qty > 0 && Number.isFinite(price)) total += qty * price
    }
    return total > 0 ? positionValue / total : 0
  }, [portfolioRows, portfolioIds, qtyByCoin, positionValue])

  const fav = isFavorite(id)

  useEffect(() => {
    const scroller = timeframeScrollRef.current
    if (!scroller) return

    const updateEdges = () => {
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      setTimeframeEdges({
        left: scroller.scrollLeft > 4,
        right: scroller.scrollLeft < maxScroll - 4,
      })
    }

    updateEdges()
    scroller.addEventListener('scroll', updateEdges, { passive: true })
    const observer = new ResizeObserver(updateEdges)
    observer.observe(scroller)

    return () => {
      scroller.removeEventListener('scroll', updateEdges)
      observer.disconnect()
    }
  }, [])

  return (
    <div data-coin-mobile className="pb-2">
      {/* ── Coin header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 pb-1 pt-1">
        <CircleButton label="Go back" onClick={() => router.back()}>
          <ArrowLeft className="h-[18px] w-[18px]" />
        </CircleButton>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <CoinLogo symbol={symbol} name={name} className="h-6 w-6 flex-none" />
          <span className="truncate text-[17px] font-semibold text-slate-100">{name}</span>
        </div>

        <CircleButton label={`Plan alerts for ${name}`} href={`/planner?id=${encodeURIComponent(id)}`}>
          <BellPlus className="h-[18px] w-[18px]" />
        </CircleButton>

        <CircleButton
          label={fav ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          active={fav}
          onClick={() => {
            if (!favLoading) void toggle(id)
          }}
        >
          <Star className="h-[18px] w-[18px]" fill={fav ? 'currentColor' : 'none'} />
        </CircleButton>
      </div>

      {/* ── Headline: value of this holding ──────────────────── */}
      <div className="px-5 pt-4">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-500">
          Your position value
        </div>
        {/* Same type scale as the desktop dashboard hero. */}
        <div
          className="mb-2 mt-1 font-display text-4xl font-bold tracking-tight text-slate-100"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {headWhole}
          <span className="text-slate-500">{headCents}</span>
        </div>
        <div
          className="flex items-center gap-2.5 whitespace-nowrap"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <span
            className={[
              'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[15px] font-medium',
              up
                ? 'bg-[rgba(116,170,98,0.12)] text-[rgb(116,170,98)]'
                : 'bg-[rgba(214,66,78,0.1)] text-[rgb(214,66,78)]',
            ].join(' ')}
          >
            <span>{up ? '▴' : '▾'}</span>
            <span>{Math.abs(pct).toFixed(2)}</span>
            <span>%</span>
          </span>
          <span className="text-[15px]" style={{ color: up ? POS : NEG }}>
            {delta >= 0 ? '+' : '-'}
            {fmtCurrency(Math.abs(delta))}
          </span>
          <span className="text-[12px] text-slate-500">{TF_LABEL[tf]}</span>
        </div>
      </div>

      {/* ── Chart (same as the mobile dashboard) ─────────────── */}
      <div className="relative mt-4 h-[160px] w-full">
        {histLoading && valueSeries.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-[12.5px] text-slate-500">
            Loading history…
          </div>
        ) : (
          <MobileGrowthChart data={valueSeries} />
        )}
      </div>

      {/* ── Timeframe pills ──────────────────────────────────── */}
      <div className="relative mt-3">
        <div
          ref={timeframeScrollRef}
          className="scrollbar-auto-hide overflow-x-auto [-webkit-overflow-scrolling:touch]"
          aria-label="Performance timeframes; swipe horizontally for more options"
        >
          <div className="flex w-max items-center gap-2 px-5 pb-1">
            {TF_ORDER.map(opt => {
              const active = tf === opt
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTf(opt)}
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

        {timeframeEdges.left ? (
          <span className="coin-timeframe-cue left pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-start pl-1 text-slate-500">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
        {timeframeEdges.right ? (
          <span className="coin-timeframe-cue right pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end pr-1 text-slate-400">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      {/* ── Performance ──────────────────────────────────────── */}
      <div className="mt-5 px-5">
        <div className="rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] p-4">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">Performance</h2>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <StatCell
              label="Unrealized P&amp;L"
              value={
                pnl.positionQty > 0
                  ? `${unrealized >= 0 ? '+' : '-'}${fmtCurrency(Math.abs(unrealized))}`
                  : '—'
              }
              color={pnl.positionQty > 0 ? (unrealized >= 0 ? POS : NEG) : undefined}
            />
            <StatCell
              label="Avg. cost"
              value={pnl.positionQty > 0 ? fmtCurrency(pnl.avgCost) : '—'}
            />
            <StatCell
              label="Net invested"
              value={pnl.positionQty > 0 ? fmtCurrency(pnl.costBasis) : '—'}
            />

            <div className="min-w-0">
              <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-500">Portfolio diversity</div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="truncate text-[19px] font-medium text-slate-200"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {(share * 100).toFixed(2)}%
                </span>
                <ShareRing pct={share} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Existing sections (add trade, planners, trades) ──── */}
      {children}
    </div>
  )
}
