import type { MetadataRoute } from 'next'

/**
 * Served at /manifest.webmanifest by Next's App Router convention.
 *
 * `display: 'standalone'` is what removes browser chrome on install. iOS 16.4+
 * honours it; older iOS relies on the `apple-mobile-web-app-capable` meta tag
 * emitted from the root layout's `appleWebApp` metadata.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LedgerOne — Crypto Planner & Tracker',
    short_name: 'LedgerOne',
    description: 'Crypto portfolio ledger, planner and analytics.',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#131415',
    theme_color: '#131415',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard' },
      { name: 'Planner', url: '/planner' },
      { name: 'Portfolio', url: '/portfolio' },
    ],
  }
}
