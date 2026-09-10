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

/**
 * Keeps a page's bar — and, where a page has one, the row of tabs under it —
 * at the top of the window while the rest of the page scrolls past.
 *
 * The eight pixels of air above the bar belong to this box, not to the page:
 * painted here they travel with the bar and hide whatever slides behind it, so
 * nothing shows through the gap between the window's edge and the card. The
 * negative margin gives those eight pixels back to the layout, so the bar
 * stands exactly where it stood before — it does not jump when it catches.
 *
 * `top-14` below md because the phone's own bar is 56 pixels of sticky header
 * above this one; from md up that bar is gone and this one goes to the top.
 *
 * `print:static` because a sticky box on paper is a box printed in the wrong
 * place, or on every page.
 */
export function StickyHead({
  children,
  className = '',
}: {
  children: React.ReactNode
  /** For a page laid out as a grid: the bar has to span every column. */
  className?: string
}) {
  return (
    <div
      className={`sticky top-14 z-20 -mt-2 space-y-4 bg-background pt-2 md:top-0 print:static print:bg-transparent ${className}`}
    >
      {children}
    </div>
  )
}
