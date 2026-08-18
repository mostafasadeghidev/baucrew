import type { ReactNode } from 'react'

/**
 * Card in the spirit of shadcn/ui: title, optional description, content.
 * Used for the settings sections so every block reads as its own panel.
 */
export function Card({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: ReactNode
  description?: ReactNode
  /** Right-aligned control in the header (link, button). */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface shadow-sm ${className}`}>
      {(title || description || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-1 max-w-2xl text-xs text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
