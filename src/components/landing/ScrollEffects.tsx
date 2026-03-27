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

type FrameSubscriber = () => void

const frameSubscribers = new Set<FrameSubscriber>()
let frameRafId = 0
let frameListening = false

function flushFrameSubscribers() {
  frameRafId = 0
  frameSubscribers.forEach((fn) => fn())
}

function requestSharedFrame() {
  if (typeof window === 'undefined') return
  if (frameRafId) return
  frameRafId = window.requestAnimationFrame(flushFrameSubscribers)
}

function attachSharedFrameListeners() {
  if (frameListening || typeof window === 'undefined') return

  frameListening = true
  window.addEventListener('scroll', requestSharedFrame, { passive: true })
  window.addEventListener('resize', requestSharedFrame)
  document.addEventListener('visibilitychange', requestSharedFrame)
}

function detachSharedFrameListeners() {
  if (!frameListening || typeof window === 'undefined') return

  frameListening = false
  window.removeEventListener('scroll', requestSharedFrame)
  window.removeEventListener('resize', requestSharedFrame)
  document.removeEventListener('visibilitychange', requestSharedFrame)

  if (frameRafId) {
    window.cancelAnimationFrame(frameRafId)
    frameRafId = 0
  }
}

function subscribeToSharedFrame(fn: FrameSubscriber) {
  if (typeof window === 'undefined') return () => {}

  frameSubscribers.add(fn)
  attachSharedFrameListeners()
  requestSharedFrame()

  return () => {
    frameSubscribers.delete(fn)
    if (!frameSubscribers.size) detachSharedFrameListeners()
  }
}

type RevealProps = {
  children: React.ReactNode
  className?: string
  delayMs?: number
  durationMs?: number
  once?: boolean
}

