/**
 * A note — a card's description, a comment — drawn the way Trello draws one:
 * its little Markdown (headings, lists, quotes, bold, italic, code, links)
 * read by `markdownBlocks`, addresses made clickable, and every line where it
 * was typed.
 *
 * Notes taken over from the old board carry their attachments as a name and a
 * download address; `parseNotes` folds those two lines into one link and names
 * it after the file. Only `http` and `https` become links, so a note can never
 * carry a `javascript:` address into the page, and nothing in it becomes
 * markup: the tree is drawn with the page's own elements.
 *
 * `decorate` lets the caller dress plain words — a comment marks the people
 * it names.
 */
import { Fragment, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { markdownBlocks, type Block, type Inline } from '@/lib/markdown'

type Decorate = (text: string, key: string) => ReactNode

function Inlines({ items, decorate, prefix }: { items: Inline[]; decorate?: Decorate; prefix: string }) {
  return (
    <>
      {items.map((item, i) => {
        const key = `${prefix}-${i}`
        switch (item.t) {
          case 'text':
            return decorate ? <Fragment key={key}>{decorate(item.text, key)}</Fragment> : <Fragment key={key}>{item.text}</Fragment>
          case 'code':
            return (
              <code key={key} className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.9em]">
                {item.text}
              </code>
            )
          case 'b':
            return (
              <strong key={key} className="font-semibold text-foreground">
                <Inlines items={item.children} decorate={decorate} prefix={key} />
              </strong>
            )
          case 'i':
            return (
              <em key={key}>
                <Inlines items={item.children} decorate={decorate} prefix={key} />
              </em>
            )
          case 's':
            return (
              <del key={key}>
                <Inlines items={item.children} decorate={decorate} prefix={key} />
              </del>
            )
          case 'link':
            return (
              <a
                key={key}
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                title={item.title ?? item.href}
                aria-label={item.text === '' ? item.title : undefined}
                // `align-[-0.15em]` rather than a baseline row: an icon has no
                // baseline of its own, so lined up on one it floats above the
                // words it belongs to.
                className="inline-flex max-w-full items-center gap-1 align-[-0.15em] text-accent hover:underline"
              >
                {item.text !== '' && <span className="truncate">{item.text}</span>}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            )
        }
      })}
    </>
  )
}

/** Consecutive list lines as one list, as Trello draws them. */
function group(blocks: Block[]): Array<Block | { t: 'list'; ordered: boolean; start: number; items: Array<Extract<Block, { t: 'li' }>> }> {
  const out: Array<Block | { t: 'list'; ordered: boolean; start: number; items: Array<Extract<Block, { t: 'li' }>> }> = []
  for (const block of blocks) {
    const last = out[out.length - 1]
    if (block.t === 'li') {
      if (last && last.t === 'list' && last.ordered === block.ordered) last.items.push(block)
      else out.push({ t: 'list', ordered: block.ordered, start: block.n || 1, items: [block] })
    } else out.push(block)
  }
  return out
}

export function NoteText({ text, className = '', decorate }: { text: string; className?: string; decorate?: Decorate }) {
  const blocks = group(markdownBlocks(text))
  return (
    <div className={`space-y-1 ${className}`}>
      {blocks.map((block, i) => {
        const key = String(i)
        switch (block.t) {
          case 'h1':
            return (
              <p key={key} className="pt-1 text-lg font-semibold text-foreground">
                <Inlines items={block.inlines} decorate={decorate} prefix={key} />
              </p>
            )
          case 'h2':
            return (
              <p key={key} className="pt-1 text-base font-semibold text-foreground">
                <Inlines items={block.inlines} decorate={decorate} prefix={key} />
              </p>
            )
          case 'h3':
            return (
              <p key={key} className="font-semibold text-foreground">
                <Inlines items={block.inlines} decorate={decorate} prefix={key} />
              </p>
            )
          case 'quote':
            return (
              <p key={key} className="border-l-2 border-border pl-3 italic">
                <Inlines items={block.inlines} decorate={decorate} prefix={key} />
              </p>
            )
          case 'hr':
            return <hr key={key} className="my-2 border-border" />
          case 'pre':
            return (
              <pre key={key} className="overflow-x-auto whitespace-pre-wrap rounded-md bg-subtle p-2 font-mono text-xs text-foreground">
                {block.text}
              </pre>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={key} start={block.ordered ? block.start : undefined} className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-0.5 pl-5`}>
                {block.items.map((item, j) => (
                  <li key={j} className="break-words">
                    <Inlines items={item.inlines} decorate={decorate} prefix={`${key}-${j}`} />
                  </li>
                ))}
              </List>
            )
          }
          default:
            return (
              <p key={key} className="min-h-[1lh] break-words">
                <Inlines items={block.inlines} decorate={decorate} prefix={key} />
              </p>
            )
        }
      })}
    </div>
  )
}
