'use client'

import Link from 'next/link'

interface L1ClosingCTAProps {
  title?: string
  body?: string
  primary?: string
  secondary?: string
}

export function L1ClosingCTA({
  title = 'Stop reacting. Start compounding.',
  body = 'Define your risk profile and capital. The engine handles deployment, realization, and compounding across cycles — without intervention.',
  primary = 'Request access',
  secondary = 'Talk to our Team',
}: L1ClosingCTAProps) {
  const primaryHref = primary.toLowerCase() === 'request access' ? '/pricing' : '/contact'
  const secondaryHref = secondary.toLowerCase() === 'request access' ? '/pricing' : '/contact'

  return (
    <section className="l1-section" style={{ position: 'relative', zIndex: 3, paddingTop: 40, paddingBottom: 16 }}>
      <div className="l1-wrap">
        <div className="l1-close">
          <span className="l1-section-eyebrow" style={{ marginBottom: 18 }}>Get started</span>
          <h2>{title}</h2>
          <p>{body}</p>
          <div className="l1-close-cta">
            <Link href={primaryHref} className="l1-btn l1-btn-primary l1-btn-lg">{primary}</Link>
            <Link href={secondaryHref} className="l1-btn l1-btn-ghost l1-btn-lg">{secondary}</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
