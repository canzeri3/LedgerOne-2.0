'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'
import Select from '@/components/ui/Select'
import { Trash2 } from 'lucide-react'

type Row = {
  id: string
  coingecko_id: string
  side: 'buy' | 'sell' | string
  price: number
  quantity: number
  fee: number | null
  trade_time: string
}

type Filters = {
  coinId?: string
  side?: 'buy' | 'sell'
  startDate?: string // yyyy-mm-dd
  endDate?: string // yyyy-mm-dd
}



function coinLabelFromId(coinId: string) {
  return (coinId || '').replace(/-/g, ' ').toUpperCase()
}

function toLocalStartISO(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toISOString()
}

function toLocalEndISO(dateStr: string) {
  return new Date(`${dateStr}T23:59:59.999`).toISOString()
}


const fetchCoinIdsForUser = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabaseBrowser
    .from('trades')
    .select('coingecko_id')
    .eq('user_id', userId)
    .order('coingecko_id', { ascending: true })
    .limit(500)

  if (error) throw error
  const ids = (data ?? []).map((r: any) => String(r.coingecko_id || '')).filter(Boolean)
  return Array.from(new Set(ids))
}

const fetchTransactions = async (userId: string, limit: number, filters: Filters): Promise<Row[]> => {
  // Fetch one extra row so the UI can decide whether to show "Show more".
  let q = supabaseBrowser
    .from('trades')
    .select('id, coingecko_id, side, price, quantity, fee, trade_time')
    .eq('user_id', userId)
    .order('trade_time', { ascending: false })

  if (filters.coinId) q = q.eq('coingecko_id', filters.coinId)
  if (filters.side) q = q.eq('side', filters.side)

if (filters.startDate) {
  q = q.gte('trade_time', toLocalStartISO(filters.startDate))
}
if (filters.endDate) {
  q = q.lte('trade_time', toLocalEndISO(filters.endDate))
}



  const { data, error } = await q.limit(limit + 1)

  if (error) throw error
  return (data ?? []) as Row[]
}

export default function RecentTradesCard() {
  const { user } = useUser()
  const PAGE_SIZE = 8
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

// Filters
const [coinFilter, setCoinFilter] = useState<string>('all')
const [sideFilter, setSideFilter] = useState<'all' | 'buy' | 'sell'>('all')

// Date range (opened via "Date" dropdown)
const [startDate, setStartDate] = useState<string>('')
const [endDate, setEndDate] = useState<string>('')

const [dateOpen, setDateOpen] = useState(false)
const dateWrapRef = useRef<HTMLDivElement | null>(null)


  // When filters change, reset paging
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
}, [coinFilter, sideFilter, startDate, endDate])

// Close the date dropdown on outside click / Escape
useEffect(() => {
  if (!dateOpen) return

  const onMouseDown = (e: MouseEvent) => {
    const el = dateWrapRef.current
    if (el && !el.contains(e.target as Node)) setDateOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setDateOpen(false)
  }

  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('keydown', onKeyDown)

  return () => {
    document.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('keydown', onKeyDown)
  }
}, [dateOpen])

  const { data: coinIds } = useSWR<string[]>(
    user ? ['trades/coins', user.id] : null,
    () => fetchCoinIdsForUser(user!.id),
    { refreshInterval: 60_000 }
  )

