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
