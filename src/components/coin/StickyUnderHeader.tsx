'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** when true, behaves like a normal div (not sticky) without unmounting */
  disabled?: boolean
  /** extra breathing room below the header (px) */
  extraTop?: number
  /** z-index for the sticky block */
  zIndex?: number
  className?: string
}

/**
 * Wraps children in a position:sticky container that sits just under the app header.
 * Exposes data-stuck="true" while actually stuck (unless disabled).
 * When disabled, the wrapper stays mounted but uses position:static.
 */
export default function StickyUnderHeader({
  children,
  disabled = false,
  extraTop = 8,
  zIndex = 30,
  className = '',
}: Props) {
  const [top, setTop] = useState<number>(56 + extraTop) // default header height ~56px
  const [stuck, setStuck] = useState(false)
  const sentryRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement | null>(null)

  // Compute top offset from real header height (resizes, route changes, etc.)
  useLayoutEffect(() => {
    const compute = () => {
      const headerEl =
        document.querySelector('header') ||
        document.querySelector('[data-app-header]') ||
        null
      headerRef.current = headerEl as HTMLElement | null
      const h = headerEl ? (headerEl as HTMLElement).offsetHeight : 56
      setTop(h + extraTop)
    }

    compute()

    let ro: ResizeObserver | null = null
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => compute())
      if (headerRef.current) ro.observe(headerRef.current)
    }

    window.addEventListener('resize', compute)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [extraTop])

  // Detect "stuck" only when enabled
  useLayoutEffect(() => {
    if (disabled) {
      setStuck(false)
      return
    }
    const sentry = sentryRef.current
    if (!sentry) return

    const io = new IntersectionObserver(
      entries => {
        const e = entries[0]
        setStuck(e.intersectionRatio === 0)
      },
      { root: null, threshold: [0, 1], rootMargin: `-${top}px 0px 0px 0px` }
    )

    io.observe(sentry)
    return () => io.disconnect()
  }, [top, disabled])

  return (
    <>
      {/* invisible sentinel just above the sticky region */}
      <div ref={sentryRef} aria-hidden="true" style={{ height: 1 }} />
      <div
        style={{
          position: disabled ? 'static' as const : 'sticky',
          top: disabled ? undefined : top,
          zIndex,
        }}
        className={className}
        data-stuck={!disabled && stuck ? 'true' : 'false'}
        data-sticky-enabled={disabled ? 'false' : 'true'}
      >
        {children}
      </div>
    </>
  )
}

