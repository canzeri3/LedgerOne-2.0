import type { Viewport } from 'next'
import { L1SiteAnimations } from '@/components/ledgerone'

const MARKETING_BACKGROUND = '#0D0E14'

/* Safari paints its status/address bars from the route's theme-color. The app
   shell uses #131415, while every public marketing page uses the slightly
   deeper #0D0E14 canvas. Advertising the exact marketing colour prevents the
   grey browser bands that otherwise appear above and below the page on iOS. */
export const viewport: Viewport = {
  themeColor: MARKETING_BACKGROUND,
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="l1-marketing">
      <L1SiteAnimations />
      {children}
    </div>
  )
}