export function Reveal({
  children,
  className = '',
  delayMs = 0,
  durationMs = 700,
  once = true,
}: RevealProps) {
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
      style={{
        transitionDelay: `${delayMs}ms`,
        transitionDuration: `${durationMs}ms`,
        willChange: inView ? 'auto' : 'transform, opacity, filter',
      }}
      className={
        `transition-[opacity,transform,filter] ease-[cubic-bezier(0.22,1,0.36,1)] ` +
        (inView ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-8 blur-[3px]') +
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
  startAt?: number
  endAt?: number
  maxRotateDeg?: number
}

type SplitRowProps = {
  children: React.ReactNode
  className?: string
  spreadX?: number
  liftY?: number
  durationMs?: number
  staggerMs?: number
  once?: boolean
}

export function SplitRow({
  children,
  className = '',
  spreadX = 34,
  liftY = 14,
  durationMs = 850,
  staggerMs = 90,
  once = true,
}: SplitRowProps) {
  const reducedMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [on, setOn] = useState(reducedMotion)

  const items = useMemo(() => React.Children.toArray(children), [children])

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
        } else if (!once) {
          setOn(false)
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -10% 0px' }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [once, reducedMotion])

  const count = items.length
  const mid = (count - 1) / 2

  return (
    <div ref={ref} className={className}>
      {items.map((child, i) => {
        const dir = count === 3 ? (i === 0 ? 1 : i === 2 ? -1 : 0) : mid - i

        const x0 = dir * spreadX
        const y0 =
          count === 3 ? (i === 1 ? liftY : liftY * 0.6) : Math.min(liftY, Math.abs(dir) * (liftY * 0.55))

        const opacity = on ? 1 : 0
        const scale = on ? 1 : 0.985
        const x = on ? 0 : x0
        const y = on ? 0 : y0

        return (
          <div
            key={(child as any)?.key ?? i}
                style={{
              transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`,
              opacity,
              transitionProperty: 'transform, opacity',
              transitionDuration: `${durationMs}ms`,
              transitionTimingFunction: 'cubic-bezier(.2,.85,.2,1)',
              transitionDelay: `${i * staggerMs}ms`,
              willChange: on ? 'auto' : 'transform, opacity',
            }}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}

function inferOffsets(count: number): FromOffset[] {
  if (count === 3) return [{ x: 32, y: 10, r: 1.2 }, { x: 0, y: 18, r: 0 }, { x: -32, y: 10, r: -1.2 }]
  return Array.from({ length: count }, (_, i) => {
    const mid = (count - 1) / 2
    const dir = i - mid
    return { x: -dir * 18, y: Math.abs(dir) * 8, r: -dir * 0.8 }
  })
}

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
  const itemRefs = useRef<HTMLDivElement[]>([])
  const lastProgressRef = useRef<number | null>(null)
  const activeRef = useRef(true)

  const items = useMemo(() => React.Children.toArray(children), [children])
  const offsets = useMemo(() => {
    return fromOffsets?.length ? fromOffsets : inferOffsets(items.length)
  }, [fromOffsets, items.length])

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length)
  }, [items.length])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (reducedMotion) {
      lastProgressRef.current = 1
      itemRefs.current.forEach((node) => {
        if (!node) return
        node.style.transform = 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)'
      })
      return
    }

    let isMounted = true
    let io: IntersectionObserver | null = null

    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          activeRef.current = Boolean(entries[0]?.isIntersecting)
        },
        {
          threshold: 0,
          rootMargin: '20% 0px 20% 0px',
        }
      )

      io.observe(el)
    }

    const unsubscribe = subscribeToSharedFrame(() => {
      if (!isMounted || !activeRef.current) return

      const rect = el.getBoundingClientRect()
      const vh = Math.max(1, window.innerHeight)
      const startPx = vh * startAt
      const endPx = vh * endAt
      const denom = Math.max(1, startPx - endPx)
      const next = clamp01((startPx - rect.top) / denom)
      const last = lastProgressRef.current

      if (last !== null && Math.abs(last - next) <= 0.001) {
        return
      }

      lastProgressRef.current = next
      const inv = 1 - next
      const scale = 0.978 + 0.022 * next

      for (let i = 0; i < itemRefs.current.length; i += 1) {
        const node = itemRefs.current[i]
        if (!node) continue

        const from = offsets[i] || {}
        const x0 = from.x ?? 0
        const y0 = from.y ?? 0
        const r0 = from.r ?? 0
        const x = x0 * inv
        const y = y0 * inv
        const r = (Math.max(-maxRotateDeg, Math.min(maxRotateDeg, r0)) || 0) * inv

        node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${r.toFixed(3)}deg) scale(${scale.toFixed(4)})`
      }
    })

    return () => {
      isMounted = false
      io?.disconnect()
      unsubscribe?.()
    }
  }, [endAt, items.length, maxRotateDeg, offsets, reducedMotion, startAt])

  return (
    <div ref={ref} className={className}>
      {items.map((child, i) => {
        const from = offsets[i] || {}
        const x0 = reducedMotion ? 0 : from.x ?? 0
        const y0 = reducedMotion ? 0 : from.y ?? 0
        const r0 = reducedMotion ? 0 : (Math.max(-maxRotateDeg, Math.min(maxRotateDeg, from.r ?? 0)) || 0)
        const scale = reducedMotion ? 1 : 0.978

        return (
          <div
            key={(child as any)?.key ?? i}
            ref={(node) => {
              if (node) itemRefs.current[i] = node
            }}
            style={{
              transform: `translate3d(${x0.toFixed(2)}px, ${y0.toFixed(2)}px, 0) rotate(${r0.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
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
  strengthY?: number
  strengthX?: number
  startAt?: number
  endAt?: number
  children?: React.ReactNode
}

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
  const lastTransformRef = useRef<{ x: number; y: number } | null>(null)
  const activeRef = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (reducedMotion) {
      activeRef.current = false
      lastTransformRef.current = { x: 0, y: 0 }
      el.style.transform = 'translate3d(0px, 0px, 0px)'
      return
    }

    let io: IntersectionObserver | null = null

    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          activeRef.current = Boolean(entries[0]?.isIntersecting)
        },
        {
          threshold: 0,
          rootMargin: '20% 0px 20% 0px',
        }
      )

      io.observe(el)
    }

    const unsubscribe = subscribeToSharedFrame(() => {
      if (!activeRef.current) return

      const rect = el.getBoundingClientRect()
      const vh = Math.max(1, window.innerHeight)
      const startPx = vh * startAt
      const endPx = vh * endAt
      const denom = Math.max(1, startPx - endPx)
      const p = clamp01((startPx - rect.top) / denom)
      const inv = 1 - p
      const x = Number((strengthX * inv).toFixed(2))
      const y = Number((strengthY * inv).toFixed(2))
      const lastTransform = lastTransformRef.current

      if (lastTransform && Math.abs(lastTransform.x - x) < 0.08 && Math.abs(lastTransform.y - y) < 0.08) {
        return
      }

      lastTransformRef.current = { x, y }
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
    })

    return () => {
      io?.disconnect()
      unsubscribe?.()
    }
  }, [endAt, reducedMotion, startAt, strengthX, strengthY])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: 'translate3d(0px, 0px, 0px)',
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

export function ScrollProgress({ heightPx = 2 }: ScrollProgressProps) {
  const reducedMotion = usePrefersReducedMotion()
  const barRef = useRef<HTMLDivElement | null>(null)
  const lastProgressRef = useRef(-1)

  useEffect(() => {
    const el = barRef.current
    if (!el || reducedMotion) return

    return subscribeToSharedFrame(() => {
      const doc = document.documentElement
      const max = Math.max(1, doc.scrollHeight - window.innerHeight)
      const p = clamp01(window.scrollY / max)

      if (Math.abs(lastProgressRef.current - p) < 0.0015) {
        return
      }

      lastProgressRef.current = p
      el.style.transform = `scaleX(${p.toFixed(4)})`
    })
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[60] w-full" style={{ height: heightPx }}>
      <div
        ref={barRef}
        className="h-full w-full origin-left bg-gradient-to-r from-indigo-500/70 via-emerald-500/60 to-sky-500/70"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  )
}

type DrawLineProps = {
  className?: string
  once?: boolean
}

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
          willChange: on ? 'auto' : 'transform',
        }}
        
      />
    </div>
  )
}