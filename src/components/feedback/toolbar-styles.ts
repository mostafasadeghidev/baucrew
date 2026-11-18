// The comment tools float over every page of the app, so they are drawn in
// the page's inverse — ink on the light theme, paper on the dark one — and
// stand apart from whatever lies under them. One height, one icon size.

export const toolbarShell =
  'pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-full bg-foreground p-1 text-background shadow-2xl [scrollbar-width:none]'

export const toolbarDivider = 'mx-1 h-5 w-px shrink-0 bg-background/20'

/** `on`: the tool in use. `primary`: the one thing to do (Fertig, the comment). */
export function toolbarButton(on: boolean, primary = false): string {
  const base =
    'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 [&>span]:hidden sm:[&>span]:inline'
  if (primary) return `${base} bg-accent text-accent-foreground hover:bg-accent-hover`
  return `${base} ${on ? 'bg-background/15 text-background' : 'text-background/75 hover:bg-background/10 hover:text-background'}`
}

// The dashboard's own quiet buttons. Each is one whole class string: a size
// laid over another button's size fights it, and the icon is what gives way.
const quiet =
  'inline-flex shrink-0 items-center justify-center font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0'

/** A square icon button, 32px, its icon 16px. */
export const iconButton = `${quiet} h-8 w-8 rounded-lg`

/** A small text button with an icon, inside a form or a figure. */
export const ghostXs = `${quiet} h-7 gap-1.5 rounded-md px-2 text-xs`

/** The minimised comment tools: one pill to bring them back. */
export const launcher =
  'pointer-events-auto flex items-center gap-2 rounded-full bg-foreground py-1 pl-3 pr-1 text-background shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
