'use client'

import { mutate as globalMutate } from 'swr'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePrice } from '@/lib/dataCore'
import { usePathname } from 'next/navigation'
import Card from '@/components/ui/Card'
import { deleteSellPlannerWithAudit } from '@/lib/plannerAuditClient'
import { useUser } from '@/lib/useUser'
import { fmtCurrency } from '@/lib/format'

type Props = {
  title?: string
  ActiveView: ReactNode
  HistoryView: ReactNode
  newestFirst?: boolean
  className?: string
}

/** Mount point id in the OUTER Sell Planner <Card> headerRight */
const OUTER_HEADER_MOUNT_ID = 'sell-planner-header-right'
const TEXT_RGB = 'rgb(204,213,223)' // requested global text color

/** Tiny portal that renders children into the outer card header if present, else inline fallback */
function HeaderPortal({
  children,
  ownerKey,
}: {
  children: ReactNode
  ownerKey?: string | null
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  // Re-resolve the mount node when navigation/coin changes.
  // This prevents portaling into a stale element that was replaced/unmounted.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(OUTER_HEADER_MOUNT_ID)
    setTarget(el && el.isConnected ? el : null)
  }, [ownerKey])

  const canPortal =
    typeof window !== 'undefined' && !!target && target.isConnected

  if (canPortal) {
    return createPortal(
      <div className="text-[rgb(204,213,223)]">{children}</div>,
      target as HTMLElement
    )
  }

  // fallback (e.g., if component reused elsewhere without outer mount)
  return <div className="text-[rgb(204,213,223)]">{children}</div>
}

/**
 * Planner-only copy of the Sell planner combined card.
 * Safe to customize for /planner without affecting /coins.
 */
