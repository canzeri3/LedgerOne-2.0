import './globals.css'
import './theme-light.css'
import type { Metadata } from 'next'
import SWRProvider from '@/lib/swr'
import AppShell from '@/components/common/AppShell'
import { ThemeProvider } from '@/lib/theme'
import { Inter, Sora, IBM_Plex_Sans } from 'next/font/google'

// Runs synchronously before first paint so the stored theme is applied with no
// flash. Marketing routes always keep the dark brand look (list mirrors
// MARKETING_ROUTES in AppShell / src/lib/theme.tsx).
const themeInitScript = `(function(){try{var m={'/':1,'/platform':1,'/how-it-works':1,'/use-cases':1,'/pricing':1,'/contact':1};if(m[window.location.pathname]){return;}if(window.localStorage.getItem('lg1-theme')==='light'){document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light';}}catch(e){}})();`

export const metadata: Metadata = {
  title: 'LedgerOne',
  description: 'Crypto planner & tracker',
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
        <SWRProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  )
}
