'use client'

import * as React from 'react'
import * as CardModule from '@/components/ui/Card'

// Support either export style from Card.tsx (named or default) without changing logic
const Card = (CardModule as any).Card ?? (CardModule as any).default



type Snapshot = any

type CombinedSellPlannerCardProps = {
  /** Active sell planner snapshot (current ladder) */
  active: Snapshot | null | undefined
  /** History snapshots, **oldest first** (index 0 === [1]) */
  history: Snapshot[] | null | undefined
  /** Title at the top-left */
  title?: string
  /** Reuse your existing ladder renderer for a given snapshot */
  renderSnapshot: (snapshot: Snapshot) => React.ReactNode
  /** Optional status flags */
  isLoading?: boolean
  isError?: boolean
}

/**
 * Single card with a top-right selector: [Active] [N] [N-1] ... [1]
 * - No logic changes. Only swaps which snapshot is rendered.
 */
export default function CombinedSellPlannerCard(props: CombinedSellPlannerCardProps) {
  const {
    active,
    history = [],
    title = 'Sell Planner – ladder',
    renderSnapshot,
    isLoading,
    isError,
  } = props

  const hist = Array.isArray(history) ? history : []

  // Build selector chips: Active, [N], [N-1], ..., [1]
  const chips = React.useMemo(() => {
    const n = hist.length
    const arr: Array<{ key: 'active' | number; text: string; aria: string }> = [
      { key: 'active', text: 'Active', aria: 'Active planner' },
    ]
    for (let i = n; i >= 1; i--) {
      arr.push({
        key: i,
        text: `[${i}]`,
        aria:
          i === n
            ? `History version ${i} (newest)`
            : i === 1
            ? `History version ${i} (oldest)`
            : `History version ${i}`,
      })
    }
    return arr
  }, [hist.length])

  // Selector (default Active)
  const [selected, setSelected] = React.useState<'active' | number>('active')

  // If history count changes, re-default to Active
  React.useEffect(() => {
    setSelected('active')
  }, [hist.length])

  // Resolve chosen snapshot (1-based index for history where 1 = oldest)
  const chosenSnapshot = React.useMemo(() => {
    if (selected === 'active') return active ?? null
    const idx = (selected as number) - 1
    return hist[idx] ?? null
  }, [selected, active, hist])

  if (isError) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <div className="mt-4 text-sm text-red-400">Failed to load sell planner data.</div>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="h-8 w-44 animate-pulse rounded-md bg-white/5" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-8 w-full animate-pulse rounded-md bg-white/5" />
          <div className="h-8 w-full animate-pulse rounded-md bg-white/5" />
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-white/5" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {chips.map(({ key, text, aria }) => {
            const isActive = selected === key
            return (
              <button
                key={typeof key === 'number' ? `hist-${key}` : 'active'}
                type="button"
                aria-label={aria}
                aria-pressed={isActive}
                onClick={() => setSelected(key)}
                className={[
                  'px-2.5 py-1 text-xs rounded-md border transition',
                  isActive
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-200',
                ].join(' ')}
              >
                {text}
              </button>
            )
          })}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {chosenSnapshot
          ? renderSnapshot(chosenSnapshot)
          : (
            <div className="text-sm text-slate-400">
              {selected === 'active'
                ? 'No active sell planner found.'
                : 'This history version is empty.'}
            </div>
          )}
      </div>
    </Card>
  )
}

