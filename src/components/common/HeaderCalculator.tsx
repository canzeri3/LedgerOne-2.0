'use client'

import { useEffect, useRef, useState } from 'react'
import { Calculator, Delete } from 'lucide-react'

/* ── design-system tokens (match the app pages) ───────────── */
/* Resolved through shell theme vars (light theme overrides them in
   theme-light.css); fallbacks are the original dark values. */
const PANEL = 'var(--sh-panel, rgb(28,29,31))'
const DISPLAY_BG = 'var(--sh-panel-inset, rgb(19,20,21))'
const KEY_BG = 'var(--sh-panel-key, rgb(32,33,35))'
const BORDER = 'var(--sh-panel-border, rgb(41,42,45))'
const ACCENT = 'var(--sh-accent, rgb(137,128,213))'
const PANEL_FG = 'var(--sh-panel-fg, rgb(226,232,240))'
const PANEL_FG_MUTED = 'var(--sh-panel-fg-muted, rgb(148,163,184))'
const FONT_UI = 'var(--font-plex), system-ui, sans-serif'

type Op = '+' | '−' | '×' | '÷'

/** Trim float noise and keep the display readable. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return 'Error'
  const r = Math.round((n + Number.EPSILON) * 1e10) / 1e10
  return String(r)
}

function compute(a: number, b: number, op: Op): number {
  switch (op) {
    case '+': return a + b
    case '−': return a - b
    case '×': return a * b
    case '÷': return b === 0 ? NaN : a / b
  }
}

/* ── keypad key (hoisted: keeps a stable component type so the
   keypad doesn't remount on every keystroke) ──────────────── */
const keyBase: React.CSSProperties = {
  height: 52,
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  fontFamily: FONT_UI,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 18,
  cursor: 'pointer',
  transition: 'background 120ms, color 120ms',
}

function Key({
  label,
  onClick,
  variant = 'num',
  span,
  ariaLabel,
}: {
  label: React.ReactNode
  onClick: () => void
  variant?: 'num' | 'muted' | 'op' | 'eq'
  span?: number
  ariaLabel?: string
}) {
  const color =
    variant === 'muted' ? PANEL_FG_MUTED
    : variant === 'op' ? ACCENT
    : variant === 'eq' ? '#fff'
    : PANEL_FG

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="lo-calc-key"
      style={{
        ...keyBase,
        color,
        gridColumn: span ? `span ${span} / span ${span}` : undefined,
        background: variant === 'eq' ? ACCENT : KEY_BG,
        borderColor: variant === 'eq' ? 'transparent' : BORDER,
        fontWeight: variant === 'eq' || variant === 'op' ? 600 : 500,
      }}
    >
      {label}
    </button>
  )
}

