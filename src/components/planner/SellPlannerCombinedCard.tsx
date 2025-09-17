'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Card from '@/components/ui/Card'

type Props = {
  title?: string
  ActiveView: ReactNode
  HistoryView: ReactNode
  /** true if the history list renders newest → oldest; false if oldest → newest */
  newestFirst?: boolean
  className?: string
}

export default function SellPlannerCombinedCard({
  title = 'Sell Planner',
  ActiveView,
  HistoryView,
  newestFirst = true,
  className,
}: Props) {
  const [selected, setSelected] = useState<'active' | number>('active')

  // Root wrapper around the HistoryView so we can read/manipulate its rendered children (UI-only)
  const historyRootRef = useRef<HTMLDivElement>(null)

  // Count history entries (children of the first container inside HistoryView)
  const [historyLength, setHistoryLength] = useState(0)
  useEffect(() => {
    const root = historyRootRef.current
    if (!root) return

    const compute = () => {
      const firstContainer = root.firstElementChild as HTMLElement | null
      const count = firstContainer?.children?.length ?? 0
      setHistoryLength(count)
    }

    compute()
    const obs = new MutationObserver(compute)
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  // Pills: N..1 (Active shown separately)
  const labels = useMemo(() => {
    const N = Math.max(0, historyLength)
    return Array.from({ length: N }, (_, i) => N - i) // N..1
  }, [historyLength])

  // Map label -> 1-based nth index in the DOM container
  const nthIndex = useMemo(() => {
    if (selected === 'active' || historyLength === 0) return null
    const N = historyLength
    const label = selected as number
    return newestFirst ? (N - label + 1) : label
  }, [selected, historyLength, newestFirst])

  // When switching to a history version, hide all siblings except selected
  useEffect(() => {
    const root = historyRootRef.current
    if (!root) return
    const firstContainer = root.firstElementChild as HTMLElement | null
    if (!firstContainer) return

    if (selected === 'active') {
      // Show all when hidden by parent display:none anyway
      Array.from(firstContainer.children).forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      return
    }

    const target = typeof nthIndex === 'number' ? nthIndex : null
    const kids = Array.from(firstContainer.children) as HTMLElement[]
    kids.forEach((el, idx) => {
      el.style.display = target === idx + 1 ? '' : 'none'
    })

    // Cleanup on selection change/unmount
    return () => {
      kids.forEach((el) => {
        el.style.display = ''
      })
    }
  }, [selected, nthIndex])

  // ---- Delete UI (history only) ----
  async function handleDeleteSelected() {
    if (selected === 'active') return
    const root = historyRootRef.current
    if (!root) return
    const firstContainer = root.firstElementChild as HTMLElement | null
    if (!firstContainer) return
    if (typeof nthIndex !== 'number') return

    const idx = nthIndex - 1 // 0-based
    const kids = Array.from(firstContainer.children) as HTMLElement[]
    const target = kids[idx]
    if (!target) return

    const ok = window.confirm('Delete this sell planner history snapshot?')
    if (!ok) return

    // Try to extract a history id from a data attribute if present
    const historyId =
      target.getAttribute('data-history-id') ??
      (target as any).dataset?.historyId ??
      null

    // Dispatch a custom event so app-level code can persist the deletion if desired
    try {
      window.dispatchEvent(
        new CustomEvent('sellPlanner:deleteHistory', {
          detail: {
            label: selected,              // e.g., 3..1
            newestFirst,
            domIndex1Based: nthIndex,     // the child index we showed
            historyId,                    // may be null if not provided by DOM
          },
        })
      )
    } catch {
      // ignore
    }

    // Best-effort API call if an id is available (safe no-op if route doesn't exist)
    if (historyId) {
      try {
        await fetch(`/api/sell-planner/history?id=${encodeURIComponent(historyId)}`, {
          method: 'DELETE',
        })
      } catch {
        // ignore errors; UI removal still proceeds
      }
    }

    // UI-only removal so it disappears immediately without affecting your fetch logic
    target.remove()

    // Update local count + selection
    setHistoryLength((n) => Math.max(0, n - 1))
    setSelected('active') // bounce back to Active after delete
  }

  return (
    <Card
      title={title}
      headerRight={
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelected('active')}
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs border transition-colors',
              selected === 'active'
                ? 'bg-white/15 text-white border-white/20'
                : 'bg-white/5 text-slate-200 hover:bg-white/10 border-white/10',
            ].join(' ')}
            aria-pressed={selected === 'active'}
          >
            Active
          </button>
          {labels.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSelected(n)}
              className={[
                'shrink-0 rounded-full px-2.5 py-1 text-xs min-w-8 text-center border transition-colors',
                selected === n
                  ? 'bg-white/15 text-white border-white/20'
                  : 'bg-white/5 text-slate-200 hover:bg-white/10 border-white/10',
              ].join(' ')}
              aria-pressed={selected === n}
              title={n === labels[0] ? 'Newest' : n === labels[labels.length - 1] ? 'Oldest' : undefined}
            >
              {n}
            </button>
          ))}
        </div>
      }
      className={className}
    >
      {/* Content area wraps are relative so we can pin the Delete button bottom-right */}
      <div className="relative">
        {/* Active ladder */}
        <div style={{ display: selected === 'active' ? 'block' : 'none' }}>
          {ActiveView}
        </div>

        {/* History (render once; parent toggles which entry is visible) */}
        <div style={{ display: selected === 'active' ? 'none' : 'block' }}>
          <div ref={historyRootRef}>
            {HistoryView}
          </div>
        </div>

        {/* Delete button — visible only on history selection */}
        {selected !== 'active' && (
          <div className="flex justify-end pt-3 pb-1">
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="ml-auto inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-500 active:bg-red-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

