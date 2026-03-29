'use client'

import { useEffect, useState } from 'react'

export function usePrefersReducedMotion(): boolean {
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