const filters: Filters = useMemo(() => {
  const f: Filters = {}
  if (coinFilter !== 'all') f.coinId = coinFilter
  if (sideFilter !== 'all') f.side = sideFilter
  if (startDate) f.startDate = startDate
  if (endDate) f.endDate = endDate
  return f
}, [coinFilter, sideFilter, startDate, endDate])



 const swrKey = user
  ? ['trades/all-recent', user.id, visibleCount, coinFilter, sideFilter, startDate, endDate]
  : null



  const { data: rows, isLoading } = useSWR<Row[]>(
    swrKey,
    () => fetchTransactions(user!.id, visibleCount, filters),
    { refreshInterval: 60_000 }
  )

  const displayed = useMemo(() => (rows ?? []).slice(0, visibleCount), [rows, visibleCount])
  const hasMore = Boolean(rows && rows.length > visibleCount)
  const hasLess = visibleCount > PAGE_SIZE

  // Live updates: revalidate when trades change for this user
  useEffect(() => {
    if (!user?.id) return

    const channel = supabaseBrowser
      .channel(`trades-list-all-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` },
        () => {
          // Revalidate all variants of this list (paging + filters)
          globalMutate((key) => Array.isArray(key) && key[0] === 'trades/all-recent' && key[1] === user.id)
          globalMutate((key) => Array.isArray(key) && key[0] === 'trades/coins' && key[1] === user.id)
        }
      )
      .subscribe()

    return () => {
      supabaseBrowser.removeChannel(channel)
    }
  }, [user?.id])

  async function deleteTrade(tradeId: string, fallbackCoinId: string) {
    if (!user) return
    const ok = confirm('Delete this trade?')
    if (!ok) return

    try {
      setDeletingId(tradeId)

      // Fetch minimal metadata so we can refresh the correct planner caches
      const { data: meta, error: metaErr } = await supabaseBrowser
        .from('trades')
        .select('side,buy_planner_id,sell_planner_id,coingecko_id')
        .eq('id', tradeId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (metaErr) throw metaErr

      const coinId = (meta as any)?.coingecko_id ?? fallbackCoinId
      const buyPlannerId = (meta as any)?.buy_planner_id ?? null
      const sellPlannerId = (meta as any)?.sell_planner_id ?? null

      // Delete (scoped to current user)
      const { error } = await supabaseBrowser
        .from('trades')
        .delete()
        .eq('id', tradeId)
        .eq('user_id', user.id)
      if (error) throw error

      // Refresh the recent trades list
      if (swrKey) await globalMutate(swrKey)

      // Refresh planner/ladders that depend on trades (same keys as the coin page)
      const uid = user.id
      const cid = coinId

      void globalMutate(['/buy-planner/active', uid, cid])
      void globalMutate(['/buy-planner/active-ladder', uid, cid])
      if (buyPlannerId) {
        void globalMutate(['/trades/buys/by-planner', uid, cid, buyPlannerId])
        void globalMutate(['/trades/buys/for-ladder', uid, cid, buyPlannerId])
      }

      void globalMutate(['/sell-active', uid, cid])
      if (sellPlannerId) {
        void globalMutate(['/sell-levels', uid, cid, sellPlannerId])
        void globalMutate(['/sells', uid, cid, sellPlannerId])
      }

      // Broadcast to any listeners
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('buyPlannerUpdated', { detail: { coinId } }))
        window.dispatchEvent(new CustomEvent('sellPlannerUpdated', { detail: { coinId } }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingId(null)
    }
  }

  // === Visual-only grouping: by day ===
  const groups = useMemo(() => {
    const out: Array<{ dayKey: string; items: Row[] }> = []
    const map = new Map<string, Row[]>()

    displayed.forEach((r) => {
      const d = new Date(r.trade_time)
      const key = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })

    for (const [dayKey, items] of map.entries()) out.push({ dayKey, items })
    return out
  }, [displayed])

  return (
<div className="transactions-card rounded-2xl border bg-[rgb(28,29,31)] border-[rgb(28,29,31)] p-4 space-y-4 w-full">
      {/* Header row: title (left) + filters (right, left of Showing) + Showing */}
<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
  <h3 className="text-lg font-bold text-slate-200 shrink-0">Transactions</h3>

  <div className="flex items-center justify-end gap-2 flex-wrap md:flex-nowrap">
    {/* Coin (smaller, grey) */}
    <div className="w-[140px]">
      <Select
        size="sm"
        fullWidth
        value={coinFilter}
        onChange={(e) => setCoinFilter(e.target.value)}
        className="!h-8 !bg-[rgb(42,43,44)] !border-[rgb(55,56,57)] !text-slate-200"
      >
        <option value="all">All coins</option>
        {(coinIds ?? []).map((id) => (
          <option key={id} value={id}>
            {coinLabelFromId(id)}
          </option>
        ))}
      </Select>
    </div>

    {/* Side (smaller, grey) */}
    <div className="w-[96px]">
      <Select
        size="sm"
        fullWidth
        value={sideFilter}
        onChange={(e) => setSideFilter(e.target.value as 'all' | 'buy' | 'sell')}
        className="!h-8 !bg-[rgb(42,43,44)] !border-[rgb(55,56,57)] !text-slate-200"
      >
        <option value="all">All</option>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </Select>
    </div>

    {/* Date dropdown (button says "Date"; opens From→To inside) */}
    <div ref={dateWrapRef} className="relative">
      <button
        type="button"
        onClick={() => setDateOpen((v) => !v)}
        className="h-8 rounded-lg border border-[rgb(55,56,57)] bg-[rgb(42,43,44)] px-2.5 pr-8 text-[11px] text-slate-200 hover:bg-[rgb(46,47,48)]"
      >
        Date
        {(startDate || endDate) && <span className="ml-1 text-slate-400">•</span>}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        >
          <path
            fill="currentColor"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 0 1 .92 1.18l-4.24 3.36a.75.75 0 0 1-.92 0L5.21 8.41a.75.75 0 0 1 .02-1.2z"
          />
        </svg>
      </button>

      {dateOpen && (
        <div className="absolute right-0 mt-2 w-[280px] rounded-xl border border-[rgb(55,56,57)] bg-[rgb(42,43,44)] shadow-lg z-20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-slate-200">Date</div>
            <div className="flex items-center gap-2">
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('')
                    setEndDate('')
                  }}
                  className="text-[11px] text-slate-300 hover:text-slate-200"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setDateOpen(false)}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Done
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">From</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-8 rounded-lg border border-[rgb(55,56,57)] bg-[rgb(32,33,35)] text-slate-200 text-xs px-2 outline-none ring-0 focus:ring-0 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">To</div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-8 rounded-lg border border-[rgb(55,56,57)] bg-[rgb(32,33,35)] text-slate-200 text-xs px-2 outline-none ring-0 focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Reset (only when active) */}
    {(coinFilter !== 'all' || sideFilter !== 'all' || !!startDate || !!endDate) && (
      <button
        type="button"
        onClick={() => {
          setCoinFilter('all')
          setSideFilter('all')
          setStartDate('')
          setEndDate('')
          setDateOpen(false)
        }}
        className="h-8 px-2.5 rounded-lg border border-[rgb(55,56,57)] bg-[rgb(42,43,44)] text-[11px] text-slate-300 hover:bg-[rgb(46,47,48)]"
      >
        Reset
      </button>
    )}

    {/* Showing badge (far right) */}
    <div className="text-xs rounded-md border border-[rgb(55,56,57)] bg-[rgb(42,43,44)] ring-1 ring-slate-700/10 px-2 py-1 text-slate-400 shrink-0">
      {isLoading ? 'Loading…' : `${displayed.length ?? 0} shown`}
    </div>
  </div>
</div>




      {/* Column header — shown once (desktop only) */}
      <div className="hidden md:grid md:grid-cols-12 text-[11px] uppercase tracking-wide text-slate-400">
        <div className="col-span-1">Side</div>
        <div className="col-span-2">Time</div>
        <div className="col-span-2">Coin name</div>
        <div className="col-span-2">Quantity</div>
        <div className="col-span-2">Price (USD)</div>
        <div className="col-span-1">Fee</div>
        <div className="col-span-1 text-right">Total</div>
        <div className="col-span-1 text-right">Delete</div>
      </div>

      {/* Groups: no spacing between day sections */}
      <div className="space-y-0">
        {groups.map(({ dayKey, items }) => (
          <div key={dayKey} className="space-y-0">
            {/* Date row */}
            <div className="w-[calc(100%+2rem)] -ml-4 pl-4 bg-[rgb(32,33,35)] text-slate-300 py-2.5 border-t border-b border-[rgb(51,52,54)]">
              {dayKey}
            </div>

            {/* Day rows */}
            <div className="space-y-0">
              {items.map((r, idx) => {
                const isBuy = String(r.side).toLowerCase().startsWith('b')
                const qty = Number(r.quantity) || 0
                const price = Number(r.price) || 0
                const fee = Number(r.fee) || 0
                const total = qty * price + (isBuy ? fee : -fee)

                const d = new Date(r.trade_time)
                const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const coinLabel = coinLabelFromId(r.coingecko_id)

                return (
                  <div
                    key={r.id}
                    className={`
                      relative -mx-4 px-4 py-4
                      bg-[rgb(28,29,31)] rounded-none
                      ${idx === 0 ? 'border-t-0' : 'border-t border-[rgb(55,56,57)]'}
                    `}
                  >
                    {/* Desktop grid row */}
                    <div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-2 text-sm">
                      <div className="col-span-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${
                            isBuy
                              ? 'bg-[rgba(113,190,90,0.15)] text-[rgb(113,190,90)] ring-[rgb(113,190,90)]/30'
                              : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
                          }`}
                        >
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                      </div>

                      <div className="col-span-2 text-slate-300 tabular-nums">{timeLabel}</div>
                      <div className="col-span-2 text-slate-200">{coinLabel}</div>

                      <div className="col-span-2 text-slate-200 tabular-nums">
                        {qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                      </div>

                      <div className="col-span-2 text-slate-200 tabular-nums">{fmtCurrency(price)}</div>

                      <div className="col-span-1 text-slate-300 tabular-nums">{fee ? fmtCurrency(fee) : '—'}</div>

                      <div
                        className={`col-span-1 text-right tabular-nums ${
                          isBuy ? 'text-[rgb(105,167,78)]' : 'text-[rgb(180,55,53)]'
                        }`}
                      >
                        {isBuy ? '+' : '-'}
                        {fmtCurrency(Math.abs(total))}
                      </div>

                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          title="Delete trade"
                          onClick={() => deleteTrade(r.id, r.coingecko_id)}
                          disabled={deletingId === r.id}
                          className={`rounded-md p-1 ring-1 ring-slate-700/30 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 ${
                            deletingId === r.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile stacked */}
                    <div className="md:hidden text-sm text-slate-200 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                            isBuy
                              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
                          }`}
                        >
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                        <div className="text-slate-300">{timeLabel}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        <div className="text-slate-400 text-xs">Coin</div>
                        <div>{coinLabel}</div>

                        <div className="text-slate-400 text-xs">Qty</div>
                        <div className="tabular-nums">{qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div>

                        <div className="text-slate-400 text-xs">Price</div>
                        <div className="tabular-nums">{fmtCurrency(price)}</div>

                        <div className="text-slate-400 text-xs">Fee</div>
                        <div className="tabular-nums">{fee ? fmtCurrency(fee) : '—'}</div>

                        <div className="text-slate-400 text-xs">Total</div>
                        <div className={`tabular-nums ${isBuy ? 'text-[rgb(105,167,78)]' : 'text-[rgb(180,55,53)]'}`}>
                          {isBuy ? '+' : '-'}
                          {fmtCurrency(Math.abs(total))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {(hasMore || hasLess) && (
        <div className="pt-2 space-y-2">
          {hasLess && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => Math.max(PAGE_SIZE, n - PAGE_SIZE))}
              className="w-full rounded-xl border border-slate-700/30 bg-slate-900/20 ring-1 ring-slate-700/30 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/30"
            >
              Show less
            </button>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="w-full rounded-xl border border-slate-700/30 bg-slate-900/20 ring-1 ring-slate-700/30 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/30"
            >
              Show more
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!displayed || displayed.length === 0) && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/30 ring-1 ring-slate-700/30 px-3 py-2 text-sm text-slate-400">
          No trades yet.
        </div>
      )}
    </div>
  )
}
