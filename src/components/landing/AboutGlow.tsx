'use client'

import { useEffect, useRef, useState } from 'react'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(Boolean(mq.matches))
    onChange()

    // Safari <14 fallback
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

export function AboutGlow() {
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
        setInView(Boolean(entry?.isIntersecting))
      },
      {
        threshold: 0.2,
        rootMargin: '0px 0px -8% 0px',
      }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [reducedMotion])

  return (
    <>
      {/* Viewport trigger target (keeps observer tied to the actual glow area) */}
      <div
        ref={ref}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[19rem] w-[60rem] max-w-[98vw] -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className={`aboutGlowInner h-full w-full rounded-full transform-gpu ${inView ? 'aboutGlowInnerOn' : 'aboutGlowInnerOff'}`}
          style={{
            willChange: 'transform, opacity, filter',
            backgroundImage: `
              radial-gradient(ellipse 70% 64% at 50% 50%, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0.07) 22%, rgba(99,102,241,0.05) 46%, rgba(99,102,241,0.00) 82%),
              radial-gradient(ellipse 58% 52% at 50% 50%, rgba(56,189,248,0.05) 0%, rgba(56,189,248,0.05) 28%, rgba(56,189,248,0.025) 50%, rgba(56,189,248,0.00) 84%),
              radial-gradient(ellipse 48% 42% at 50% 50%, rgba(16,185,129,0.022) 0%, rgba(16,185,129,0.022) 32%, rgba(16,185,129,0.008) 54%, rgba(16,185,129,0.00) 86%)
            `,
          }}
        />
      </div>

      <style jsx>{`
        .aboutGlowInnerOff {
          opacity: 0;
          transform: scale(0.94);
          filter: blur(16px);
        }

        .aboutGlowInnerOn {
          opacity: 1;
          transform: scale(1);
          filter: blur(10px);
          animation:
            aboutGlowEnter 1500ms cubic-bezier(.16,.84,.2,1) both,
            aboutGlowBreathe 6.2s ease-in-out 1650ms infinite;
        }
        @keyframes aboutGlowEnter {
          0% {
            opacity: 0;
            transform: scale(0.95);
            filter: blur(18px);
          }
          72% {
            opacity: 0.96;
            transform: scale(1.008);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(10px);
          }
        }

        @keyframes aboutGlowBreathe {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(10px);
          }
          50% {
            opacity: 0.92;
            transform: scale(1.008);
            filter: blur(11px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .aboutGlowInnerOff,
          .aboutGlowInnerOn {
            opacity: 1;
            transform: scale(1);
            filter: blur(10px);
            animation: none;
          }
        }
      `}</style>
    </>
  )
}
