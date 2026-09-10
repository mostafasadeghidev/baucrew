/**
 * A note, printed the way it was typed but with its addresses made clickable.
 *
 * Notes taken over from the old board carry their attachments as a name and a
 * download address; `parseNotes` folds those two lines into one link and names
 * it after the file. Everything else keeps its line breaks, which is why this
 * is a stack of paragraphs rather than one block of pre-wrapped text: a link
 * cannot be a line of its own inside `white-space: pre-wrap` without the line
 * break turning into a stray blank line.
 *
 * Only `http` and `https` become links — `parseNotes` matches nothing else —
 * so a note can never carry a `javascript:` address into the page.
 */
import { ExternalLink } from 'lucide-react'
import { parseNotes } from '@/lib/rich-text'

export function NoteText({ text, className = '' }: { text: string; className?: string }) {
  const lines = parseNotes(text)
  return (
    <div className={`space-y-1 ${className}`}>
      {lines.map((line, i) => (
        <p key={i} className="min-h-[1lh] break-words">
          {line.map((segment, j) =>
            segment.href ? (
              <a
                key={j}
                href={segment.href}
                target="_blank"
                rel="noreferrer noopener"
                title={segment.title ?? segment.href}
                aria-label={segment.text === '' ? segment.title : undefined}
                // `align-[-0.15em]` rather than a baseline row: an icon has no
                // baseline of its own, so lined up on one it floats above the
                // words it belongs to.
                className="inline-flex max-w-full items-center gap-1 align-[-0.15em] text-accent hover:underline"
              >
                {segment.text !== '' && <span className="truncate">{segment.text}</span>}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            ) : (
              <span key={j}>{segment.text}</span>
            )
          )}
        </p>
      ))}
    </div>
  )
}
