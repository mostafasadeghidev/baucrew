/**
 * The bar a form wears: the page's name on the left, save and cancel on the
 * right, on the same sheet every other page's bar sits on.
 *
 * The two buttons used to sit at the foot of the form, which on a long one
 * meant scrolling past every field to reach them, and left the bar above
 * looking like a heading rather than the page's own controls. Here they are
 * where the eye already goes, and the bar sticks, so they never leave.
 *
 * It renders inside the `<form>` it belongs to, so the submit button needs no
 * `form` attribute and the pending state stays where it is kept.
 */
import Link from 'next/link'
import { btn } from './button'
import { pageTitle, pageToolbar, StickyHead } from './page-panel'

export function FormHead({
  title,
  saveLabel,
  cancelLabel,
  cancelHref,
  pending = false,
  className = '',
  extra,
}: {
  title: string
  saveLabel: string
  cancelLabel: string
  cancelHref: string
  pending?: boolean
  /** For a form laid out as a grid: the bar has to span every column. */
  className?: string
  /**
   * A control that belongs to the page rather than to a field — the template
   * picker on a new project. It goes in the bar so that nothing stands above
   * the bar: a page whose first row is not its own name reads as two pages.
   */
  extra?: React.ReactNode
}) {
  return (
    <StickyHead className={className}>
      <div className={pageToolbar}>
        <h1 className={pageTitle}>{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          <Link href={cancelHref} className={btn.outlineSm}>
            {cancelLabel}
          </Link>
          <button type="submit" disabled={pending} className={btn.primarySm}>
            {saveLabel}
          </button>
        </div>
      </div>
    </StickyHead>
  )
}
