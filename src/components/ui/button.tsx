import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Button styles in the spirit of shadcn/ui — shared class strings so every
 * button in the app has the same height, radius, ring and disabled state.
 * Used both as `<Button>` and as `className={btn.primary}` on links/forms.
 */
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60'

export const btn = {
  primary: `${base} bg-accent px-4 py-2 text-accent-foreground shadow-sm hover:bg-accent-hover`,
  primarySm: `${base} bg-accent px-3 py-1.5 text-accent-foreground shadow-sm hover:bg-accent-hover`,
  outline: `${base} border border-border bg-surface px-4 py-2 shadow-sm hover:bg-surface-hover`,
  outlineSm: `${base} border border-border bg-surface px-3 py-1.5 shadow-sm hover:bg-surface-hover`,
  ghost: `${base} px-3 py-1.5 text-muted hover:bg-surface-hover hover:text-foreground`,
  danger: `${base} border border-danger/40 px-4 py-2 text-danger shadow-sm hover:bg-danger/10`,
  dangerSm: `${base} border border-danger/40 px-3 py-1.5 text-danger shadow-sm hover:bg-danger/10`,
  icon: `${base} h-9 w-9 border border-border bg-surface text-muted shadow-sm hover:bg-surface-hover hover:text-foreground`,
} as const

export type ButtonVariant = keyof typeof btn

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; children?: ReactNode }) {
  return (
    <button {...props} className={`${btn[variant]} ${className}`}>
      {children}
    </button>
  )
}

/**
 * Button group (shadcn "button-group"): buttons sit flush next to each other
 * with a single shared border — used for the action bar of the work order.
 */
export function ButtonGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="group"
      className={`inline-flex items-center [&>*+*]:-ml-px [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none ${className}`}
    >
      {children}
    </div>
  )
}
