'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

type CollapsibleSectionProps = {
  /** A label for screen readers and the toggle button title. */
  title: string
  /** Start collapsed by default. */
  defaultCollapsed?: boolean
  /** Optional className passed to the outer container. */
  className?: string
  /** Children are rendered identically, only visibility toggles. */
  children: React.ReactNode
}

/**
 * UI-only wrapper that toggles visibility of its children.
 * - Does NOT alter child layout or logic.
 * - Adds a small caret button to the top-right (absolute) to avoid shifting your header layout.
 * - Collapsed by default (configurable).
 */
export default function CollapsibleSection({
  title,
  defaultCollapsed = true,
  className = '',
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = React.useState<boolean>(defaultCollapsed)

  // We use inline style to avoid tailwind purge issues and to keep zero layout shift.
  return (
    <div className={className} data-collapsible-section>
      {/* Toggle button sits in the top-right corner; absolute so it doesn't reflow your header */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
          title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={() => setCollapsed(v => !v)}
          className="
            absolute right-0 -top-2.5 md:-top-3
            inline-flex items-center justify-center
            h-7 w-7 rounded-md
            hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-foreground/20
            transition
          "
          style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      </div>

      {/* Content: hidden when collapsed. We use display none to preserve original spacing decisions. */}
      <div
        id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
        style={{ display: collapsed ? 'none' : 'block' }}
      >
        {children}
      </div>
    </div>
  )
}

