'use client'

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FileUp,
  LineChart,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import CoinLogo from '@/components/common/CoinLogo'
import { useTradeSave } from '@/lib/useTradeSave'
import { withTradeDeadline, type TradeAttempt } from '@/lib/tradeSave'
import TradeSaveFeedback from '@/components/common/TradeSaveFeedback'
import DraftNotice from '@/components/common/DraftNotice'
import { useFormDraft } from '@/lib/useFormDraft'
import { isPurchaseDraft, type PurchaseDraft } from '@/lib/formDraft'
import { useDisplayCurrency } from '@/lib/displayCurrency'
import { displayCurrencySymbol, displayToUsd } from '@/lib/format'

type Coin = {
  coingecko_id: string
  symbol: string
  name: string
  market_cap_rank?: number | null
}

export type FirstTrade = {
  coingecko_id: string
  side: 'buy'
  price: number
  quantity: number
  fee: number
  trade_time: string
}

type Props = {
  userId: string
  onTradeAdded: (trade: FirstTrade) => void | Promise<void>
  startAtDetails?: boolean
  onExit?: () => void
}

type Stage = 'intro' | 'details' | 'review'

const inputClass = [
  'h-12 w-full rounded-lg border border-[rgb(58,59,63)] bg-[rgb(22,23,25)] px-3.5',
  'text-base text-slate-100 placeholder:text-slate-600 outline-none transition-colors',
  'focus:border-[rgb(137,128,213)] focus:ring-2 focus:ring-[rgba(137,128,213,0.16)]',
].join(' ')

function nowForDateTimeInput() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

