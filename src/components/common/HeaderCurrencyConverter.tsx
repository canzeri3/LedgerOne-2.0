'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, Coins, Copy, X } from 'lucide-react'

type CurrencyCode = 'CAD' | 'USD' | 'EUR' | 'CHF' | 'MXN' | 'JPY'

type FxResponse = {
  ok?: boolean
  from?: string
  to?: string
  rate?: number
  date?: string | null
}

const SURFACE = '#1f2021'
const PANEL = '#151618'
const BORDER = 'rgb(43,44,45)'
const HEADER_BG = 'rgb(19,20,21)'

const CURRENCIES: Array<{ code: CurrencyCode; label: string }> = [
  { code: 'CAD', label: 'CAD' },
  { code: 'USD', label: 'USD' },
  { code: 'EUR', label: 'EUR' },
  { code: 'CHF', label: 'CHF' },
  { code: 'MXN', label: 'MXN' },
  { code: 'JPY', label: 'JPY' },
]

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function formatMoney(amount: number, currency: CurrencyCode) {
  if (!Number.isFinite(amount)) return '—'

  const fractionDigits = currency === 'JPY' ? 0 : 2

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

export default function HeaderCurrencyConverter() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('1')
  const [from, setFrom] = useState<CurrencyCode>('USD')
  const [to, setTo] = useState<CurrencyCode>('CAD')
  const [rate, setRate] = useState<number | null>(null)
  const [rateDate, setRateDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const parsedAmount = useMemo(() => parseAmount(amount), [amount])
  const converted = useMemo(() => {
    if (parsedAmount == null || rate == null) return null
    return parsedAmount * rate
  }, [parsedAmount, rate])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (wrapRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
        copyTimerRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadRate() {
      setLoading(true)
      setError('')

      try {
        const res = await fetch(`/api/fx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
          method: 'GET',
          cache: 'no-store',
        })

        const data = (await res.json()) as FxResponse

        if (!res.ok || !data?.ok || !Number.isFinite(Number(data?.rate))) {
          throw new Error('Unable to load FX rate.')
        }

        if (cancelled) return

        setRate(Number(data.rate))
        setRateDate(typeof data.date === 'string' ? data.date : null)
      } catch (err: any) {
        if (cancelled) return
        setRate(null)
        setRateDate(null)
        setError(String(err?.message || 'Unable to load FX rate.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRate()

    return () => {
      cancelled = true
    }
  }, [open, from, to])

  function clearAll() {
    setAmount('')
    setCopied(false)
  }

  function swapCurrencies() {
    setFrom(to)
    setTo(from)
  }

  async function copyConverted() {
    if (converted == null) return

    const out = formatMoney(converted, to)
    let ok = false

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(out)
        ok = true
      }
    } catch {
      ok = false
    }

    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = out
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.top = '0'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        ta.setSelectionRange(0, ta.value.length)
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }

    setCopied(ok)
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
    copyTimerRef.current = setTimeout(() => {
      setCopied(false)
      copyTimerRef.current = null
    }, 900)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Currency converter"
        className="inline-flex h-9 w-9 items-center justify-center hover:text-slate-50 transition-colors"
        title="Currency converter"
      >
        <Coins className="h-4 w-4 text-slate-200" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Header currency converter"
          className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl shadow-xl shadow-black/60 z-50"
          style={{ backgroundColor: PANEL, border: `1px solid ${BORDER}` }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: BORDER, backgroundColor: HEADER_BG }}
          >
            <div className="text-sm font-medium text-slate-200">Currency converter</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-900/40"
              style={{ borderColor: BORDER, backgroundColor: HEADER_BG }}
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4 text-slate-300" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-[11px] text-slate-400 mb-1">Amount</div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="1"
                  className="w-full rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    boxShadow: 'none',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={clearAll}
                className="mt-5 rounded-full border px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900/40"
                style={{ borderColor: BORDER, backgroundColor: SURFACE }}
                title="Clear"
              >
                Clear
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <div className="text-[11px] text-slate-400 mb-1">From</div>
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value as CurrencyCode)}
                  className="w-full appearance-none rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    boxShadow: 'none',
                  }}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={swapCurrencies}
                aria-label="Swap currencies"
                title="Swap currencies"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border hover:bg-slate-900/40"
                style={{ borderColor: BORDER, backgroundColor: SURFACE }}
              >
                <ArrowRightLeft className="h-4 w-4 text-slate-300" />
              </button>

              <div>
                <div className="text-[11px] text-slate-400 mb-1">To</div>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value as CurrencyCode)}
                  className="w-full appearance-none rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    boxShadow: 'none',
                  }}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="rounded-2xl p-3 border"
              style={{ backgroundColor: SURFACE, borderColor: BORDER }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">
                    Converted total
                    {rateDate ? ` · ${rateDate}` : ''}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-100">
                    {parsedAmount == null || converted == null ? '—' : formatMoney(converted, to)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {loading
                      ? 'Loading latest rate…'
                      : error
                        ? error
                        : rate == null
                          ? 'Rate unavailable.'
                          : `1 ${from} = ${formatMoney(rate, to)}`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyConverted}
                  disabled={converted == null}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: BORDER,
                    backgroundColor: copied ? SURFACE : HEADER_BG,
                  }}
                  title="Copy converted total"
                >
                  <Copy className="h-4 w-4 text-slate-300" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}