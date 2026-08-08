import './globals.css'
import './theme-light.css'
import type { Metadata, Viewport } from 'next'
import SWRProvider from '@/lib/swr'
import AppShell from '@/components/common/AppShell'
import PWAClient from '@/components/common/PWAClient'
import { ThemeProvider } from '@/lib/theme'
import { Inter, Sora, IBM_Plex_Sans } from 'next/font/google'

// Runs synchronously before first paint so the stored theme is applied with no
// flash. Marketing routes always keep the dark brand look (list mirrors
// MARKETING_ROUTES in AppShell / src/lib/theme.tsx).
const themeInitScript = `(function(){try{var m={'/':1,'/platform':1,'/how-it-works':1,'/use-cases':1,'/pricing':1,'/contact':1};if(m[window.location.pathname]){return;}if(window.localStorage.getItem('lg1-theme')==='light'){document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light';}}catch(e){}})();`

export const metadata: Metadata = {
  title: 'LedgerOne',
  description: 'Crypto planner & tracker',
  applicationName: 'LedgerOne',
  manifest: '/manifest.webmanifest',
  // Emits <meta name="apple-mobile-web-app-capable" content="yes">, which is
  // what makes an iPhone Home Screen launch open without Safari's top and
  // bottom bars (iOS below 16.4 ignores the manifest's display mode).
  appleWebApp: {
    capable: true,
    title: 'LedgerOne',
    // Keep the iOS Home Screen viewport below the status bar. WebKit can size
    // fixed/full-height content short in black-translucent mode, leaving the
    // bottom of the physical screen uncovered and top controls under the clock.
    statusBarStyle: 'black',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
  other: {
    // Next 15 only emits the standards-track `mobile-web-app-capable`, which
    // WebKit didn't honour until Safari 17. Without the Apple-prefixed tag,
    // iOS 16 and earlier still launch the Home Screen app inside Safari chrome.
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#131415',
  width: 'device-width',
  initialScale: 1,
  // Required for env(safe-area-inset-*) to report real values, so the app can
  // fill the screen while keeping content out of the notch and home indicator.
  viewportFit: 'cover',
}

// Load Inter (weights you actually use; add/remove as needed)
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
})

// App design-system fonts (dashboard/planner/portfolio/coins/audit typography).
// Sora = display/headings; IBM Plex Sans = ui/body/numbers (tabular-nums via tnum).
// Weights match the uploaded skin's font loading exactly.
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
})
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
<html lang="en" className={`${inter.variable} ${sora.variable} ${ibmPlexSans.variable} scrollbar-auto-hide`} suppressHydrationWarning>
      {/* Body background set to rgb(19,20,21) (#131415) */}
<body className="antialiased font-sans bg-[#131415] overflow-x-hidden scrollbar-auto-hide">
        {/* Apply persisted theme before paint (no flash of the wrong theme) */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <PWAClient />
        <SWRProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  )
}
