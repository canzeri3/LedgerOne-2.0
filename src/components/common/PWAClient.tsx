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

    const measureSafeAreaTop = () => {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top)'
      root.appendChild(probe)
      const value = probe.getBoundingClientRect().height || 0
      probe.remove()
      return value
    }

    const applyStandaloneViewport = (standalone: boolean) => {
      if (!standalone) {
        root.style.removeProperty('--l1-pwa-viewport-gap')
        return
      }

      const safeTop = measureSafeAreaTop()
      const portrait =
        typeof window.matchMedia !== 'function' ||
        window.matchMedia('(orientation: portrait)').matches
      const screenBlock = portrait
        ? Math.max(window.screen.width, window.screen.height)
        : Math.min(window.screen.width, window.screen.height)
      const viewportBlock = Math.max(window.innerHeight || 0, root.clientHeight || 0)
      const measuredGap = Math.max(0, screenBlock - viewportBlock)

      // An opaque iOS status bar legitimately shortens the viewport from the
      // top, where safe-area-inset-top is zero. Only compensate when WebKit
      // reports that content is actually drawing under the status bar.
      const gap = safeTop > 0.5 ? Math.max(safeTop, measuredGap) : 0
      root.style.setProperty('--l1-pwa-viewport-gap', `${Math.min(120, Math.round(gap))}px`)
    }

    const applyStandalone = () => {
      const byMedia =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches
      const byLegacyIOS = (window.navigator as unknown as { standalone?: boolean }).standalone === true

      const standalone = byMedia || byLegacyIOS
      if (standalone) root.setAttribute('data-standalone', '1')
      else root.removeAttribute('data-standalone')
      applyStandaloneViewport(standalone)
    }

    applyStandalone()

    let mq: MediaQueryList | null = null
    if (typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(display-mode: standalone)')
      mq.addEventListener('change', applyStandalone)
    }
    window.addEventListener('resize', applyStandalone)
    window.addEventListener('orientationchange', applyStandalone)
    window.visualViewport?.addEventListener('resize', applyStandalone)

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
        window.removeEventListener('resize', applyStandalone)
        window.removeEventListener('orientationchange', applyStandalone)
        window.visualViewport?.removeEventListener('resize', applyStandalone)
      }
    }

    return () => {
      mq?.removeEventListener('change', applyStandalone)
      window.removeEventListener('resize', applyStandalone)
      window.removeEventListener('orientationchange', applyStandalone)
      window.visualViewport?.removeEventListener('resize', applyStandalone)
    }
  }, [])

  return null
}
