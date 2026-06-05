import { Sora, DM_Sans, JetBrains_Mono } from 'next/font/google'
import { L1SiteAnimations } from '@/components/ledgerone'

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--l1-sora',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--l1-dm-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--l1-jb-mono',
  display: 'swap',
})

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`l1-marketing ${sora.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <L1SiteAnimations />
      {children}
    </div>
  )
}
