import * as React from 'react'

type SectionCardProps = {
  title: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/**
 * SectionCard
 * Server-friendly card shell that visually matches your stat / Add Trade cards
 * without depending on '@/components/ui/card' exports.
 *
 * If you later want to swap back to shadcn/ui's Card, you can, but this removes
 * the runtime "Element type is invalid" risk entirely.
 */
export default function SectionCard({
  title,
  description,
  actions,
  children,
  className
}: SectionCardProps) {
  return (
    <div
      className={[
        // Outer "Card" shell — mirror your site’s card style
        // (rounded corners, subtle border, padded content)
        'rounded-2xl border border-white/10 bg-black/30 backdrop-blur',
        'p-4 md:p-6',
        className || '',
      ].join(' ')}
    >
      <div className="flex flex-row items-start justify-between gap-4 mb-3 md:mb-4">
        <div>
          <h3 className="text-base md:text-lg font-medium">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs md:text-sm text-white/60">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {/* Content */}
      <div className="pt-0">
        {children}
      </div>
    </div>
  )
}

