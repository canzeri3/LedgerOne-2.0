'use client'

import { useEffect } from 'react'

const REVEAL_SELECTORS = [
  '.l1-section-head',
  '.l1-feat',
  '.l1-flow-step',
  '.l1-case',
  '.l1-trust-cell',
  '.l1-trust',
  '.l1-agent-block',
  '.l1-terminal',
  '.l1-strip',
  '.l1-closing-cta',
  '.l1-spec',
  '.l1-cases-card',
  '.l1-footer-grid',
  '.l1-pricing-card',
  '.l1-faq-item',
].join(',')

const STAGGER_GROUPS = [
  '.l1-feat-grid',
  '.l1-flow',
  '.l1-cases',
  '.l1-trust-grid',
  '.l1-specs',
  '.l1-cases-grid',
  '.l1-pricing-grid',
]

const COUNTUP_SELECTORS = [
  '.l1-featured .stat .v',
  '.lp-kpi .val',
  '.l1-case-stat .v',
].join(',')

function animateCountUp(el: Element) {
  const raw = (el.textContent || '').trim()
  const match = raw.match(/[−-]?\d[\d,]*(?:\.\d+)?/)
  if (!match) return
  const rawNum = match[0]
  const idx = raw.indexOf(rawNum)
  const prefix = raw.slice(0, idx)
  const suffix = raw.slice(idx + rawNum.length)
  if (/[A-Za-z]/.test(prefix)) return
  const origSignChar = (rawNum.charAt(0) === '−' || rawNum.charAt(0) === '-') ? rawNum.charAt(0) : ''
  const cleaned = rawNum.replace(/,/g, '').replace(/−/g, '-')
  const target = parseFloat(cleaned)
  if (!isFinite(target) || target === 0) return
  const dotIdx = cleaned.indexOf('.')
  const decimals = dotIdx >= 0 ? cleaned.length - dotIdx - 1 : 0
  const hasCommas = rawNum.indexOf(',') >= 0
  const negative = target < 0
  const absTarget = Math.abs(target)

  function format(v: number) {
    let s = v.toFixed(decimals)
    if (hasCommas) {
      const parts = s.split('.')
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      s = parts.join('.')
    }
    return prefix + (negative ? (origSignChar || '−') : '') + s + suffix
  }

  const w = (el as HTMLElement).getBoundingClientRect().width
  if (w) {
    ;(el as HTMLElement).style.minWidth = w + 'px'
    ;(el as HTMLElement).style.display = (el as HTMLElement).style.display || 'inline-block'
  }

  const duration = 1300
  let startTs: number | null = null
  function tick(ts: number) {
    if (startTs === null) startTs = ts
    const t = Math.min(1, (ts - startTs) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    el.textContent = format(absTarget * eased)
    if (t < 1) requestAnimationFrame(tick)
    else el.textContent = format(absTarget)
  }
  el.textContent = format(0)
  requestAnimationFrame(tick)
}

function tagAndObserve() {
  const root = document.getElementById('__next') || document.body
  const els = root.querySelectorAll(REVEAL_SELECTORS)
  if (!els.length) return

  const vh = window.innerHeight || document.documentElement.clientHeight
  const threshold = vh * 0.88
  const toObserve: Element[] = []

  els.forEach((el) => {
    if (el.classList.contains('l1-reveal')) return
    const rect = el.getBoundingClientRect()
    if (rect.top >= threshold) {
      el.classList.add('l1-reveal')
      toObserve.push(el)
    }
  })

  STAGGER_GROUPS.forEach((groupSel) => {
    root.querySelectorAll(groupSel).forEach((grid) => {
      const items = grid.querySelectorAll('.l1-reveal')
      items.forEach((item, i) => {
        ;(item as HTMLElement).style.transitionDelay = Math.min(i * 70, 420) + 'ms'
      })
    })
  })

  if (!('IntersectionObserver' in window)) {
    toObserve.forEach((el) => el.classList.add('is-in'))
    return
  }

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          obs.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  )

  toObserve.forEach((el) => obs.observe(el))
}

function setupCountUps() {
  const root = document.getElementById('__next') || document.body
  const els = root.querySelectorAll(COUNTUP_SELECTORS)
  if (!els.length) return

  if (!('IntersectionObserver' in window)) {
    els.forEach(animateCountUp)
    return
  }

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCountUp(entry.target)
          obs.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.4 },
  )

  els.forEach((el) => obs.observe(el))
}

export function L1SiteAnimations() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    requestAnimationFrame(() => {
      tagAndObserve()
      setupCountUps()
    })
  }, [])

  return null
}
