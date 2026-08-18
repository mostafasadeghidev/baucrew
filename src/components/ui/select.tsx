'use client'

import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'

/**
 * Native <select> with the look of a shadcn select trigger (border, ring on
 * focus, chevron on the right). Keeps native behaviour — including the mobile
 * picker — which matters on the site/warehouse tablets.
 */
export function Select({
  className = '',
  compact = false,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { compact?: boolean }) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        {...props}
        className={`w-full appearance-none rounded-md border border-border bg-surface text-foreground shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 ${
          compact ? 'py-1 pl-2.5 pr-7 text-xs' : 'py-2 pl-3 pr-9 text-sm'
        }`}
      />
      <ChevronDown
        aria-hidden
        className={`pointer-events-none absolute text-muted ${compact ? 'right-2 h-3.5 w-3.5' : 'right-3 h-4 w-4'}`}
      />
    </div>
  )
}
