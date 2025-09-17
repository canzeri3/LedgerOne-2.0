'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { usePathname } from 'next/navigation'
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

  // Root wrappers so we can read/manipulate rendered children (UI-only)
  const activeRootRef = useRef<HTMLDivElement>(null)
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

  // Pills: show up to 10 frozen entries; labels are N..1 (Active shown separately)
  const labels = useMemo(() => {
    const N = Math.min(10, Math.max(0, historyLength))
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

    const historyId =
      target.getAttribute('data-history-id') ??
      (target as any).dataset?.historyId ??
      null

    try {
      window.dispatchEvent(
        new CustomEvent('sellPlanner:deleteHistory', {
          detail: {
            label: selected,
            newestFirst,
            domIndex1Based: nthIndex,
            historyId,
          },
        })
      )
    } catch {}

    if (historyId) {
      try {
        await fetch(`/api/sell-planner/history?id=${encodeURIComponent(historyId)}`, {
          method: 'DELETE',
        })
      } catch {}
    }

    target.remove()
    setHistoryLength((n) => Math.max(0, n - 1))
    setSelected('active')
  }

  /* --------------------------- LIVE PRICE + HIGHLIGHT --------------------------- */
  // Try to infer the coin id without changing props/usage:
  // 1) /coins/[id] in pathname, 2) [data-coingecko-id] on page, 3) <meta name="coingecko-id">
  const pathname = usePathname()
  const coinIdFromPath = useMemo(() => {
    if (!pathname) return null
    const m = pathname.match(/\/coins\/([^/]+)/)
    return m?.[1] ?? null
  }, [pathname])

  const coinId = useMemo(() => {
    if (coinIdFromPath) return coinIdFromPath
    if (typeof document !== 'undefined') {
      const attrEl = document.querySelector('[data-coingecko-id]') as HTMLElement | null
      const metaEl = document.querySelector('meta[name="coingecko-id"]') as HTMLMetaElement | null
      return attrEl?.getAttribute('data-coingecko-id') || metaEl?.content || null
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

  // Extract the first reasonable numeric (or $) figure from a string (planner row)
  function parseLevel(text: string): number | null {
    if (!text) return null
    // Prefer $-style, e.g. $42,000.12
    const money = text.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/)
    if (!money) return null
    const raw = money[1].replace(/,/g, '')
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  function rowElsOf(root: HTMLElement | null): HTMLElement[] {
    if (!root) return []
    // Use first container’s children when present (matches your history counter),
    // otherwise fall back to direct children.
    const firstContainer = (root.firstElementChild as HTMLElement | null) ?? root
    if (!firstContainer) return []
    return Array.from(firstContainer.children) as HTMLElement[]
  }

  function shouldHighlightSell(level: number, price: number): boolean {
    if (!Number.isFinite(level) || !Number.isFinite(price) || level <= 0) return false
    const within = Math.abs(price - level) / level <= 0.03 // ±3%
    const crossed = price >= level // for SELL planners: above level => highlight
    return within || crossed
  }

  // Apply/removes the highlight class on each row in a container
  function applyHighlights(container: HTMLElement | null, price: number | null) {
    if (!container || !Number.isFinite(price as number)) return
    const rows = rowElsOf(container)
    for (const row of rows) {
      const txt = row.textContent || ''
      const level = parseLevel(txt)
      const on = level != null && shouldHighlightSell(level, price as number)
      row.classList.toggle('text-yellow-300', !!on)
    }
  }

  // Re-run highlight when price changes or content mutates
  useEffect(() => {
    if (!hasLivePrice) return
    applyHighlights(activeRootRef.current, livePrice)
    applyHighlights(historyRootRef.current, livePrice)
  }, [hasLivePrice, livePrice, selected, historyLength])
  /* --------------------------------------------------------------------------- */

  return (
    <Card
      title={title}
      headerRight={
        /* Hide the version selector entirely if there are no frozen planners */
        historyLength > 0 ? (
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
                title={
                  n === labels[0]
                    ? 'Newest'
                    : n === labels[labels.length - 1]
                    ? 'Oldest'
                    : undefined
                }
              >
                {n}
              </button>
            ))}
          </div>
        ) : undefined
      }
      className={className}
    >
      {/* Content area wraps are relative so we can pin the Delete button bottom-right */}
      <div className="relative">
        {/* Active ladder */}
        <div ref={activeRootRef} style={{ display: selected === 'active' ? 'block' : 'none' }}>
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