export default function SellPlannerCombinedCardPlanner({
  title = 'Sell planner',
  ActiveView,
  HistoryView,
  newestFirst = true,
  className,
}: Props) {
  const pathname = usePathname()
  const coinIdFromPath = useMemo(() => {
    const parts = (pathname || '').split('/').filter(Boolean)
    const idx = parts.indexOf('coins')
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null
  }, [pathname])

  const [selected, setSelected] = useState<'active' | number>('active')
  const [historyLength, setHistoryLength] = useState(0)
  const [alertLabels, setAlertLabels] = useState<number[]>([])
  const [activeHasAlert, setActiveHasAlert] = useState(false)
  const [activePlannerId, setActivePlannerId] = useState<string | null>(null)
  const activeRootRef = useRef<HTMLDivElement | null>(null)
  const historyRootRef = useRef<HTMLDivElement | null>(null)
  
  // ── UI state: confirm “Delete” (Sell Planner) ─────────────────────────────
  const [confirmSellDeleteOpen, setConfirmSellDeleteOpen] = useState<boolean>(false)
  const confirmSellDeleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const lastFocusSellDeleteRef = useRef<HTMLElement | null>(null)
  const sellDeleteActionRef = useRef<null | (() => void | Promise<void>)>(null)

  const openConfirmSellDelete = (action: () => void | Promise<void>) => {
    lastFocusSellDeleteRef.current = (document.activeElement as HTMLElement) ?? null
    sellDeleteActionRef.current = action
    setConfirmSellDeleteOpen(true)
  }

  const closeConfirmSellDelete = () => {
    setConfirmSellDeleteOpen(false)
    sellDeleteActionRef.current = null
    setTimeout(() => lastFocusSellDeleteRef.current?.focus?.(), 0)
  }

  const confirmSellDelete = async () => {
    const fn = sellDeleteActionRef.current
    if (!fn) return
    await fn()
    closeConfirmSellDelete()
  }


  const { user } = useUser()
  // Active pill should turn yellow when the Active ladder reports an executable (yellow) row.
  useEffect(() => {
    const root = activeRootRef.current
    if (!root) return

    const read = () => {
      const el = root.querySelector<HTMLElement>('[data-has-alert]')
      const flag = el?.getAttribute('data-has-alert')
      const plannerId =
        root.querySelector<HTMLElement>('[data-active-id]')?.getAttribute('data-active-id')?.trim() || null

      setActiveHasAlert(flag === '1' || flag === 'true')
      setActivePlannerId(plannerId)
    }

    const mo = new MutationObserver(read)
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-has-alert', 'data-active-id'],
    })

    read()
    return () => mo.disconnect()
  }, [])


  // Track history length and keep selection valid
  useEffect(() => {
    const root = historyRootRef.current
    if (!root) return
    const update = () => {
      const els = Array.from(
        root.querySelectorAll<HTMLElement>('[data-history-id]')
      )
      const N = els.length
      setHistoryLength(N)

      // Keep current selection valid
      if (selected !== 'active') {
        const n = typeof selected === 'number' ? selected : 1
        if (n > N) setSelected(N > 0 ? 1 : 'active')
      }

      // Map data-has-alert flags on history items => pill labels
      if (N === 0) {
        setAlertLabels([])
        return
      }

      const alerted: number[] = []
      els.forEach((el, idx) => {
        const flag = el.getAttribute('data-has-alert')
        const hasAlert = flag === '1' || flag === 'true'
        if (hasAlert) {
          const domIndex = idx + 1 // 1-based position in DOM (newest -> oldest)
          const labelForThis = newestFirst ? N - domIndex + 1 : domIndex
          alerted.push(labelForThis)
        }
      })
      setAlertLabels(alerted)
    }
    const mo = new MutationObserver(update)
    mo.observe(root, { childList: true, subtree: true })
    update()
    return () => mo.disconnect()
  }, [selected, newestFirst])

  // Modal behavior: scroll lock + ESC to dismiss (Sell delete)
  useEffect(() => {
    if (!confirmSellDeleteOpen) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeConfirmSellDelete()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    setTimeout(() => confirmSellDeleteCancelRef.current?.focus(), 0)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmSellDeleteOpen])

  const labels = useMemo(() => {
    const N = Math.min(10, Math.max(0, historyLength))
    return Array.from({ length: N }, (_, i) => N - i)
  }, [historyLength])

  // 1-based index of the selected history item when not 'active'
  const nthIndex = useMemo(() => {
    if (selected === 'active' || historyLength === 0) return null
    const N = historyLength
    const label = selected as number
    return newestFirst ? (N - label + 1) : label
  }, [selected, historyLength, newestFirst])

  const canDeleteSelected = selected === 'active' ? !!activePlannerId : !!nthIndex

  // Show only the chosen history item when a frozen version is selected
  useEffect(() => {

    const root = historyRootRef.current
    if (!root) return
    const all = Array.from(root.querySelectorAll<HTMLElement>('[data-history-id]'))
    if (!all.length) return
    if (selected === 'active') {
      all.forEach(el => (el.style.display = 'none'))
      return
    }
    const target = all[nthIndex! - 1] || null
    all.forEach(el => (el.style.display = el === target ? 'block' : 'none'))
  }, [selected, nthIndex])

  // Resolve coin id (for live price context)
  const coinId = useMemo(() => {
    const attrEl = typeof document !== 'undefined'
      ? document.querySelector('[data-coingecko-id]')
      : null
    if (attrEl) return attrEl.getAttribute('data-coingecko-id')
    if (typeof document !== 'undefined') {
      const metaEl = document.querySelector('meta[name="coingecko-id"]') as HTMLMetaElement | null
      return (attrEl as any)?.getAttribute('data-coingecko-id') || metaEl?.content || null
    }
    return null
  }, [coinIdFromPath])


  const { row: priceRow } = usePrice(coinId, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })
  const livePrice: number | null = priceRow?.price ?? null
  const hasLivePrice = Number.isFinite(livePrice as number) && (livePrice as number) > 0

  return (
    <>
          {/* Confirm “Delete” (Sell Planner) */}
      {confirmSellDeleteOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-sell-delete-title"
              className="pl-modal-overlay !z-[110]"
            >
              {/* Backdrop */}
              <button
                type="button"
                aria-label="Close delete confirmation"
                onClick={closeConfirmSellDelete}
                className="absolute inset-0"
              />

              {/* Panel */}
              <div className="pl-modal z-10">
                <div className="pl-modal-icon danger" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" />
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>

                <h2 id="confirm-sell-delete-title" className="pl-modal-title">
                  Delete Sell Planner?
                </h2>

                <p className="pl-modal-body">
                  {selected === 'active'
                    ? 'Deleting the live planner removes the current ladder and stops live planner tracking for this coin.'
                    : 'Deleting the selected frozen planner removes that saved version from History.'}{' '}
                  Any trades you already recorded under this planner will remain saved and visible in your history.
                  <b className="block mt-2">You can restore it later from Audit Log.</b>
                </p>

                <div className="pl-modal-acts">
                  <button
                    ref={confirmSellDeleteCancelRef}
                    type="button"
                    onClick={closeConfirmSellDelete}
                    className="btn"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={confirmSellDelete}
                    className="btn btn-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
        
      {/* ───────────────── Header moved to OUTER card via portal ─────────────────
          Always rendered: the Active pill shows even with no saved versions;
          numbered pills appear only when history exists (labels is empty otherwise). */}
      {(
<HeaderPortal ownerKey={pathname}>
          <div className="plan-seg-group overflow-x-auto">
            {/* Active tab */}
            <button
              type="button"
              onClick={() => setSelected('active')}
              className={[
                'plan-seg live-seg',
                activeHasAlert ? 'alert' : '',
                selected === 'active' ? 'on' : '',
              ].join(' ').trim()}
            >
              <span className="plan-live" aria-hidden="true" />
              Active
            </button>

            {/* Version selectors (numbers only; no "V") */}
            {labels.map((n) => {
              const hasAlertForLabel = alertLabels.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelected(n)}
                  className={[
                    'plan-seg plan-num',
                    hasAlertForLabel ? 'alert' : '',
                    selected === n ? 'on' : '',
                  ].join(' ').trim()}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </HeaderPortal>
      )}

      {/* ───────────────── Content (no card chrome — panel provides surface) ───────────────── */}
      <div className={['relative w-full', className || ''].join(' ')} style={{ color: TEXT_RGB }}>
        <div
          ref={activeRootRef}
          style={{ display: selected === 'active' ? 'block' : 'none', color: TEXT_RGB }}
        >
          {ActiveView}
        </div>

        <div style={{ display: selected === 'active' ? 'none' : 'block', color: TEXT_RGB }}>
          <div ref={historyRootRef} className="space-y-3">
            {HistoryView}
          </div>
        </div>

        {/* Footer actions — Delete (when available) + Generate Ladder (portaled in
            from SellPlannerInputs so it keeps its handler + busy state) */}
        <div className="pl-sell-actions flex justify-end gap-2">
          {canDeleteSelected && (
            <button
              type="button"
              onClick={() => openConfirmSellDelete(handleDeleteSelected)}
              className="btn btn-danger"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" />
                <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Delete
            </button>
          )}
          <div id="sell-generate-slot" className="contents" />
        </div>

        {/* Optional helper – now also uses the same text color */}
        {hasLivePrice ? (
          <div className="pl-live-context text-xs" style={{ color: TEXT_RGB }}>
            Live price context: {fmtCurrency(Number(livePrice), { max: 2 })}
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .sell-delete-btn {
          position: relative;
          border-radius: 6px;
          width: 95px;
          height: 28px;
          cursor: pointer;
          display: flex;
          align-items: center;
          border: 1px solid rgb(105, 40, 40);
          background-color: rgb(41, 42, 45);
          overflow: hidden;
          color: ${TEXT_RGB}; /* ensure icon inherits color */
        }
        .sell-delete-btn,
        .sell-delete-btn .button__icon,
        .sell-delete-btn .button__text {
          transition: all 0.3s;
        }
        .sell-delete-btn .button__text {
          transform: translateX(22px);
          color: ${TEXT_RGB};
          font-weight: 600;
          font-size: 10px;
          line-height: 1;
        }
        .sell-delete-btn .button__icon {
          position: absolute;
          transform: translateX(68px);
          height: 100%;
          width: 27px;
          background-color: rgb(105, 40, 40);
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${TEXT_RGB}; /* icon stroke uses currentColor */
        }
        .sell-delete-btn .svg {
          width: 16px;
          height: 16px;
        }
        .sell-delete-btn:hover {
          background: rgb(115, 45, 45);
        }
        .sell-delete-btn:hover .button__text {
          color: ${TEXT_RGB};
        }
        .sell-delete-btn:hover .button__icon {
          width: 94px;
          transform: translateX(0);
        }
        .sell-delete-btn:active .button__icon {
          background-color: rgb(95, 35, 35);
        }
        .sell-delete-btn:active {
          border: 1px solid rgb(95, 35, 35);
        }
      `}</style>
    </>
  )

  async function handleDeleteSelected() {
    const deletingActive = selected === 'active'
    const root = deletingActive ? activeRootRef.current : historyRootRef.current
    if (!root) return

    let id: string | null = null
    let idx: number | null = null
    let target: HTMLElement | null = null

    if (deletingActive) {
      id =
        root.querySelector<HTMLElement>('[data-active-id]')?.getAttribute('data-active-id')?.trim() ||
        activePlannerId
    } else {
      idx = nthIndex
      if (!idx) return
      const list = Array.from(root.querySelectorAll<HTMLElement>('[data-history-id]'))
      target = list[idx - 1] ?? null
      if (!target) return
      id = target.getAttribute('data-history-id')?.trim() || null
    }

    if (!id) return

    try {
      if (!user) {
        alert('Please sign in first.')
        return
      }

      await deleteSellPlannerWithAudit(id)

      const cacheCoinId = coinId ?? coinIdFromPath
      const refreshes: Promise<any>[] = [
        globalMutate(['/alerts/sell-planners', user.id]),
        globalMutate(['/alerts/sell-planners-history', user.id]),
        globalMutate(['/audit', user.id]),
      ]

      if (cacheCoinId) {
        refreshes.push(
          globalMutate(['/sell-active', user.id, cacheCoinId]),
          globalMutate(['/sell-history/planners', user.id, cacheCoinId]),
          globalMutate(['/sell-history/levels', user.id, cacheCoinId]),
          globalMutate(['/sell-history/sells', user.id, cacheCoinId])
        )
      }

      await Promise.all(refreshes)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sellPlannerUpdated', {
            detail: { coinId: cacheCoinId, plannerId: id },
          })
        )
      }

      if (!deletingActive && target && idx) {
        target.remove()
        const remaining = root.querySelectorAll('[data-history-id]').length
        if (remaining === 0) setSelected('active')
        else setSelected(Math.min(idx, remaining))
      } else {
        setSelected('active')
      }
    } catch (e: any) {
      console.error('[sell_planner delete] exception', e)
      alert('Delete failed: ' + (e?.message || String(e)))
    }
  }
}
