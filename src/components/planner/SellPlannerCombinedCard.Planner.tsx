'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import { usePathname } from 'next/navigation'
import Card from '@/components/ui/Card'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useUser } from '@/lib/useUser'

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
function HeaderPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setTarget(document.getElementById(OUTER_HEADER_MOUNT_ID))
    }
  }, [])
  if (typeof window !== 'undefined' && target) {
    // ensure header controls also use the unified text color
    return createPortal(
      <div className="text-[rgb(204,213,223)]">{children}</div>,
      target
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
  const activeRootRef = useRef<HTMLDivElement | null>(null)
  const historyRootRef = useRef<HTMLDivElement | null>(null)


  const { user } = useUser()

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


  const { data: priceData } = useSWR(
    coinId ? `/api/price/${coinId}` : null,
    (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json()),
    { refreshInterval: 30_000 }
  )
  const livePrice: number | null = Number(priceData?.price ?? NaN)
  const hasLivePrice = Number.isFinite(livePrice as number)

  return (
    <>
      {/* ───────────────── Header moved to OUTER card via portal ───────────────── */}
      {historyLength > 0 && (
        <HeaderPortal>
          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Label (subtle). If you want it always visible, remove 'hidden md:inline'. */}
            <span className="hidden md:inline text-xs mr-2">
              {title ?? 'Active & History'}
            </span>

            {/* Active tab */}
            <button
              type="button"
              onClick={() => setSelected('active')}
              className={[
                'shrink-0 rounded-full px-3 py-1 text-xs border transition-colors',
                selected === 'active'
                  ? 'bg-white/10 border-white/20'
                  : 'bg-white/5 hover:bg-white/10 border-white/10',
                // text inherits TEXT_RGB
              ].join(' ')}
            >
              Active
            </button>

                 {/* Version selectors (numbers only; no "V") */}
            <div className="ml-1 flex items-center gap-1">
              {labels.map((n) => {
                const hasAlertForLabel = alertLabels.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelected(n)}
                    className={[
                      'shrink-0 rounded-full px-2.5 py-1 text-xs min-w-8 text-center border transition-colors',
                      selected === n
                        ? 'bg-white/10 border-white/20'
                        : 'bg-white/5 hover:bg-white/10 border-white/10',
                      hasAlertForLabel
                        ? 'border-[rgb(242,205,73)] text-[rgb(242,205,73)]'
                        : '',
                      // text inherits TEXT_RGB
                    ].join(' ')}
                  >
                    {n}
                  </button>
                )
              })}
            </div>

          </div>
        </HeaderPortal>
      )}

      {/* ───────────────── Content card WITHOUT its own header ───────────────── */}
      <Card
        className={[
          // Apply global text color to everything inside this card
          'text-[rgb(204,213,223)]',
          // Remove gradient & set solid background
          'bg-none !bg-[rgb(28,29,31)] !from-transparent !to-transparent',
          // Remove border ring + shadow and hover float
          '!border-0 !shadow-none !hover:translate-y-0',
          className || ''
        ].join(' ')}
          noHoverLift
        title={undefined} // prevent inner header; header now lives in outer card
      >
        <div className="relative w-full h-full">
          {/* ── UI-only: DOUBLE-BORDER panel ───────────────────────────────────── */}
          <div
            className="rounded-md bg-[rgb(28,29,31)]"
            style={{ borderStyle: 'solid', borderWidth: '2px', borderColor: 'rgb(49,50,54)' }}
          >
            <div
              className="rounded-md"
              style={{ borderStyle: 'solid', borderWidth: '6px', borderColor: 'rgb(41,42,45)' }}
            >
              <div className="p-2">
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

                  {selected !== 'active' && (
                    <div className="mt-3 flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleDeleteSelected}
                        className="sell-delete-btn"
                      >
                        <span className="button__text">Delete</span>
                        <span className="button__icon" aria-hidden="true">
                          <svg className="svg" viewBox="0 0 24 24" fill="none">
                            <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2"/>
                            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Optional helper – now also uses the same text color */}
                {hasLivePrice ? (
                  <div className="mt-2 text-xs" style={{ color: TEXT_RGB }}>
                    Live price context: ${Number(livePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Card>

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
    if (selected === 'active') return
    const idx = nthIndex
    if (!idx) return
    const root = historyRootRef.current
    if (!root) return
    const list = Array.from(root.querySelectorAll<HTMLElement>('[data-history-id]'))
    const target = list[idx - 1]
    if (!target) return
    const id = target.getAttribute('data-history-id')
    if (!id) return
    const ok = confirm('Delete this frozen planner version permanently? This cannot be undone.')
    if (!ok) return

    try {
      if (!user) {
        alert('Please sign in first.')
        return
      }

      const { error } = await supabaseBrowser
        .from('sell_planners')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('is_active', false)

      if (error) {
        console.error('[sell_planner delete] error', error)
        alert('Delete failed: ' + (error.message || 'Unknown error'))
        return
      }

      const targetEl = root.querySelector(`[data-history-id="${id}"]`) as HTMLElement | null
      if (targetEl) targetEl.remove()

      const remaining = root.querySelectorAll('[data-history-id]').length
      if (remaining === 0) setSelected('active')
      else setSelected(Math.min(idx, remaining))
    } catch (e: any) {
      console.error('[sell_planner delete] exception', e)
      alert('Delete failed: ' + (e?.message || String(e)))
    }
  }
}
