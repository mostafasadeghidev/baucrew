/** Projects controls share one 32px frame on the board and the table. */
const base = 'inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60'

export const projectControl = {
  button: `${base} border border-border-strong bg-surface text-foreground hover:bg-surface-hover`,
  primary: `${base} border border-transparent bg-accent text-accent-foreground hover:bg-accent-hover`,
  icon: `${base} w-8 border border-border-strong bg-surface !px-0 text-muted hover:bg-surface-hover hover:text-foreground`,
  tab: `${base} relative`,
  selected: 'bg-surface text-foreground ring-1 ring-inset ring-border',
  idle: 'text-muted hover:bg-surface/60 hover:text-foreground',
  group: 'inline-flex shrink-0 items-center gap-1 rounded-lg bg-subtle p-1',
  /** A board's tab: a quiet pill, grey behind the one that is open — like every page's tabs. */
  boardTab: 'relative flex h-8 max-w-56 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors',
  boardTabOn: 'bg-subtle text-foreground',
  boardTabOff: 'text-muted hover:bg-subtle/60 hover:text-foreground',
  /** Board and list: two icon pills, the same quiet grey behind the one in use. */
  viewGroup: 'inline-flex shrink-0 items-center gap-0.5',
  viewButton: 'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  viewOn: 'bg-subtle text-foreground',
  viewOff: 'text-muted hover:bg-subtle/60 hover:text-foreground',
  search: 'h-8 w-full min-w-0 rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring',
} as const
