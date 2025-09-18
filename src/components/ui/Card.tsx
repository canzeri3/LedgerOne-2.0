import * as React from 'react'

/** Minimal className combiner (avoids extra deps) */
function cn(...inputs: Array<string | undefined | null | false>) {
  return inputs.filter(Boolean).join(' ')
}

/**
 * Named shadcn-style primitives
 */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-2xl border border-white/10 bg-black/30 backdrop-blur', className)}
      {...props}
    />
  )
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4 md:p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base md:text-lg font-medium leading-none', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs md:text-sm text-white/60', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 md:p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 md:p-6 pt-0', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

/**
 * Default export: a convenience wrapper that supports
 * title / subtitle / headerRight, matching how PlannerPage uses <Card ...>.
 * This keeps existing named imports working, and fixes default-import usage.
 */
export type DefaultCardProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string
  subtitle?: string
  headerRight?: React.ReactNode
  contentClassName?: string
}

const DefaultCard = React.forwardRef<HTMLDivElement, DefaultCardProps>(
  ({ title, subtitle, headerRight, className, children, contentClassName, ...props }, ref) => {
    const hasHeader = Boolean(title || subtitle || headerRight)
    return (
      <Card ref={ref} className={className} {...props}>
        {hasHeader ? (
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              {title ? <CardTitle>{title}</CardTitle> : null}
              {subtitle ? <CardDescription className="mt-1">{subtitle}</CardDescription> : null}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </CardHeader>
        ) : null}
        <CardContent className={cn(hasHeader ? 'pt-0' : '', contentClassName)}>
          {children}
        </CardContent>
      </Card>
    )
  }
)
DefaultCard.displayName = 'DefaultCard'

export default DefaultCard
