'use client'

import { useMemo, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Card from '@/components/ui/Card'
import BuyPlannerLadder from '@/components/planner/BuyPlannerLadder'
import SellPlannerCombinedCard from '@/components/planner/SellPlannerCombinedCard'
import SellPlannerLadder from '@/components/planner/SellPlannerLadder'
import SellPlannerHistory from '@/components/planner/SellPlannerHistory'

/**
 * Coins page planners under Add Trade.
 * - EXACT existing UI preserved.
 * - Collapsed by default (both cards).
 * - Smooth expand/collapse animation (max-height + opacity).
 * - Collapsed state uses the SAME header height as expanded, but without the header bottom border (no seam).
 * - Buy card: solid bg rgb(28,29,31), no ring/border/shadow.
 * - Sell card: solid bg rgb(28,29,31).
 * - Version selectors in Sell header slightly smaller.
 * - (This patch only disables the hover "jump" effect on these two cards.)
 */
export default function CoinPlannersUnderAddTrade() {
  const pathname = usePathname()
  const buyHostRef = useRef<HTMLDivElement | null>(null)
  const sellHostRef = useRef<HTMLDivElement | null>(null)

  // Resolve coin id (keeps existing behavior)
  const coinId = useMemo(() => {
    if (pathname) {
      const m = pathname.match(/\/coins\/([^/]+)/)
      if (m?.[1]) return m[1]
    }
    if (typeof document !== 'undefined') {
      const attrEl = document.querySelector('[data-coingecko-id]') as HTMLElement | null
      const metaEl = document.querySelector('meta[name="coingecko-id"]') as HTMLMetaElement | null
      return attrEl?.getAttribute('data-coingecko-id') || metaEl?.content || null
    }
    return null
  }, [pathname])

  function initCardCollapse(section: HTMLElement | null) {
    if (!section) return
    const header =
      (section.querySelector(':scope > div[class*="border-b"]') as HTMLElement | null) ||
      (section.firstElementChild as HTMLElement | null)
    const body = section.querySelector(':scope > .p-5') as HTMLElement | null
    if (!header || !body) return

    // Ensure header can host the chevron
    const cs = getComputedStyle(header)
    if (cs.position === 'static') header.style.position = 'relative'

    // Reserve room on the right for the chevron
    const currentPR = parseFloat(cs.paddingRight || '0') || 0
    const neededPR = 44
    if (currentPR < neededPR) header.style.paddingRight = `${neededPR}px`

    // Build chevron button (once)
    let btn = header.querySelector('[data-collapse-btn="true"]') as HTMLButtonElement | null
    if (!btn) {
      btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('aria-label', 'Toggle section')
      btn.setAttribute('data-collapse-btn', 'true')
      Object.assign(btn.style, {
        position: 'absolute',
        top: '50%',
        right: '12px',
        transform: 'translateY(-50%)',
        width: '28px',
        height: '28px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        padding: '0',
        margin: '0',
        cursor: 'pointer',
        lineHeight: '1',
        borderRadius: '6px',
        outline: 'none',
        zIndex: '1',
        color: 'inherit',
        opacity: '1',
      } as CSSStyleDeclaration)
      btn.addEventListener('mouseenter', () => (btn!.style.opacity = '0.9'))
      btn.addEventListener('mouseleave', () => (btn!.style.opacity = '1'))

      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '16')
      svg.setAttribute('height', '16')
      svg.style.transition = 'transform 160ms ease'
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute('fill', 'currentColor')
      path.setAttribute('d', 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z')
      svg.appendChild(path)
      btn.appendChild(svg)
      header.appendChild(btn)

      ;(section as any).__chevronSvg = svg
    }
    const svg: SVGSVGElement = (section as any).__chevronSvg

    // Initial collapsed styling — SAME header size as expanded (no seam)
    if (!(section as any).__collapsedInit) {
      section.setAttribute('data-collapsed', 'true')   // <-- set state first
      const bodyEl = body as HTMLElement
      bodyEl.style.display = 'none'
      bodyEl.style.maxHeight = '0px'
      bodyEl.style.opacity = '0'
      bodyEl.style.transition = 'max-height 220ms ease, opacity 180ms ease'
      bodyEl.style.willChange = 'max-height, opacity'
      bodyEl.style.overflow = 'hidden'

      header.classList.remove('border-b')
      header.style.paddingTop = '12px'
      header.style.paddingBottom = '12px'
      header.style.minHeight = '44px'
      section.style.paddingBottom = ''

      ;(section as any).__collapsedInit = true
    }

    // Animated toggle
    const toggle = () => {
      const isCollapsed = section.getAttribute('data-collapsed') !== 'false'
      const bodyEl = body as HTMLElement

      if (!(bodyEl as any).__animInit) {
        bodyEl.style.transition = 'max-height 220ms ease, opacity 180ms ease'
        bodyEl.style.willChange = 'max-height, opacity'
        bodyEl.style.overflow = 'hidden'
        ;(bodyEl as any).__animInit = true
      }

      if (isCollapsed) {
        // EXPAND
        bodyEl.style.display = ''
        bodyEl.style.opacity = '0'
        bodyEl.style.maxHeight = '0px'
        // force reflow
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        bodyEl.offsetHeight
        const target = `${bodyEl.scrollHeight}px`
        bodyEl.style.maxHeight = target
        bodyEl.style.opacity = '1'
        section.setAttribute('data-collapsed', 'false')

        header.classList.add('border-b')
        header.style.paddingTop = '12px'
        header.style.paddingBottom = '12px'
        header.style.minHeight = '44px'
        section.style.paddingBottom = ''
        svg.style.transform = 'rotate(180deg)'

        const onEnd = (e: TransitionEvent) => {
          if (e.propertyName !== 'max-height') return
          bodyEl.style.overflow = 'visible'
          bodyEl.style.maxHeight = 'none'
          bodyEl.removeEventListener('transitionend', onEnd)
        }
        bodyEl.addEventListener('transitionend', onEnd)
      } else {
        // COLLAPSE
        bodyEl.style.overflow = 'hidden'
        bodyEl.style.maxHeight = `${bodyEl.scrollHeight}px`
        // force reflow
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        bodyEl.offsetHeight

        bodyEl.style.maxHeight = '0px'
        bodyEl.style.opacity = '0'
        section.setAttribute('data-collapsed', 'true')

        header.classList.remove('border-b')
        header.style.paddingTop = '12px'
        header.style.paddingBottom = '12px'
        header.style.minHeight = '44px'
        section.style.paddingBottom = ''
        svg.style.transform = 'rotate(0deg)'

        const onEnd = (e: TransitionEvent) => {
          if (e.propertyName !== 'max-height') return
          bodyEl.style.display = 'none'
          bodyEl.removeEventListener('transitionend', onEnd)
        }
        bodyEl.addEventListener('transitionend', onEnd)
      }
    }

    const onChevronClick = (e: MouseEvent) => {
      e.stopPropagation()
      toggle()
    }

    const INTERACTIVE_SELECTOR = [
      'button',
      '[role="button"]',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[contenteditable="true"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="menuitem"]',
      '[data-state]',
      '[data-radix-collection-item]',
      '[data-version-selector]',
      '[data-ignore-collapse]',
      '[aria-controls]',
    ].join(',')

    const onHeaderClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.closest(INTERACTIVE_SELECTOR) && header.contains(target)) return
      toggle()
    }

    if (!(section as any).__collapseChevronHandler) {
      const btn = header.querySelector('[data-collapse-btn="true"]') as HTMLButtonElement
      btn.addEventListener('click', onChevronClick)
      header.addEventListener('click', onHeaderClick)
      ;(section as any).__collapseBtn = btn
      ;(section as any).__collapseChevronHandler = onChevronClick
      ;(section as any).__collapseHeaderHandler = onHeaderClick
    }
  }

  function cleanupCardCollapse(section: HTMLElement | null) {
    if (!section) return
    const header =
      (section.querySelector(':scope > div[class*="border-b"]') as HTMLElement | null) ||
      (section.firstElementChild as HTMLElement | null)
    const btn = (section as any).__collapseBtn as HTMLButtonElement | undefined
    const onChevronClick = (section as any).__collapseChevronHandler as
      | ((e: MouseEvent) => void)
      | undefined
    const onHeaderClick = (section as any).__collapseHeaderHandler as
      | ((e: MouseEvent) => void)
      | undefined
    if (btn && onChevronClick) btn.removeEventListener('click', onChevronClick)
    if (header && onHeaderClick) header.removeEventListener('click', onHeaderClick)
    if (btn) btn.remove()
    ;(section as any).__collapseBtn = undefined
    ;(section as any).__collapseChevronHandler = undefined
    ;(section as any).__collapseHeaderHandler = undefined

    // Remove the no-hover fix
    const enter = (section as any).__noHoverEnter as ((e: MouseEvent) => void) | undefined
    const leave = (section as any).__noHoverLeave as ((e: MouseEvent) => void) | undefined
    if (enter) section.removeEventListener('mouseenter', enter)
    if (leave) section.removeEventListener('mouseleave', leave)
    section.style.transition = ''
    section.style.transform = ''
    ;(section as any).__noHoverEnter = undefined
    ;(section as any).__noHoverLeave = undefined
  }

  /** Disable hover "jump" on the given card <section> (no UI/layout changes). */
  function applyNoHoverJump(section: HTMLElement) {
    // Force no transition on the card itself
    section.style.transition = 'none'

    const onEnter = () => {
      // Inline style beats stylesheet hover transforms
      section.style.transform = 'none'
      section.style.boxShadow = section.style.boxShadow // no change, but keeps in place
    }
    const onLeave = () => {
      section.style.transform = 'none'
    }

    section.addEventListener('mouseenter', onEnter)
    section.addEventListener('mouseleave', onLeave)
    ;(section as any).__noHoverEnter = onEnter
    ;(section as any).__noHoverLeave = onLeave
  }

  /** Helper: returns true when the direct child section + header + body exist */
  function hasCardStructure(host: HTMLElement | null): host is HTMLElement {
    if (!host) return false as any
    const section = host.querySelector(':scope > section') as HTMLElement | null
    if (!section) return false as any
    const header =
      (section.querySelector(':scope > div[class*="border-b"]') as HTMLElement | null) ||
      (section.firstElementChild as HTMLElement | null)
    const body = section.querySelector(':scope > .p-5') as HTMLElement | null
    return !!(header && body) as any
  }

  /**
   * Attach collapse logic the moment the DOM is ready (handles client-side nav).
   * Falls back to MutationObserver watching the host subtree and auto-cleans.
   * Optionally runs an extra initializer (we use it to apply the no-hover fix).
   */
  function attachWhenReady(host: HTMLElement | null, extraInit?: (section: HTMLElement) => void) {
    if (!host) return () => {}

    // Fast path: if the structure is ready now.
    let section = host.querySelector(':scope > section') as HTMLElement | null
    if (section) {
      const header =
        (section.querySelector(':scope > div[class*="border-b"]') as HTMLElement | null) ||
        (section.firstElementChild as HTMLElement | null)
      const body = section.querySelector(':scope > .p-5') as HTMLElement | null
      if (header && body) {
        // Apply only the hover neutralization; no UI/layout changes
        applyNoHoverJump(section)
        extraInit?.(section)
        initCardCollapse(section)
        return () => cleanupCardCollapse(section)
      }
    }

    // Slow path: observe until the structure appears (handles CSR route transitions)
    const observer = new MutationObserver(() => {
      section = host.querySelector(':scope > section') as HTMLElement | null
      if (!section) return
      const header =
        (section.querySelector(':scope > div[class*="border-b"]') as HTMLElement | null) ||
        (section.firstElementChild as HTMLElement | null)
      const body = section.querySelector(':scope > .p-5') as HTMLElement | null
      if (header && body) {
        observer.disconnect()
        applyNoHoverJump(section!)
        extraInit?.(section!)
        initCardCollapse(section!)
      }
    })
    observer.observe(host, { childList: true, subtree: true })

    // Cleanup function
    return () => {
      observer.disconnect()
      if (section) cleanupCardCollapse(section)
    }
  }

  // BUY: init collapse + disable hover jump
  useLayoutEffect(() => {
    const host = buyHostRef.current
    if (!host) return
    return attachWhenReady(host)
  }, [])

  // SELL: color, version selectors sizing, init collapse + disable hover jump
  useLayoutEffect(() => {
    const host = sellHostRef.current
    if (!host) return
    return attachWhenReady(host, (section) => {
      // Color the Sell Planner card only on the coins page
      section.style.backgroundColor = 'rgb(28,29,31)'
      section.style.borderColor = 'rgb(28,29,31)'
      section.style.backgroundImage = 'none'

      // Make the Sell version selectors smaller (coins page only)
      const header =
        (section.querySelector(':scope > div[class*="border-b"]') as HTMLElement | null) ||
        (section.firstElementChild as HTMLElement | null)
      if (header) {
        const vs = header.querySelector('[data-version-selector]') as HTMLElement | null
        const vsFallback =
          vs ||
          (header.querySelector('[role="tablist"]') as HTMLElement | null) ||
          (header.querySelector('[data-radix-collection-item]')?.parentElement as HTMLElement | null)

        if (vsFallback) {
          vsFallback.style.fontSize = '9px'
          ;(vsFallback.style as any).gap = '2px'
          vsFallback.style.lineHeight = '1.0'
          vsFallback.style.letterSpacing = '0'

          vsFallback.querySelectorAll('button,[role="tab"]').forEach((el) => {
            const btn = el as HTMLElement
            btn.style.padding = '0 4px'
            btn.style.minHeight = '16px'
            btn.style.height = '16px'
            btn.style.fontSize = '9px'
            btn.style.borderRadius = '4px'
          })

          vsFallback.querySelectorAll('button svg,[role="tab"] svg').forEach((svgEl) => {
            const s = svgEl as SVGElement
            s.setAttribute('width', '10')
            s.setAttribute('height', '10')
          })
        }
      }
    })
  }, [])

  if (!coinId) return null

  return (
    <div className="space-y-4">
      {/* BUY — small top margin so it "floats" beneath Add Trade */}
      <div ref={buyHostRef} className="mt-11 px-6 md:px-8 lg:px-6">
        <Card
          title="Buy Planner"
          className="bg-[rgb(28,29,31)] border-0 ring-0 shadow-none [background-image:none] transition-none hover:translate-y-0 hover:shadow-none hover:scale-100"
        >
          <BuyPlannerLadder coingeckoId={coinId} />
        </Card>
      </div>

      {/* SELL — unchanged structure; the section is styled in useLayoutEffect */}
      <div ref={sellHostRef} className="px-6 md:px-8 lg:px-6">
        <SellPlannerCombinedCard
          title="Sell Planner"
          newestFirst={true}
          ActiveView={<SellPlannerLadder coingeckoId={coinId} />}
          HistoryView={<SellPlannerHistory coingeckoId={coinId} />}
        />
      </div>
    </div>
  )
}
