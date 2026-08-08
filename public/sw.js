/*
 * LedgerOne service worker.
 *
 * Deliberately conservative for a financial app:
 *  - Never caches HTML navigations. A cached shell could be served to a
 *    different (or signed-out) session later, so navigations are network-only
 *    with an offline fallback page.
 *  - Never touches /api/* or /auth/*, non-GET requests, or cross-origin
 *    requests (Supabase, price providers) — those always hit the network.
 *  - Caches only content-hashed build output and app icons, which are
 *    immutable and carry no user data.
 *
 * Bump VERSION to roll the cache.
 */
const VERSION = 'v3'
const STATIC_CACHE = `lg1-static-${VERSION}`
const OFFLINE_URL = '/offline.html'
const IS_LOCAL_DEVELOPMENT =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === '::1'

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    event.waitUntil(self.skipWaiting())
    return
  }

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => IS_LOCAL_DEVELOPMENT || k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => (IS_LOCAL_DEVELOPMENT ? self.registration.unregister() : undefined))
      .then(() => self.clients.claim())
  )
})

// Lets a new worker take over immediately when the page asks it to.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isCacheableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  // Never intercept a local development request. Dev chunk URLs are not
  // content-hashed and must always come from the running Next.js process.
  if (IS_LOCAL_DEVELOPMENT) return

  const { request } = event

  // Anything that mutates state, or isn't ours, goes straight to the network.
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // Navigations: always live. Fall back to the offline page only when the
  // network is genuinely unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())
      )
    )
    return
  }

  // Immutable build output and icons: cache-first, populate on first miss.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      })
    )
  }
})
