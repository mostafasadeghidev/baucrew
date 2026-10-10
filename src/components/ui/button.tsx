import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Button styles after Untitled UI — flat: a fill for the one thing to do, a
 * stronger hairline for everything else, no shadow on either. Shared class
 * strings — shared class strings so every
 * button in the app has the same height, radius, ring and disabled state.
 * Used both as `<Button>` and as `className={btn.primary}` on links/forms.
 */
/**
 * `active:scale-[0.97]` is the whole click. Half of these buttons navigate,
 * and a page that takes a moment to arrive leaves a person wondering whether
 * the click landed at all — the arrows above the week board most of all. The
 * press gives the answer immediately, before the server has said anything.
 * Small on purpose: a button that jumps is a button that was pressed by
 * accident. `transition-transform` is named beside `transition-colors` so the
 * spring back is as smooth as the way down.
 */
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[color,background-color,border-color,transform] duration-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 disabled:active:scale-100'

/**
 * The primary buttons carry a border too, the colour of nothing. Every other
 * variant has a one-pixel border and these did not, so a primary button stood
 * two pixels shorter than the outline button beside it — "Neues Projekt" next
 * to "Vorlagen", "Speichern" next to "Abbrechen", in every page's bar.
 */
export const btn = {
  primary: `${base} border border-transparent bg-accent h-9 px-3.5 text-accent-foreground hover:bg-accent-hover`,
  primarySm: `${base} border border-transparent bg-accent h-8 px-3 text-accent-foreground hover:bg-accent-hover`,
  outline: `${base} border border-border-strong bg-surface h-9 px-3.5 hover:bg-surface-hover`,
  outlineSm: `${base} border border-border-strong bg-surface h-8 px-3 hover:bg-surface-hover`,
  /** Smaller again: rows of controls that sit above content, not in it. */
  outlineXs: `${base} border border-border-strong bg-surface h-7 px-2.5 text-xs hover:bg-surface-hover`,
  ghost: `${base} h-8 px-3 text-muted hover:bg-surface-hover hover:text-foreground`,
  danger: `${base} border border-danger/40 h-9 px-3.5 text-danger hover:bg-danger/10`,
  dangerSm: `${base} border border-danger/40 h-8 px-3 text-danger hover:bg-danger/10`,
  icon: `${base} h-8 w-8 border border-border-strong bg-surface text-muted hover:bg-surface-hover hover:text-foreground`,
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
