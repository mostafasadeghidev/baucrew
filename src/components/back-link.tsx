import Link from 'next/link'

/** Consistent "← back to list" pill used at the top of detail/sub pages. */
export const backLinkClass =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-sm font-medium text-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-foreground'

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={backLinkClass}>
      <span aria-hidden className="text-base leading-none">←</span>
      {label}
    </Link>
  )
}
