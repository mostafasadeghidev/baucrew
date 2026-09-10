/**
 * The sheet a page's body sits on.
 *
 * The rail became a panel standing on the page; the body was still lying flat
 * on it, so the window read as one framed thing and one unframed thing. This
 * gives the body the same frame: the same border, the same corners, the same
 * quiet shadow.
 *
 * The page's own title row stays outside it. That row is where you act on the
 * page — new project, import, print — and those buttons belong to the page,
 * not to the sheet of content under them; putting them inside the frame makes
 * the frame look like it starts in the wrong place.
 *
 * `divide` rather than padding between sections: a table wants to run to the
 * edges of the sheet, so the sheet carries no padding of its own and each
 * section brings its own.
 *
 * It disappears in print — a printed page is already a sheet.
 */
export function PagePanel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border bg-surface shadow-sm print:rounded-none print:border-0 print:shadow-none ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * The bar a page wears above its sheet: the page's name on the left, the
 * things you can do to it on the right, on a sheet of its own.
 *
 * The name used to be there only for screen readers and for phones — on a
 * desktop the sidebar was the only thing saying which page you were on, and
 * the buttons floated on the page background with nothing to belong to. Now
 * they belong to the bar, and the bar sits beside the sheet under it the way
 * two cards sit beside each other.
 *
 * In print the frame goes and the name stays: a printed sheet has no chrome,
 * but it does need to say what it is.
 */
export const pageToolbar =
  'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm print:rounded-none print:border-0 print:px-0 print:shadow-none'

/** The page's name inside that bar. */
export const pageTitle = 'text-lg font-semibold tracking-tight'
