'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(Boolean(mq.matches))
    onChange()

    // Safari <14
    // eslint-disable-next-line deprecation/deprecation
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }

    // eslint-disable-next-line deprecation/deprecation
    mq.addListener(onChange)
    // eslint-disable-next-line deprecation/deprecation
    return () => mq.removeListener(onChange)
  }, [])

  return reduced
}

type RevealProps = {
  children: React.ReactNode
  className?: string
  delayMs?: number
  once?: boolean
}

/**
 * Simple, dependency-free scroll reveal (fade + lift + slight blur) using IntersectionObserver.
 * - No layout changes (transform only)
 * - Respects prefers-reduced-motion
 */
export function Reveal({ children, className = '', delayMs = 0, once = true }: RevealProps) {
  const reducedMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) {
      setInView(true)
      return
    }

    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { root: null, threshold: 0.12 }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [once, reducedMotion])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms`, willChange: 'transform, opacity, filter' }}
      className={
        `transition-all duration-700 ease-out ` +
        (inView ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-6 blur-[2px]') +
        ` ${className}`
      }
    >
      {children}
    </div>
  )
}

type FromOffset = { x?: number; y?: number }

type ScrollSpreadProps = {
  children: React.ReactNode
  className?: string
  /**
   * Per-item starting offsets (in px). Each item interpolates from this offset to {x:0,y:0}.
   * If omitted, a reasonable default is inferred for 3-up grids.
   */
  fromOffsets?: FromOffset[]
  /** When the container top is at this % of viewport height, progress=0. (0..1) */
  startAt?: number
  /** When the container top is at this % of viewport height, progress=1. (0..1) */
  endAt?: number
}

function infer3UpOffsets(count: number): FromOffset[] {
  // Best-effort defaults for common 3-column grids.
  // Pull cards slightly toward the center at start, then “settle” into place as you scroll.
  if (count !== 3) {
    return Array.from({ length: count }, (_, i) => {
      const dir = i - (count - 1) / 2
      return { x: -dir * 18, y: Math.abs(dir) * 8 }
    })
  }

  return [{ x: 22, y: 10 }, { x: 0, y: 16 }, { x: -22, y: 10 }]
}

/**
 * Scroll-driven “spread” effect for a group of cards.
 * Cards start subtly closer together (translate toward center), then separate into their final positions.
 * Uses transform only (no layout shifts) and respects prefers-reduced-motion.
 */
export function ScrollSpread({
  children,
  className = '',
  fromOffsets,
  startAt = 0.86,
  endAt = 0.35,
}: ScrollSpreadProps) {
  const reducedMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [p, setP] = useState(reducedMotion ? 1 : 0)

  const items = useMemo(() => React.Children.toArray(children), [children])
  const offsets = useMemo(() => {
    return fromOffsets?.length ? fromOffsets : infer3UpOffsets(items.length)
  }, [fromOffsets, items.length])

  useEffect(() => {
    if (reducedMotion) {
      setP(1)
      return
    }

    const el = ref.current
    if (!el || typeof window === 'undefined') return

    let raf = 0
    const onTick = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const vh = Math.max(1, window.innerHeight)
      const startPx = vh * startAt
      const endPx = vh * endAt
      const denom = Math.max(1, startPx - endPx)
      const next = clamp01((startPx - rect.top) / denom)
      setP(next)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(onTick)
    }

    onTick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [endAt, reducedMotion, startAt])

  return (
    <div ref={ref} className={className}>
      {items.map((child, i) => {
        const from = offsets[i] || {}
        const x0 = from.x ?? 0
        const y0 = from.y ?? 0

        // Interpolate from “pulled toward center” -> settled.
        const inv = 1 - p
        const x = x0 * inv
        const y = y0 * inv
        const scale = 0.985 + 0.015 * p

        return (
          <div
            key={(child as any)?.key ?? i}
            style={{
              transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`,
              transition: 'transform 90ms linear',
              willChange: 'transform',
            }}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}

