import type { ReactNode } from 'react'
import { BackLink } from '../back-link'

/**
 * A block of content inside the page's panel: a table, a list, a chart.
 *
 * The page itself is the white panel now (see PanelFrame), so a block is
 * framed by a hairline and rounded corners and nothing else — no shadow, no
 * second colour. One frame deep: a block inside a block is a divider, not
 * another box.
 *
 * `divide` rather than padding between sections: a table wants to run to the
 * edges of the block, so the block carries no padding of its own and each
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
      className={`overflow-hidden rounded-xl border border-border bg-surface print:rounded-none print:border-0 ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * The one row at the top of the panel: the page's name, its tabs, and what
 * can be done to it on the right — all on one line, the way Framer, Webflow
 * and Trello keep their bars.
 *
 * Not a box of its own: it is the head of the panel, set off from the content
 * by the rule `StickyHead` draws under it. Fifty-six pixels high on every
 * page, whatever it holds; only a screen too narrow for it wraps it.
 */
export const pageToolbar =
  'flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 print:min-h-0 print:py-0'

/** The hairline between a page's name and its tabs in that row. */
export function HeadDivider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-border print:hidden" />
}

/** The page's name inside that bar. */
export const pageTitle = 'text-base font-semibold tracking-tight text-foreground'

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
  tabs,
  actions,
  className = '',
}: {
  /** The list this page belongs to — see `BackLink`. */
  back?: { href: string; label: string }
  title: ReactNode
  /** Short, beside the title: a status pill, "KW 37". Never a sentence. */
  meta?: ReactNode
  /** The page's tabs, in the same row after its name. */
  tabs?: ReactNode
  /** What can be done to the page, on the right. */
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`${pageToolbar} ${className}`}>
      {/* The name keeps at least ten rem: when the buttons would leave it less,
          they wrap onto a line of their own instead of squeezing it to nothing.
          On that line they shrink to the bar and wrap among themselves — a bar
          that could not shrink ran off a phone's screen with the last buttons. */}
      {/* With tabs the group asks for its whole width (flex-auto, not
          flex-1's zero basis), so a head too narrow for name, tabs and actions
          wraps the actions under them instead of squeezing the tabs away. */}
      <div className={`flex min-w-[10rem] items-center gap-3 ${tabs ? 'flex-auto' : 'flex-1'}`}>
        {back && <BackLink href={back.href} label={back.label} inline />}
        <h1 className={`truncate ${tabs ? 'shrink-0' : 'min-w-0'} ${pageTitle}`}>{title}</h1>
        {meta}
        {tabs && (
          <>
            <HeadDivider />
            <div className="min-w-0 print:hidden">{tabs}</div>
          </>
        )}
      </div>
      {actions && <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
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
 * The head of the page's panel — its bar, and where a page has them the tabs
 * under it — kept at the top while the rest of the page scrolls past.
 *
 * It runs the full width of the panel, edge to edge (the negative margins
 * give back the panel's padding), with one rule under it. That rule is the
 * only line between the page's navigation and its content: no box around the
 * bar, no second box around the tabs.
 *
 * Its resting place is exactly where it sticks — the top of the panel, eight
 * pixels under the window's edge on a desktop (the frame), under the phone's
 * 56-pixel bar below md — so it never jumps when it catches.
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
      className={`page-head sticky top-14 z-20 -mx-4 -mt-4 border-b border-border bg-surface px-4 md:top-2 md:-ml-6 md:-mr-8 md:-mt-6 md:pl-6 md:pr-8 print:static print:mx-0 print:mt-0 print:border-0 print:px-0 ${className}`}
    >
      {children}
    </div>
  )
}
