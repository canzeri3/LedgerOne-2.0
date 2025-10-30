'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import './collapsible-planner.css'

type CollapsiblePlannerProps = {
  title: string
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Pure UI wrapper:
 * - Collapsible (collapsed by default unless defaultOpen is set)
 * - Shows a yellow alert badge if any descendant text is already yellow
 *   (we DON'T change your logic; we only read DOM styles/classes).
 *
 * We scan for common yellow classes you already use for "level touched":
 *   .text-yellow-400, .text-yellow-500, .text-amber-400, .text-amber-500
 * You can add a data flag on any row if you prefer: [data-alert="touched"]
 */
export default function CollapsiblePlanner({
  title,
  defaultOpen = false,
  className,
  children
}: CollapsiblePlannerProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  const [hasAlert, setHasAlert] = useState<boolean>(false)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Observe the content for any yellow "touched" rows (visual only).
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const SELECTORS = [
      '.text-yellow-400',
      '.text-yellow-500',
      '.text-amber-400',
      '.text-amber-500',
      '[data-alert="touched"]',
    ].join(',')

    const check = () => {
      const hit = el.querySelector(SELECTORS)
      setHasAlert(!!hit)
    }

    // Initial check
    check()

    // Re-check on any DOM change within the planner content
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true, attributes: true })
    return () => mo.disconnect()
  }, [])

  // Smooth height transition without reflowing your layout
  const maxHeight = useMemo(() => (open ? '9999px' : '0px'), [open])

  return (
    <section className={['co-collapsible', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="co-collapsible__header"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={title.replace(/\s+/g, '-') + '-content'}
      >
        <div className="co-collapsible__head-left">
          <span className="co-collapsible__chev" data-open={open ? '1' : '0'} />
          <span className="co-collapsible__title">{title}</span>
        </div>

        {/* Alert badge is visible even when collapsed */}
        <div className="co-collapsible__badges">
          {hasAlert && (
            <span className="co-alert-dot" title="Level touched alert" aria-label="Level touched alert" />
          )}
        </div>
      </button>

      <div
        id={title.replace(/\s+/g, '-') + '-content'}
        className="co-collapsible__content"
        style={{ maxHeight }}
      >
        {/* We DO NOT modify your planners; we only render them here */}
        <div ref={contentRef}>
          {children}
        </div>
      </div>
    </section>
  )
}

