import './globals.css'
import type { Metadata } from 'next'
import SWRProvider from '@/lib/swr'
import AppShell from '@/components/common/AppShell'

export const metadata: Metadata = {
  title: 'LedgerOne 2.0',
  description: 'Crypto planner & tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#050b18]">
        <SWRProvider>
          <AppShell>{children}</AppShell>
        </SWRProvider>
      </body>
    </html>
  )
}

