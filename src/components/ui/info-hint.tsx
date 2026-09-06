/**
 * A small ⓘ next to a label that explains it. No JavaScript: the bubble
 * shows while the mark is hovered (mouse), and a `<details>` element opens
 * it on a tap or a keypress (touchscreens, keyboards). The bubble sits
 * beside the details, not inside it — a closed details hides its content
 * whatever the CSS says — and is shown when the wrapper is hovered or the
 * details is open.
 */
export function InfoHint({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`group relative inline-flex align-middle ${className}`}>
      <details className="inline-flex">
        <summary
          aria-label={text}
          className="flex h-4 w-4 cursor-help list-none items-center justify-center rounded-full border border-border text-[10px] font-semibold not-italic leading-none text-muted hover:border-foreground hover:text-foreground focus:outline-none focus-visible:border-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden"
        >
          i
        </summary>
      </details>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-64 rounded-md border border-border bg-surface p-2.5 text-left text-xs font-normal not-italic leading-snug text-foreground shadow-md group-hover:block group-has-[[open]]:block"
      >
        {text}
      </span>
    </span>
  )
}