export default function HeaderCalculator() {
  const [open, setOpen] = useState(false)

  // calculator state
  const [display, setDisplay] = useState('0')
  const [prev, setPrev] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [overwrite, setOverwrite] = useState(true)
  const [expr, setExpr] = useState('')

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

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
    }
  }, [open])

  /* ── actions ───────────────────────────────────────────── */
  function inputDigit(d: string) {
    if (overwrite) {
      setDisplay(d)
      setOverwrite(false)
      return
    }
    setDisplay((cur) => (cur === '0' ? d : cur + d))
  }

  function inputDot() {
    if (overwrite) {
      setDisplay('0.')
      setOverwrite(false)
      return
    }
    setDisplay((cur) => (cur.includes('.') ? cur : cur + '.'))
  }

  function clearAll() {
    setDisplay('0')
    setPrev(null)
    setOp(null)
    setOverwrite(true)
    setExpr('')
  }

  function backspace() {
    if (overwrite) return
    setDisplay((cur) => {
      const next = cur.slice(0, -1)
      return next === '' || next === '-' ? '0' : next
    })
  }

  function percent() {
    const cur = parseFloat(display)
    if (!Number.isFinite(cur)) return
    setDisplay(fmtNum(cur / 100))
    setOverwrite(true)
  }

  function chooseOp(next: Op) {
    const cur = parseFloat(display)
    if (!Number.isFinite(cur)) return

    if (prev !== null && op && !overwrite) {
      const r = compute(prev, cur, op)
      setDisplay(fmtNum(r))
      setPrev(r)
      setExpr(`${fmtNum(r)}${next}`)
    } else {
      setPrev(cur)
      setExpr(`${fmtNum(cur)}${next}`)
    }
    setOp(next)
    setOverwrite(true)
  }

  function equals() {
    if (prev === null || !op) return
    const cur = parseFloat(display)
    if (!Number.isFinite(cur)) return
    const r = compute(prev, cur, op)
    setExpr(`${fmtNum(prev)}${op}${fmtNum(cur)} =`)
    setDisplay(fmtNum(r))
    setPrev(null)
    setOp(null)
    setOverwrite(true)
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
        title="Calculator"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:text-slate-50"
        style={
          open
            ? { background: KEY_BG, border: `1px solid ${BORDER}` }
            : { border: '1px solid transparent' }
        }
      >
        <Calculator className="h-4 w-4 text-slate-200" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Calculator"
          className="absolute right-0 mt-2 z-50 rounded-xl shadow-xl shadow-black/60"
          style={{
            width: 320,
            maxWidth: '90vw',
            background: PANEL,
            border: `1px solid ${BORDER}`,
            padding: 14,
            fontFamily: FONT_UI,
          }}
        >
          {/* expression preview */}
          <div
            style={{
              textAlign: 'right',
              minHeight: 18,
              fontSize: 13,
              color: PANEL_FG_MUTED,
              fontVariantNumeric: 'tabular-nums',
              marginBottom: 8,
            }}
          >
            {expr}
          </div>

          {/* result display */}
          <div
            style={{
              background: DISPLAY_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '18px 14px',
              textAlign: 'right',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 600,
                color: PANEL_FG,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
                overflowX: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {display}
            </div>
          </div>

          {/* keypad */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}
          >
            <Key label="C" variant="muted" onClick={clearAll} ariaLabel="Clear" />
            <Key
              label={<Delete className="h-4 w-4" style={{ margin: '0 auto' }} />}
              variant="muted"
              onClick={backspace}
              ariaLabel="Backspace"
            />
            <Key label="%" variant="muted" onClick={percent} ariaLabel="Percent" />
            <Key label="÷" variant="op" onClick={() => chooseOp('÷')} ariaLabel="Divide" />

            <Key label="7" onClick={() => inputDigit('7')} />
            <Key label="8" onClick={() => inputDigit('8')} />
            <Key label="9" onClick={() => inputDigit('9')} />
            <Key label="×" variant="op" onClick={() => chooseOp('×')} ariaLabel="Multiply" />

            <Key label="4" onClick={() => inputDigit('4')} />
            <Key label="5" onClick={() => inputDigit('5')} />
            <Key label="6" onClick={() => inputDigit('6')} />
            <Key label="−" variant="op" onClick={() => chooseOp('−')} ariaLabel="Subtract" />

            <Key label="1" onClick={() => inputDigit('1')} />
            <Key label="2" onClick={() => inputDigit('2')} />
            <Key label="3" onClick={() => inputDigit('3')} />
            <Key label="+" variant="op" onClick={() => chooseOp('+')} ariaLabel="Add" />

            <Key label="0" span={2} onClick={() => inputDigit('0')} />
            <Key label="." onClick={inputDot} ariaLabel="Decimal point" />
            <Key label="=" variant="eq" onClick={equals} ariaLabel="Equals" />
          </div>

          <style jsx global>{`
            .lo-calc-key:hover {
              filter: brightness(1.25);
            }
            .lo-calc-key:active {
              filter: brightness(0.9);
            }
            .lo-calc-key:focus-visible {
              outline: 2px solid ${ACCENT};
              outline-offset: 2px;
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
