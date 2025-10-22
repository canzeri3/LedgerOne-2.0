'use client'

import React, { useMemo, useState } from 'react'

type Props = {
  symbol: string
  name?: string
  /** Keep your existing sizing by passing the same classes your circle used (e.g., "h-8 w-8 md:h-10 md:w-10") */
  className?: string
}

/** Ultra-robust, UI-only logo loader with graceful fallbacks + HiDPI. */
export default function CoinLogo({ symbol, name, className = 'h-8 w-8 md:h-10 md:w-10' }: Props) {
  const sym0 = (symbol || '').toLowerCase().trim()
  const alias = (s: string) => {
    if (s === 'xbt') return 'btc'
    if (s === 'miota') return 'iota'
    if (s === 'bcc') return 'bch'
    return s
  }
  const s = alias(sym0)

  const sources = useMemo(() => {
    const list: { url: string; srcSet?: string }[] = []
    // 1) CryptoIcons API (PNG; dynamically served)
    list.push({
      url: `https://cryptoicons.org/api/icon/${s}/200.png`,
      srcSet: `https://cryptoicons.org/api/icon/${s}/128.png 1x, https://cryptoicons.org/api/icon/${s}/200.png 2x`,
    })
    // 2) CoinCap (PNG with @2x)
    list.push({
      url: `https://assets.coincap.io/assets/icons/${s}@2x.png`,
      srcSet: `https://assets.coincap.io/assets/icons/${s}.png 1x, https://assets.coincap.io/assets/icons/${s}@2x.png 2x`,
    })
    // 3) spothq PNG
    list.push({
      url: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png`,
      srcSet: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png 2x`,
    })
    // 4) spothq SVG
    list.push({
      url: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${s}.svg`,
    })
    return list
  }, [s])

  const [idx, setIdx] = useState(0)
  const [hidden, setHidden] = useState(false)
  if (!s || hidden) return null

  const current = sources[idx]
  return (
    <img
      key={current.url}
      src={current.url}
      srcSet={current.srcSet}
      sizes="(min-width: 768px) 40px, 32px"
      alt={`${name || symbol} logo`}
      className={`rounded-full shadow-sm ${className}`}
      onError={() => {
        if (idx < sources.length - 1) setIdx(idx + 1)
        else setHidden(true)
      }}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  )
}

