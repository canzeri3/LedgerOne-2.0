'use client'

import { ReactNode } from 'react'
import { useIsMobile } from '@/lib/useMediaQuery'

/**
 * Picks the phone layout or the existing desktop tree. Both arrive as already-
 * serialized server output; only the branch we return actually mounts, so the
 * unused side never runs its hooks or fetches.
 */
export default function CoinMobileSwitch({
  mobile,
  children,
}: {
  mobile: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  return <>{isMobile ? mobile : children}</>
}
