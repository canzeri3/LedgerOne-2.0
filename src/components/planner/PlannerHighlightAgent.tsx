'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { usePrice } from '@/lib/dataCore'

/**
 * PlannerHighlightAgent
 * UI-only enhancer. Does NOT change layout or planner logic.
 * - Reads the current coin id from the URL (coins/[id]) for data fetching
 * - Uses DOM only after mount (inside useEffect) for purely visual highlighting
 * - Periodically re-applies highlight on DOM mutations
 * - Adds a .planner-alert-yellow class to any “alert” rows (purely visual)
 */
export default function PlannerHighlightAgent() {
  const pathname = usePathname()

  // --- Derive coin id WITHOUT touching the DOM (safe on SSR) ---
  // ex: /coins/bitcoin -> "bitcoin"
  const id = pathname?.match(/\/coins\/([^\/?#]+)/)?.[1] ?? null

  // Use NEW data core (no legacy adapters)
  const { row } = usePrice(id, 'USD', {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  })

  useEffect(() => {
    // All DOM work must be inside effects and behind guards
    const doc = typeof document !== 'undefined' ? document : null
    if (!doc) return

    ensureStyleTag(doc)

    const root =
      (doc.querySelector('[data-planners-root]') as HTMLElement | null) ||
      (doc.body as HTMLElement | null)

    if (!root) return

    applyHighlight(root, !!row?.price)

    // Re-apply when DOM mutates (rows added/removed)
    const Obs = typeof MutationObserver !== 'undefined' ? MutationObserver : null
    if (!Obs) return

    const obs = new Obs(() => applyHighlight(root, !!row?.price))
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [row?.price, pathname])

  return null
}

/* ───────────────────────── helpers (DOM-safe) ───────────────────────── */

function ensureStyleTag(doc: Document) {
  const id = '__planner-alert-yellow-style__'
  if (doc.getElementById(id)) return
  const style = doc.createElement('style')
  style.id = id
  // ⬇️ alert font color to rgb(207, 180, 45)
  style.textContent = `.planner-alert-yellow { color: rgb(207, 180, 45) !important; }`
  doc.head.appendChild(style)
}

function rowSideFromContext(row: HTMLTableRowElement): 'buy' | 'sell' | null {
  let p: HTMLElement | null = row
  while (p) {
    const h = p.getAttribute?.('data-planner-side')
    if (h === 'buy' || h === 'sell') return h
    p = p.parentElement
  }
  return null
}

function isAlertRow(row: HTMLTableRowElement): boolean {
  // 1) Known class placed by other UI wrappers
  if (row.classList.contains('planner-alert-yellow')) return true

  // 2) Look for a “yellow badge/dot” element in the row
  const badge = row.querySelector('[data-alert-yellow], .alert-yellow, .co-alert-dot-yellow')
  if (badge) return true

  // 3) Look for inline styles or classes that imply yellow-ish foreground
  const inline = row.getAttribute('style') || ''
  if (/\byellow\b/i.test(inline)) return true

  // 4) Any descendant already colored to yellow-ish by other components
  const colored = row.querySelector('*[style*="yellow"], *[class*="yellow"]')
  if (colored) return true

  return false
}

function applyHighlight(root: HTMLElement, _live: boolean) {
  // Find planner tables (buy + sell) without changing their structure
  const tables = root.querySelectorAll<HTMLTableElement>(
    '[data-planner-table], table[data-buy-planner], table[data-sell-planner]'
  )
  for (const tbl of Array.from(tables)) {
    const rows = tbl.querySelectorAll<HTMLTableRowElement>('tr')
    for (const row of Array.from(rows)) {
      if (isAlertRow(row)) {
        row.classList.add('planner-alert-yellow')
      } else {
        row.classList.remove('planner-alert-yellow')
      }
    }
  }

  // Update any collapsible headers that mirror alert state (purely visual)
  updateCollapsibleHeaders(root)
}

function updateCollapsibleHeaders(root: HTMLElement) {
  const sections = root.querySelectorAll<HTMLElement>('.co-collapsible')
  for (const sec of Array.from(sections)) {
    const content = sec.querySelector('.co-collapsible__content')
    if (!content) continue
    const hasYellow = !!content.querySelector('.planner-alert-yellow')
    if (hasYellow) sec.setAttribute('data-has-yellow', '1')
    else sec.removeAttribute('data-has-yellow')
  }
}
