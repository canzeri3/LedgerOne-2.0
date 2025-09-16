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

/**
 * UI-only wrapper that merges Active ladder + History ladders into one card
 * with a top-right selector (Active, N..1). No data fetching or business logic is changed.
 *
 * It renders your existing History component once, then shows exactly one snapshot by
 * toggling the display of the history list’s children.
 */
export default function SellPlannerCombinedCard({
  title = 'Sell Planner',
  ActiveView,
  HistoryView,
  newestFirst = true,
  className,
}: Props) {
  const [selected, setSelected] = useState<'active' | number>('active')

  // Root for the HistoryView; we’ll find its first element child, which is the list container.
  const historyRootRef = useRef<HTMLDivElement>(null)

  // Count history entries by inspecting the first child container's children (UI-only).
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

  // Build labels: [N, N-1, ..., 1]
  const labels = useMemo(() => {
    const N = Math.max(0, historyLength)
    return Array.from({ length: N }, (_, i) => N - i)
  }, [historyLength])

  // Map the displayed label → DOM index (1-based) inside the list container
  const nthIndex = useMemo(() => {
    if (selected === 'active' || historyLength === 0) return null
    const N = historyLength
    const label = selected as number
    return newestFirst ? (N - label + 1) : label
  }, [selected, historyLength, newestFirst])

  // Show only the selected child in the history list (UI-only DOM tweak).
  useEffect(() => {
    const root = historyRootRef.current
    if (!root) return
    const firstContainer = root.firstElementChild as HTMLElement | null
    if (!firstContainer) return

    // When viewing Active, let the entire history render normally hidden by parent 'display:none'
    if (selected === 'active') return

    const target = typeof nthIndex === 'number' ? nthIndex : null
    const kids = Array.from(firstContainer.children) as HTMLElement[]

    kids.forEach((el, idx) => {
      // idx is 0-based; target is 1-based
      el.style.display = target === idx + 1 ? '' : 'none'
    })

    // Clean up on unmount/selection change: reset styles so HistoryView isn’t permanently altered
    return () => {
      kids.forEach((el) => {
        el.style.display = ''
      })
    }
  }, [selected, nthIndex])

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
    </Card>
  )
}

