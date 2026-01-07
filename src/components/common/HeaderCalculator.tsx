'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calculator, Copy, X } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'

type Mode = 'tokens' | 'usd'

// Match your existing dark surfaces
const SURFACE = '#1f2021' // rgb(31,32,33)
const PANEL = '#151618'
const BORDER = 'rgb(43,44,45)'
const HEADER_BG = 'rgb(19,20,21)'

function parseNumberLoose(raw: string): number | null {
  const s = raw.replace(/[$,]/g, '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function fmtTokens(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n)
}

export default function HeaderCalculator() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('tokens')
  const [text, setText] = useState<string>('')

  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)


  const { total, count } = useMemo(() => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    let t = 0
    let c = 0
    for (const line of lines) {
      const n = parseNumberLoose(line)
      if (n == null) continue
      t += n
      c += 1
    }
    return { total: t, count: c }
  }, [text])

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

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = null
      }
    }

  }, [open])

   async function copyTotal() {
    const out = mode === 'usd' ? fmtCurrency(total) : fmtTokens(total)

    // Always give immediate click feedback (even if clipboard is blocked)
    setCopied(true)
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = null
    }
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false)
      copiedTimerRef.current = null
    }, 900)

    let ok = false

    // 1) Modern clipboard API (often requires HTTPS / secure context)
    try {
      if (navigator.clipboard && (window as any).isSecureContext) {
        await navigator.clipboard.writeText(out)
        ok = true
      }
    } catch {
      ok = false
    }

    // 2) Fallback copy (works in many cases where clipboard API is blocked)
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

    // If copy failed, keep feedback but make it obvious what happened
    if (!ok) {
      // brief "Copy blocked" message by reusing the existing label state
      // (we’ll show it by temporarily flipping copied=false and changing the label in the button block below)
      setCopied(false)
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = null
      }
      copiedTimerRef.current = setTimeout(() => {
        // return to normal label after a moment
        setCopied(false)
        copiedTimerRef.current = null
      }, 1100)
    }
  }


  function clearAll() {
    setText('')
    setCopied(false)
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = null
    }
  }


  return (
    <div className="relative" ref={wrapRef}>
      {/* Header icon button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Calculator"
        className="inline-flex h-9 w-9 items-center justify-center hover:text-slate-50 transition-colors"
        title="Calculator"
      >
        <Calculator className="h-4 w-4 text-slate-200" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Header calculator"
          className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl shadow-xl shadow-black/60 z-50"
          style={{ backgroundColor: PANEL, border: `1px solid ${BORDER}` }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: BORDER, backgroundColor: HEADER_BG }}
          >
            <div className="text-sm font-medium text-slate-200">Calculator</div>
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
              <div
                className="flex w-full rounded-full p-1 border"
                style={{ backgroundColor: SURFACE, borderColor: BORDER }}
              >
                <button
                  type="button"
                  onClick={() => setMode('tokens')}
                  className={[
                    'flex-1 rounded-full px-3 py-1.5 text-xs transition',
                    mode === 'tokens'
                      ? 'text-slate-100'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')}
                  style={mode === 'tokens' ? { backgroundColor: HEADER_BG } : undefined}
                >
                  Tokens
                </button>
                <button
                  type="button"
                  onClick={() => setMode('usd')}
                  className={[
                    'flex-1 rounded-full px-3 py-1.5 text-xs transition',
                    mode === 'usd'
                      ? 'text-slate-100'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')}
                  style={mode === 'usd' ? { backgroundColor: HEADER_BG } : undefined}
                >
                  Price ($)
                </button>
              </div>

              <button
                type="button"
                onClick={clearAll}
                className="rounded-full border px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900/40"
                style={{ borderColor: BORDER, backgroundColor: SURFACE }}
                title="Clear"
              >
                Clear
              </button>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-1">
                Paste one value per line (planner rows).
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={mode === 'usd' ? '100\n250\n$1,000' : '0.05\n0.10\n0.25'}
                className="w-full rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: SURFACE,
                  border: `1px solid ${BORDER}`,
                  boxShadow: 'none',
                }}
              />
            </div>

            <div
              className="rounded-2xl p-3 border"
              style={{ backgroundColor: SURFACE, borderColor: BORDER }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">
                    Total {mode === 'usd' ? '($)' : '(tokens)'}{' '}
                    {count ? `(${count} line${count === 1 ? '' : 's'})` : ''}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-100">
                    {mode === 'usd' ? fmtCurrency(total) : fmtTokens(total)}
                  </div>
                </div>

                          <button
                  type="button"
                  onClick={copyTotal}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/40"
                  style={{
                    borderColor: BORDER,
                    backgroundColor: copied ? SURFACE : HEADER_BG,
                  }}
                  title="Copy total"
                >
                  <Copy className="h-4 w-4 text-slate-300" />
                  {copied ? 'Copied' : ((window as any).isSecureContext ? 'Copy' : 'Copy (may be blocked)')}
                </button>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
