import './globals.css'
import type { Metadata } from 'next'
import SWRProvider from '@/lib/swr'
import AppShell from '@/components/common/AppShell'
import { Inter } from 'next/font/google'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
<html lang="en" className={`${inter.variable} scrollbar-auto-hide`}>
      {/* Body background set to rgb(19,20,21) (#131415) */}
<body className="antialiased font-sans bg-[#131415] overflow-x-hidden scrollbar-auto-hide">
        <SWRProvider>
          <AppShell>{children}</AppShell>
        </SWRProvider>
      </body>
    </html>
  )
}
