import type { ReactNode } from 'react'
import { BackLink } from '../back-link'

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
  'flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm print:min-h-0 print:rounded-none print:border-0 print:px-0 print:shadow-none'

/** The page's name inside that bar. */
export const pageTitle = 'text-lg font-semibold tracking-tight'

/**
 * A page's bar, drawn the same way on every page: sixty-four pixels, the
 * height of the Projekte bar, whatever the page.
 *
 * It was drawn by hand on each page and had drifted to eleven different
 * heights between 64 and 160 pixels, for two reasons that repeated everywhere.
 * A sub-page stacked its back link on a line above its title, and a page with
 * something to explain stacked the explanation on a line below it. Click from
 * a list into one of its records and the top of the page jumped a third of
 * the way down; open a settings page with a long hint and the bar was taller
 * than a phone's width.
 *
 * So the back link stands inline, before the title, and the title truncates
 * rather than wrapping. What a page has to explain goes under the bar in a
 * `PageHint`, where it scrolls away with the page instead of staying pinned
 * to the top of the window at twice the height. `meta` is for the short thing
 * that belongs next to the name — a status, a period — and is never a
 * sentence.
 */
export function PageBar({
  back,
  title,
  meta,
  actions,
  className = '',
}: {
  /** The list this page belongs to — see `BackLink`. */
  back?: { href: string; label: string }
  title: ReactNode
  /** Short, beside the title: a status pill, "KW 37". Never a sentence. */
  meta?: ReactNode
  /** What can be done to the page, on the right. */
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`${pageToolbar} ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {back && <BackLink href={back.href} label={back.label} inline />}
        <h1 className={`min-w-0 truncate ${pageTitle}`}>{title}</h1>
        {meta}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * What a page has to say about itself, under its bar rather than inside it.
 * Place it directly after the page's `StickyHead`.
 */
export function PageHint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`px-1 text-sm text-muted ${className}`}>{children}</p>
}

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
 *
 * Under the bar hangs a strip of frosted glass exactly as tall as the gap
 * between the bar and the page's first sheet. At rest there is nothing behind
 * it but the page's own ground, so it cannot be seen. Once the page scrolls,
 * whatever passes under the bar is blurred for the height of that gap, so the
 * content reads as going *under* the bar rather than running into it — the two
 * used to meet edge to edge and look like one thing. The gap is 16px on most
 * pages and 24px on the detail pages and forms; the strip takes its height from
 * `--page-head-gap`, which globals.css sets from the container the bar sits in.
 *
 * The frost fades out downwards rather than stopping. A strip that ended in a
 * line drew a second hard edge a gap's height below the bar, and a strong blur
 * over so thin a band smeared every link and status pill into a coloured blob.
 * A lighter blur that dies away towards the content reads as the content
 * sinking under the bar, not as a band laid across it.
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
      className={`page-head sticky top-14 z-20 -mt-2 space-y-4 bg-background pt-2 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[var(--page-head-gap)] after:bg-background/40 after:backdrop-blur-sm after:[mask-image:linear-gradient(to_bottom,black,transparent)] after:[-webkit-mask-image:linear-gradient(to_bottom,black,transparent)] md:top-0 print:static print:bg-transparent print:after:hidden ${className}`}
    >
      {children}
    </div>
  )
}
