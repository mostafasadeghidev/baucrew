import { formerTitle } from '@/lib/project-title'

/**
 * The big title on a card's back: the customer and the trades, never typed
 * (src/lib/project-title.ts), the number beside it, and under it — small and
 * grey — what the card was called before, while that says more.
 */
export function CardTitle({ name, number, sourceTitle, formerLabel }: { name: string; number: string; sourceTitle: string | null; formerLabel: string }) {
  const before = formerTitle(name, sourceTitle)
  return (
    <div className="min-w-0 flex-1">
      <h2 className="min-w-0 break-words py-0.5 text-2xl font-semibold leading-tight">
        {name}
        <span className="ml-2 align-middle text-sm font-normal text-muted">{number}</span>
      </h2>
      {before && <FormerTitle text={before} label={formerLabel} />}
    </div>
  )
}

/** The old title as a line of its own, with what it is said for a screen reader and on hover. */
export function FormerTitle({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  return (
    <p title={label} className={`break-words text-sm text-muted ${className}`}>
      <span className="sr-only">{label}: </span>
      {text}
    </p>
  )
}
