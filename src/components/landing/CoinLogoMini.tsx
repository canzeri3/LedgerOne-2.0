'use client'

import { useMemo, useState } from 'react'

type Props = {
  symbol: string
  name: string
  sizePx?: number
  className?: string
  fallbackText?: string
}

/**
 * Coin logo (UI-only).
 * Reliability strategy:
 * 1) Try local bundled icons in /public/icons/coins (always available, no network dependency)
 * 2) Fall back to multiple remote sources
 * 3) If all fail, degrade to letter (never breaks UI)
 *
 * NOTE: To truly “always load the logo”, you must bundle the icons you display (step 1).
 */
export function CoinLogoMini({ symbol, name, sizePx = 20, className = '', fallbackText }: Props) {
  const sym = (symbol || '').toLowerCase().trim()

  const alias = (s: string) => {
    // UI-only aliases
    if (s === 'xbt') return 'btc'
    if (s === 'miota') return 'iota'
    if (s === 'bcc') return 'bch'
    return s
  }

  const s = alias(sym)

  const sources = useMemo(() => {
    if (!s) return []
    const list: { url: string; srcSet?: string }[] = []

    // 0) LOCAL FIRST (best reliability): /public/icons/coins/<symbol>.svg
    // Example: public/icons/coins/btc.svg → /icons/coins/btc.svg
    list.push({ url: `/icons/coins/${s}.svg` })

    // 1) CryptoIcons (PNG)
    list.push({
      url: `https://cryptoicons.org/api/icon/${s}/200.png`,
      srcSet: `https://cryptoicons.org/api/icon/${s}/128.png 1x, https://cryptoicons.org/api/icon/${s}/200.png 2x`,
    })

    // 2) CoinCap assets (PNG)
    list.push({
      url: `https://assets.coincap.io/assets/icons/${s}.png`,
      srcSet: `https://assets.coincap.io/assets/icons/${s}.png 1x, https://assets.coincap.io/assets/icons/${s}@2x.png 2x`,
    })

    // 3) spothq PNG
    list.push({
      url: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png`,
      srcSet: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png 2x`,
    })

    // 4) spothq SVG (vector)
    list.push({
      url: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${s}.svg`,
    })

    return list
  }, [s])

  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)

  const fallback = (fallbackText || (symbol?.[0] ?? '?')).toUpperCase()

  // If no symbol or everything failed: fallback letter (still floating, no “circle background” look)
  if (!s || failed || sources.length === 0) {
    return (
      <div
        className={['flex items-center justify-center rounded-full text-[9px] font-semibold text-slate-300', className].join(
          ' ',
        )}
        style={{ width: sizePx, height: sizePx }}
        aria-label={`${name} logo`}
        title={name}
      >
        {fallback}
      </div>
    )
  }

  const current = sources[Math.min(idx, sources.length - 1)]

  return (
    <img
      key={current.url}
      src={current.url}
      srcSet={current.srcSet}
      sizes={`${sizePx}px`}
      alt={`${name} logo`}
      title={name}
      className={['rounded-full', className].join(' ')}
      style={{
        width: sizePx,
        height: sizePx,
        // subtle “floating” without a hard circle background:
        // (keeps it crisp on dark UI, but not a badge)
        filter: 'drop-shadow(0 1px 6px rgba(0,0,0,0.45))',
      }}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx < sources.length - 1) setIdx(idx + 1)
        else setFailed(true)
      }}
    />
  )
}