function parsePositiveNumber(value: string) {
  const n = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseOptionalFee(value: string) {
  if (!value.trim()) return 0
  const n = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(n) && n >= 0 ? n : null
}

function friendlyDate(localValue: string) {
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function FieldLabel({
  children,
  htmlFor,
  optional = false,
}: {
  children: ReactNode
  htmlFor: string
  optional?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-center justify-between text-[12px] font-semibold text-slate-300">
      <span>{children}</span>
      {optional ? <span className="font-normal text-slate-500">Optional</span> : null}
    </label>
  )
}

function PortfolioPreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[rgb(41,42,45)] bg-[rgb(24,25,27)] p-5 shadow-[0_20px_60px_-35px_rgba(0,0,0,0.9)] sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[rgba(137,128,213,0.12)] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Your dashboard</div>
            <div className="mt-1.5 font-display text-[19px] font-semibold text-slate-100">Performance at a glance</div>
          </div>
          <span className="rounded-full border border-[rgba(137,128,213,0.32)] bg-[rgba(137,128,213,0.08)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(137,128,213)]">
            Preview
          </span>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          {['Portfolio value', 'Total P&L'].map((label) => (
            <div key={label} className="rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
              <div className="mt-2 h-5 w-20 rounded bg-slate-700/45" aria-hidden="true" />
            </div>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-400">Performance history</span>
            <LineChart className="h-4 w-4 text-[rgb(137,128,213)]" aria-hidden="true" />
          </div>
          <svg className="mt-4 h-[88px] w-full" viewBox="0 0 360 88" fill="none" aria-hidden="true" preserveAspectRatio="none">
            <defs>
              <linearGradient id="activation-line" x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6E689F" />
                <stop offset="1" stopColor="#A49BE9" />
              </linearGradient>
              <linearGradient id="activation-fill" x1="180" y1="0" x2="180" y2="88" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8980D5" stopOpacity="0.22" />
                <stop offset="1" stopColor="#8980D5" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 74 C36 70 45 61 74 65 C104 68 119 42 146 50 C172 58 187 29 215 38 C249 48 257 17 291 25 C322 32 332 12 360 8 V88 H0 Z" fill="url(#activation-fill)" />
            <path d="M0 74 C36 70 45 61 74 65 C104 68 119 42 146 50 C172 58 187 29 215 38 C249 48 257 17 291 25 C322 32 332 12 360 8" stroke="url(#activation-line)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="mt-2 text-center text-[11px] text-slate-500">Your numbers appear after the first purchase</p>
        </div>
      </div>
    </div>
  )
}

export default function DashboardActivation({
  userId,
  onTradeAdded,
  startAtDetails = false,
  onExit,
}: Props) {
  const tradeSave = useTradeSave(userId)
  const saveActionRef = useRef(false)
  const handledSaveRef = useRef<string | null>(null)
  const finishingSaveRef = useRef(false)
  const currentUserRef = useRef(userId)
  currentUserRef.current = userId
  const { code: displayCode } = useDisplayCurrency()
  const currencySymbol = displayCurrencySymbol()
  const [stage, setStage] = useState<Stage>(startAtDetails ? 'details' : 'intro')
  const draftDefaults = useMemo<PurchaseDraft>(() => ({
    selectedCoin: null, coinQuery: '', quantity: '', price: '', tradeTime: nowForDateTimeInput(), fee: '', moreOpen: false,
  }), [userId, displayCode])
  const draft = useFormDraft({
    scope: { userId, form: 'first-purchase', asset: 'portfolio', currency: displayCode },
    defaults: draftDefaults, validate: isPurchaseDraft,
  })
  const { coinQuery, selectedCoin, quantity, price, tradeTime, fee, moreOpen } = draft.values
  const setCoinQuery = (value: string) => draft.setField('coinQuery', value)
  const setSelectedCoin = (value: Coin | null) => draft.setField('selectedCoin', value)
  const setQuantity = (value: string) => draft.setField('quantity', value)
  const setPrice = (value: string) => draft.setField('price', value)
  const setTradeTime = (value: string) => draft.setField('tradeTime', value)
  const setFee = (value: string) => draft.setField('fee', value)
  const setMoreOpen = (value: boolean | ((previous: boolean) => boolean)) => draft.setField('moreOpen', value)
  const deferredCoinQuery = useDeferredValue(coinQuery)
  const [coinMenuOpen, setCoinMenuOpen] = useState(false)
  const [activeCoinIndex, setActiveCoinIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const coinFieldRef = useRef<HTMLDivElement | null>(null)
  const coinListId = useId()
  const fieldId = useId()
  const coinInputId = `${fieldId}-coin`
  const quantityInputId = `${fieldId}-quantity`
  const priceInputId = `${fieldId}-price`
  const timeInputId = `${fieldId}-time`
  const feeInputId = `${fieldId}-fee`
  useEffect(() => {
    if (draft.restored) setStage('details')
  }, [draft.restored])
  const discardDraft = () => {
    draft.reset()
    setCoinMenuOpen(false)
    setError(null)
    setStage('details')
  }

  const { data: coins, error: coinsError, isLoading: coinsLoading, mutate: retryCoins } = useSWR<Coin[]>(
    stage === 'details' ? '/api/coins?limit=500&order=marketcap' : null,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error('Coins could not be loaded')
      const data = await response.json()
      if (!Array.isArray(data)) return []
      return data
        .filter((coin) => coin?.coingecko_id && coin?.symbol && coin?.name)
        .map((coin) => ({
          coingecko_id: String(coin.coingecko_id),
          symbol: String(coin.symbol),
          name: String(coin.name),
          market_cap_rank: Number.isFinite(Number(coin.market_cap_rank))
            ? Number(coin.market_cap_rank)
            : null,
        }))
    },
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 60_000 }
  )

  const filteredCoins = useMemo(() => {
    const query = deferredCoinQuery.trim().toLowerCase()
    const list = coins ?? []
    if (!query) return list.slice(0, 8)
    return list
      .filter((coin) =>
        [coin.name, coin.symbol, coin.coingecko_id]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query))
      )
      .slice(0, 8)
  }, [coins, deferredCoinQuery])

  useEffect(() => {
    setActiveCoinIndex(0)
  }, [deferredCoinQuery])

  useEffect(() => {
    if (!coinMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!coinFieldRef.current?.contains(event.target as Node)) setCoinMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [coinMenuOpen])

  const quantityNumber = parsePositiveNumber(quantity)
  const priceNumber = parsePositiveNumber(price)
  const feeNumber = parseOptionalFee(fee)
  const totalInDisplayCurrency =
    quantityNumber != null && priceNumber != null
      ? quantityNumber * priceNumber + (feeNumber ?? 0)
      : null

  const selectCoin = (coin: Coin) => {
    setSelectedCoin(coin)
    setCoinQuery(`${coin.symbol.toUpperCase()} — ${coin.name}`)
    setCoinMenuOpen(false)
    setError(null)
  }

  const onCoinKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCoinMenuOpen(true)
      setActiveCoinIndex((index) => Math.min(index + 1, Math.max(0, filteredCoins.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveCoinIndex((index) => Math.max(0, index - 1))
      return
    }
    if (event.key === 'Enter' && coinMenuOpen && filteredCoins[activeCoinIndex]) {
      event.preventDefault()
      selectCoin(filteredCoins[activeCoinIndex])
      return
    }
    if (event.key === 'Escape') setCoinMenuOpen(false)
  }

  const validateDetails = () => {
    if (!selectedCoin) return 'Choose the crypto asset you purchased.'
    if (quantityNumber == null) return 'Enter a quantity greater than zero.'
    if (priceNumber == null) return `Enter a valid purchase price in ${displayCode}.`
    if (feeNumber == null) return `Enter a valid fee in ${displayCode}, or leave it blank.`
    const parsedTime = new Date(tradeTime)
    if (!tradeTime || Number.isNaN(parsedTime.getTime())) return 'Choose a valid purchase date and time.'
    if (parsedTime.getTime() > Date.now() + 5 * 60_000) return 'The purchase time cannot be in the future.'
    return null
  }

  const reviewPurchase = (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateDetails()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setCoinMenuOpen(false)
    setStage('review')
  }

  const savePurchase = async () => {
    if (saveActionRef.current || tradeSave.attempt) return
    const validationError = validateDetails()
    if (validationError || !selectedCoin || quantityNumber == null || priceNumber == null || feeNumber == null) {
      setError(validationError ?? 'Review the purchase details and try again.')
      setStage('details')
      return
    }

    const tradeTimeIso = new Date(tradeTime).toISOString()
    const trade: FirstTrade = {
      coingecko_id: selectedCoin.coingecko_id,
      side: 'buy',
      price: displayToUsd(priceNumber),
      quantity: quantityNumber,
      fee: displayToUsd(feeNumber),
      trade_time: tradeTimeIso,
    }

    saveActionRef.current = true
    setSaving(true)
    setError(null)
    try {
      const saved = await tradeSave.save({
        user_id: userId,
        ...trade,
        buy_planner_id: null,
        sell_planner_id: null,
      })
      if (saved) await finishSavedPurchase(saved)
    } catch (caught) {
      const message =
        caught && typeof caught === 'object' && 'message' in caught
          ? String(caught.message)
          : 'The purchase could not be saved. Please try again.'
      setError(message)
    } finally {
      saveActionRef.current = false
      setSaving(false)
    }
  }

  const finishSavedPurchase = async (saved: TradeAttempt) => {
    if (currentUserRef.current !== saved.user_id) return
    if (handledSaveRef.current === saved.id) {
      if (!finishingSaveRef.current) tradeSave.acknowledge(saved.id)
      return
    }
    handledSaveRef.current = saved.id
    finishingSaveRef.current = true
    setSaving(true)
    // A confirmed save must not leave a resubmittable review behind, even if
    // refreshing the Dashboard fails or navigation is delayed.
    draft.reset()
    setStage('intro')
    try {
      if (saved.side !== 'buy') {
        tradeSave.acknowledge(saved.id)
        window.location.reload()
        return
      }
      await withTradeDeadline(() => Promise.resolve(onTradeAdded({
        coingecko_id: saved.coingecko_id,
        side: 'buy',
        price: saved.price,
        quantity: saved.quantity,
        fee: saved.fee,
        trade_time: saved.trade_time,
      })))
      tradeSave.acknowledge(saved.id)
    } catch {
      // The insert already succeeded. Reloading fetches the saved ledger rather
      // than leaving the form enabled and risking a duplicate submission.
      tradeSave.acknowledge(saved.id)
      window.location.reload()
    } finally {
      finishingSaveRef.current = false
      setSaving(false)
    }
  }

  if (tradeSave.attempt && stage !== 'review') {
    return (
      <section data-dashboard-activation className="mx-auto w-full max-w-[760px] rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)] px-5 py-6 sm:px-7">
        <h2 className="font-display text-xl font-semibold text-slate-100">Finish your previous trade</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Check its save status before recording another purchase.</p>
        <TradeSaveFeedback save={{ ...tradeSave, busy: tradeSave.busy || saving }} onSaved={finishSavedPurchase} />
      </section>
    )
  }

  if (stage === 'intro') {
    return (
      <section
        data-dashboard-activation
        aria-labelledby="dashboard-activation-title"
        className="mx-auto w-full max-w-[1120px] overflow-hidden rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]"
      >
        <div className="grid min-h-[560px] items-center gap-10 px-6 py-10 md:grid-cols-[minmax(0,0.94fr)_minmax(360px,1.06fr)] md:px-10 lg:gap-16 lg:px-14">
          <div className="max-w-[520px]">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(137,128,213,0.34)] bg-[rgba(137,128,213,0.1)] text-[rgb(137,128,213)]">
              <WalletCards className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-6 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[rgb(137,128,213)]">
              Set up your portfolio
            </p>
            <h2 id="dashboard-activation-title" className="mt-3 max-w-[480px] font-display text-[32px] font-bold leading-[1.12] tracking-tight text-slate-100 sm:text-[38px]">
              See your real portfolio performance
            </h2>
            <p className="mt-4 max-w-[470px] text-[15px] leading-6 text-slate-400">
              Add your transaction history to calculate portfolio value, invested capital, and profit or loss.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setStage('details')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[rgb(103,95,164)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.5)]"
              >
                Add your first purchase
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <Link
                href="/csv#trade-import"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-5 text-[14px] font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-[rgb(38,39,42)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.35)]"
              >
                <FileUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Import transaction history
              </Link>
            </div>

            <div className="mt-6 flex items-start gap-2.5 text-[12px] leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              <span>LedgerOne records your activity. It never connects to or moves your funds.</span>
            </div>
          </div>

          <PortfolioPreview />
        </div>
      </section>
    )
  }

  if (stage === 'review') {
    return (
      <section
        data-dashboard-activation
        aria-labelledby="purchase-review-title"
        className="mx-auto w-full max-w-[760px] rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]"
      >
        <div className="border-b border-[rgb(41,42,45)] px-5 py-5 sm:px-7">
          <button
            type="button"
            onClick={() => { setError(null); setStage('details') }}
            disabled={saving || !!tradeSave.attempt}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Edit details
          </button>
          <div className="mt-5 flex items-start justify-between gap-5">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[rgb(137,128,213)]">Step 2 of 2</p>
              <h2 id="purchase-review-title" className="mt-2 font-display text-[25px] font-bold tracking-tight text-slate-100 sm:text-[29px]">Review your purchase</h2>
              <p className="mt-2 text-[13px] leading-5 text-slate-400">Confirm these details before adding them to your ledger.</p>
            </div>
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(137,128,213,0.28)] bg-[rgba(137,128,213,0.09)] text-[rgb(137,128,213)] sm:flex">
              <Check className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="rounded-xl border border-[rgb(41,42,45)] bg-[rgb(24,25,27)] p-5">
            <div className="flex items-center gap-3 border-b border-[rgb(41,42,45)] pb-4">
              {selectedCoin ? (
                <CoinLogo symbol={selectedCoin.symbol} name={selectedCoin.name} className="h-10 w-10" />
              ) : null}
              <div>
                <div className="font-display text-[17px] font-semibold text-slate-100">{selectedCoin?.name}</div>
                <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{selectedCoin?.symbol}</div>
              </div>
            </div>
            <dl className="mt-1 divide-y divide-[rgb(41,42,45)]">
              <div className="flex items-center justify-between gap-5 py-3.5">
                <dt className="text-[13px] text-slate-500">Quantity</dt>
                <dd className="text-right text-[13px] font-medium text-slate-200">{quantityNumber?.toLocaleString(undefined, { maximumFractionDigits: 12 })} {selectedCoin?.symbol.toUpperCase()}</dd>
              </div>
              <div className="flex items-center justify-between gap-5 py-3.5">
                <dt className="text-[13px] text-slate-500">Price paid</dt>
                <dd className="text-right text-[13px] font-medium text-slate-200">{currencySymbol}{priceNumber?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {displayCode}</dd>
              </div>
              <div className="flex items-center justify-between gap-5 py-3.5">
                <dt className="text-[13px] text-slate-500">Purchase date</dt>
                <dd className="text-right text-[13px] font-medium text-slate-200">{friendlyDate(tradeTime)}</dd>
              </div>
              {feeNumber && feeNumber > 0 ? (
                <div className="flex items-center justify-between gap-5 py-3.5">
                  <dt className="text-[13px] text-slate-500">Fee</dt>
                  <dd className="text-right text-[13px] font-medium text-slate-200">{currencySymbol}{feeNumber.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {displayCode}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-5 pt-4">
                <dt className="text-[13px] font-semibold text-slate-300">Total invested</dt>
                <dd className="text-right font-display text-[18px] font-semibold text-slate-100">{currencySymbol}{totalInDisplayCurrency?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCode}</dd>
              </div>
            </dl>
          </div>

          <TradeSaveFeedback save={{ ...tradeSave, busy: tradeSave.busy || saving }} onSaved={finishSavedPurchase} />
          <DraftNotice draft={draft} onDiscard={discardDraft} disabled={saving || !!tradeSave.attempt} />
          {error ? (
            <div role="alert" className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-5 text-rose-300">
              {error}
            </div>
          ) : null}

          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            This purchase updates your portfolio ledger only. Planner settings remain unchanged.
          </p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => { setError(null); setStage('details') }}
              disabled={saving || !!tradeSave.attempt}
              className="min-h-11 rounded-lg border border-[rgb(58,59,63)] px-4 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void savePurchase()}
              disabled={saving || !!tradeSave.attempt}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[rgb(103,95,164)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.5)] disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                  Building portfolio…
                </>
              ) : (
                <>
                  Add to portfolio
                  <Check className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      data-dashboard-activation
      aria-labelledby="first-purchase-title"
      className="mx-auto w-full max-w-[860px] rounded-md border border-[rgb(41,42,45)] bg-[rgb(28,29,31)]"
    >
      <div className="border-b border-[rgb(41,42,45)] px-5 py-5 sm:px-7">
        <button
          type="button"
          onClick={() => {
            setError(null)
            if (onExit) onExit()
            else setStage('intro')
          }}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <div className="mt-5 flex items-start justify-between gap-5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[rgb(137,128,213)]">Step 1 of 2</p>
            <h2 id="first-purchase-title" className="mt-2 font-display text-[25px] font-bold tracking-tight text-slate-100 sm:text-[29px]">Add your first purchase</h2>
            <p className="mt-2 text-[13px] leading-5 text-slate-400">Enter the actual details from your exchange so your portfolio calculations start accurately.</p>
          </div>
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(137,128,213,0.28)] bg-[rgba(137,128,213,0.09)] text-[rgb(137,128,213)] sm:flex">
            <WalletCards className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      <form onSubmit={reviewPurchase} className="px-5 py-6 sm:px-7 sm:py-7">
        <DraftNotice draft={draft} onDiscard={discardDraft} disabled={saving || !!tradeSave.attempt} />
        <fieldset disabled={!draft.ready || saving || !!tradeSave.attempt} className="m-0 min-w-0 border-0 p-0">
        <div className="grid gap-5 sm:grid-cols-2">
          <div ref={coinFieldRef} className="relative sm:col-span-2">
            <FieldLabel htmlFor={coinInputId}>Crypto asset</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                id={coinInputId}
                type="text"
                role="combobox"
                aria-expanded={coinMenuOpen}
                aria-controls={coinListId}
                aria-autocomplete="list"
                aria-activedescendant={coinMenuOpen && filteredCoins[activeCoinIndex] ? `${coinListId}-${filteredCoins[activeCoinIndex].coingecko_id}` : undefined}
                autoComplete="off"
                value={coinQuery}
                onFocus={() => setCoinMenuOpen(true)}
                onChange={(event) => {
                  setCoinQuery(event.target.value)
                  setSelectedCoin(null)
                  setCoinMenuOpen(true)
                  setError(null)
                }}
                onKeyDown={onCoinKeyDown}
                placeholder="Search Bitcoin, Ethereum, Solana…"
                className={`${inputClass} pl-10 pr-10`}
              />
              <ChevronDown className={`pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform ${coinMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </div>

            {coinMenuOpen ? (
              <div id={coinListId} role="listbox" className="absolute z-30 mt-2 max-h-[286px] w-full overflow-y-auto rounded-xl border border-[rgb(58,59,63)] bg-[rgb(24,25,27)] p-1.5 shadow-2xl shadow-black/40">
                {coinsLoading ? (
                  <div role="status" className="px-3 py-5 text-center text-[12px] text-slate-500">Loading assets…</div>
                ) : coinsError ? (
                  <div role="alert" className="px-3 py-4 text-center">
                    <p className="text-[12px] text-slate-400">Assets couldn&apos;t be loaded.</p>
                    <button type="button" onClick={() => void retryCoins()} className="mt-2 text-[12px] font-medium text-[rgb(164,155,233)]">Try again</button>
                  </div>
                ) : filteredCoins.length === 0 ? (
                  <div className="px-3 py-5 text-center text-[12px] text-slate-500">No assets match that search.</div>
                ) : (
                  filteredCoins.map((coin, index) => (
                    <button
                      id={`${coinListId}-${coin.coingecko_id}`}
                      key={coin.coingecko_id}
                      type="button"
                      role="option"
                      aria-selected={selectedCoin?.coingecko_id === coin.coingecko_id}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveCoinIndex(index)}
                      onClick={() => selectCoin(coin)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${activeCoinIndex === index ? 'bg-[rgb(38,39,42)]' : 'hover:bg-[rgb(38,39,42)]'}`}
                    >
                      <CoinLogo symbol={coin.symbol} name={coin.name} className="h-8 w-8 shrink-0" loading="lazy" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-slate-200">{coin.name}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{coin.symbol}</span>
                      </span>
                      {coin.market_cap_rank ? <span className="text-[11px] text-slate-600">#{coin.market_cap_rank}</span> : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor={quantityInputId}>Quantity purchased</FieldLabel>
            <div className="relative">
              <input
                id={quantityInputId}
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => { setQuantity(event.target.value); setError(null) }}
                placeholder="0.00"
                className={`${inputClass} pr-20`}
                aria-describedby="quantity-unit"
              />
              <span id="quantity-unit" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {selectedCoin?.symbol || 'Tokens'}
              </span>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor={priceInputId}>Price paid per token</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-500">{currencySymbol}</span>
              <input
                id={priceInputId}
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(event) => { setPrice(event.target.value); setError(null) }}
                placeholder="0.00"
                className={`${inputClass} pl-8 pr-16`}
                aria-describedby="price-currency"
              />
              <span id="price-currency" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-[0.05em] text-slate-500">{displayCode}</span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <FieldLabel htmlFor={timeInputId}>Purchase date and time</FieldLabel>
            <input
              id={timeInputId}
              type="datetime-local"
              value={tradeTime}
              max={nowForDateTimeInput()}
              onChange={(event) => { setTradeTime(event.target.value); setError(null) }}
              className={inputClass}
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>

        <div className="mt-5 border-t border-[rgb(41,42,45)] pt-4">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            More details
          </button>

          {moreOpen ? (
            <div className="mt-4 max-w-[380px]">
              <FieldLabel htmlFor={feeInputId} optional>Transaction fee</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-500">{currencySymbol}</span>
                <input
                  id={feeInputId}
                  type="text"
                  inputMode="decimal"
                  value={fee}
                  onChange={(event) => { setFee(event.target.value); setError(null) }}
                  placeholder="0.00"
                  className={`${inputClass} pl-8 pr-16`}
                  aria-describedby="fee-currency"
                />
                <span id="fee-currency" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-[0.05em] text-slate-500">{displayCode}</span>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div role="alert" className="mt-5 rounded-lg border border-rose-500/25 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-5 text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[rgb(41,42,45)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/csv#trade-import" className="inline-flex min-h-11 items-center justify-center gap-2 text-[12px] font-medium text-slate-400 hover:text-slate-200 sm:justify-start">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Import several transactions instead
          </Link>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[rgb(103,95,164)] focus:outline-none focus:ring-2 focus:ring-[rgba(137,128,213,0.5)]"
          >
            Review purchase
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        </fieldset>
      </form>
    </section>
  )
}
