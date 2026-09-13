/**
 * How a toggle in the scheduling controls looks: the same words whichever way
 * it stands, and a small switch beside them that says on or off. Shared by the
 * toggles the server draws as links and the one on the map that answers to
 * what happens on the map itself, so the two can never drift apart.
 */

/** The toggle's own classes. A locked toggle is on and not the reader's to change. */
export function toggleLook({ active, locked }: { active: boolean; locked: boolean }): string {
  return `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
    locked ? 'text-foreground opacity-50' : active ? 'text-foreground' : 'text-muted'
  }`
}

/**
 * Not `surface-hover`: in the light theme that token is the very colour of the
 * sheet these toggles sit on, so hovering a switched-on toggle painted it its
 * own background and nothing moved. The accent is a tint of the switch beside it.
 */
export const toggleHover = 'hover:bg-accent/10 hover:text-foreground'

/**
 * A switch that is on but cannot be moved keeps the colour of a switch that is
 * on — same accent track, same knob on the right — and only fades. Draining the
 * colour out made it read as off, which is the one thing it is not.
 */
export function ToggleKnob({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border transition-colors ${
        active ? 'border-accent bg-accent' : 'border-border bg-subtle'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? 'ml-auto mr-0.5 bg-white' : 'ml-0.5 bg-muted'}`} />
    </span>
  )
}
