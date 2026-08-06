'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker and marks the document when the app is running
 * as an installed standalone app.
 *
 * iOS below 16.4 doesn't support the `display-mode: standalone` media query, so
 * the legacy `navigator.standalone` flag is checked too. Safe-area CSS keys off
 * `html[data-standalone="1"]`, which keeps normal browser rendering untouched.
 */
export default function PWAClient() {
  useEffect(() => {
    const root = document.documentElement

    const applyStandalone = () => {
      const byMedia =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches
      const byLegacyIOS = (window.navigator as unknown as { standalone?: boolean }).standalone === true

      if (byMedia || byLegacyIOS) root.setAttribute('data-standalone', '1')
      else root.removeAttribute('data-standalone')
    }

    applyStandalone()

    let mq: MediaQueryList | null = null
    if (typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(display-mode: standalone)')
      mq.addEventListener('change', applyStandalone)
    }

    // Dev builds change chunk names constantly; a worker there only causes
    // stale-asset confusion, so register in production only.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const onLoad = () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
          /* registration is best-effort; the app works fine without it */
        })
      }
      if (document.readyState === 'complete') onLoad()
      else window.addEventListener('load', onLoad)

      return () => {
        window.removeEventListener('load', onLoad)
        mq?.removeEventListener('change', applyStandalone)
      }
    }

    return () => {
      mq?.removeEventListener('change', applyStandalone)
    }
  }, [])

  return null
}
