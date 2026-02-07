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
 * Scroll reveal (fade + lift + slight blur) using IntersectionObserver.
 * - Transform-only (no layout shifts)
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

type FromOffset = { x?: number; y?: number; r?: number }

type ScrollSpreadProps = {
  children: React.ReactNode
  className?: string
  fromOffsets?: FromOffset[]
  startAt?: number // 0..1 of viewport height
  endAt?: number   // 0..1 of viewport height
  maxRotateDeg?: number
}

function inferOffsets(count: number): FromOffset[] {
  // Default “spread then settle” offsets (transform-only).
  if (count === 3) return [{ x: 32, y: 10, r: 1.2 }, { x: 0, y: 18, r: 0 }, { x: -32, y: 10, r: -1.2 }]
  return Array.from({ length: count }, (_, i) => {
    const mid = (count - 1) / 2
    const dir = i - mid
    return { x: -dir * 18, y: Math.abs(dir) * 8, r: -dir * 0.8 }
  })
}

/**
 * Scroll-driven “cards spread apart then settle” effect.
 * Adds subtle rotation + scale for richer motion, still transform-only.
 */
export function ScrollSpread({
  children,
  className = '',
  fromOffsets,
  startAt = 0.9,
  endAt = 0.34,
  maxRotateDeg = 2.0,
}: ScrollSpreadProps) {
  const reducedMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [p, setP] = useState(reducedMotion ? 1 : 0)

  const items = useMemo(() => React.Children.toArray(children), [children])
  const offsets = useMemo(() => {
    return fromOffsets?.length ? fromOffsets : inferOffsets(items.length)
  }, [fromOffsets, items.length])

  useEffect(() => {
    if (reducedMotion) {
      setP(1)
      return
    }

    const el = ref.current
    if (!el || typeof window === 'undefined') return

    let raf = 0
    const tick = () => {
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
      raf = window.requestAnimationFrame(tick)
    }

    tick()
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
        const r0 = from.r ?? 0

        const inv = 1 - p
        const x = x0 * inv
        const y = y0 * inv
        const r = (Math.max(-maxRotateDeg, Math.min(maxRotateDeg, r0)) || 0) * inv
        const scale = 0.978 + 0.022 * p

        return (
          <div
            key={(child as any)?.key ?? i}
            style={{
              transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${r.toFixed(
                3
              )}deg) scale(${scale.toFixed(4)})`,
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

type ParallaxProps = {
  className?: string
  strengthY?: number // px
  strengthX?: number // px
  startAt?: number
  endAt?: number
  children?: React.ReactNode
}

/**
 * Parallax for decorative layers (halos, glows). Transform-only and pointer-events should remain none.
 */
export function Parallax({
  className = '',
  strengthY = 22,
  strengthX = 0,
  startAt = 1.0,
  endAt = 0.0,
  children,
}: ParallaxProps) {
  const reducedMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [p, setP] = useState(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) {
      setP(1)
      return
    }

    const el = ref.current
    if (!el || typeof window === 'undefined') return

    let raf = 0
    const tick = () => {
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
      raf = window.requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [endAt, reducedMotion, startAt])

  const inv = 1 - p
  const x = strengthX * inv
  const y = strengthY * inv

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  )
}

type ScrollProgressProps = {
  heightPx?: number
}

/**
 * Thin top progress bar: makes the page feel “alive” while scrolling.
 */
export function ScrollProgress({ heightPx = 2 }: ScrollProgressProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [p, setP] = useState(0)

  useEffect(() => {
    if (reducedMotion) return

    let raf = 0
    const tick = () => {
      raf = 0
      const doc = document.documentElement
      const max = Math.max(1, doc.scrollHeight - window.innerHeight)
      const next = clamp01(window.scrollY / max)
      setP(next)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[60] w-full" style={{ height: heightPx }}>
      <div
        className="h-full w-full origin-left bg-gradient-to-r from-indigo-500/70 via-emerald-500/60 to-sky-500/70"
        style={{ transform: `scaleX(${p.toFixed(4)})` }}
      />
    </div>
  )
}

type DrawLineProps = {
  className?: string
  once?: boolean
}

/**
 * Small underline “draw” animation when it enters view.
 */
export function DrawLine({ className = '', once = true }: DrawLineProps) {
  const reducedMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [on, setOn] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) {
      setOn(true)
      return
    }

    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOn(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setOn(true)
          if (once) io.disconnect()
        } else if (!once) setOn(false)
      },
      { threshold: 0.3 }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [once, reducedMotion])

  return (
    <div ref={ref} className={className}>
      <div
        className="h-[2px] w-full origin-left rounded-full bg-gradient-to-r from-indigo-500/70 via-emerald-500/60 to-sky-500/70"
        style={{
          transform: `scaleX(${on ? 1 : 0})`,
          transition: 'transform 650ms cubic-bezier(.2,.8,.2,1)',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
