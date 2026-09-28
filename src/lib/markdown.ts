/**
 * The little Markdown a Trello card's description and comments are written
 * in — and that the cards taken over from Trello arrive in: headings (#, ##,
 * ###), lists (- or 1.), quotes (>), a rule (---), code (`…` and ``` fences),
 * **bold**, *italic* or _italic_, ~~struck~~, and [words](https://…) links.
 *
 * It stands on `parseNotes` (rich-text.ts), which already makes addresses
 * clickable and folds the old board's "name:" + address lines into one link;
 * the marks are read on top of what it returns. Nothing here makes HTML: the
 * result is a tree the page draws with its own elements, so a note can carry
 * no markup of its own into the page, and only http(s) becomes a link.
 *
 * Pure, so the reading is tested without a page.
 */

import { parseNotes, type NoteSegment } from './rich-text'

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'b' | 'i' | 's'; children: Inline[] }
  | { t: 'link'; href: string; text: string; title?: string }

export type Block =
  | { t: 'p' | 'h1' | 'h2' | 'h3' | 'quote'; inlines: Inline[] }
  | { t: 'li'; ordered: boolean; n: number; inlines: Inline[] }
  | { t: 'hr' }
  | { t: 'pre'; text: string }

type Rule = { re: RegExp; make: (m: RegExpExecArray) => Inline }

const RULES: Rule[] = [
  { re: /`([^`\n]+)`/, make: (m) => ({ t: 'code', text: m[1] }) },
  { re: /\*\*(?=\S)([\s\S]*?\S)\*\*/, make: (m) => ({ t: 'b', children: parseInline(m[1]) }) },
  { re: /__(?=\S)([\s\S]*?\S)__/, make: (m) => ({ t: 'b', children: parseInline(m[1]) }) },
  { re: /~~(?=\S)([\s\S]*?\S)~~/, make: (m) => ({ t: 's', children: parseInline(m[1]) }) },
  // A single star or underscore that opens and closes a word — not the one in
  // "Muster_Plan_2026.pdf" or in "5 * 3".
  { re: /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/, make: (m) => ({ t: 'i', children: parseInline(m[1]) }) },
  { re: /(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/u, make: (m) => ({ t: 'i', children: parseInline(m[1]) }) },
]

/** The marks inside one run of words. */
export function parseInline(text: string): Inline[] {
  let best: { rule: Rule; m: RegExpExecArray } | null = null
  for (const rule of RULES) {
    const m = rule.re.exec(text)
    if (m && (!best || m.index < best.m.index)) best = { rule, m }
  }
  if (!best) return text ? [{ t: 'text', text }] : []
  const before = text.slice(0, best.m.index)
  return [
    ...(before ? [{ t: 'text' as const, text: before }] : []),
    best.rule.make(best.m),
    ...parseInline(text.slice(best.m.index + best.m[0].length)),
  ]
}

/**
 * `[words](https://…)`: `parseNotes` has cut the address out as a link of its
 * own, leaving "[words](" before it and ")" after it — the three become one
 * link with the words.
 */
function joinMarkdownLinks(line: NoteSegment[]): NoteSegment[] {
  const out: NoteSegment[] = []
  for (let i = 0; i < line.length; i++) {
    const seg = line[i]
    const link = line[i + 1]
    const after = line[i + 2]
    const open = !seg.href ? /\[([^\]]+)\]\($/.exec(seg.text) : null
    if (open && link?.href && after && !after.href && after.text.startsWith(')')) {
      const lead = seg.text.slice(0, open.index)
      if (lead) out.push({ text: lead })
      out.push({ text: open[1], href: link.href })
      const rest = after.text.slice(1)
      if (rest) out.push({ text: rest })
      i += 2
      continue
    }
    out.push(seg)
  }
  return out
}

function inlinesOf(line: NoteSegment[]): Inline[] {
  return joinMarkdownLinks(line).flatMap((seg): Inline[] =>
    seg.href ? [{ t: 'link', href: seg.href, text: seg.text, ...(seg.title ? { title: seg.title } : {}) }] : parseInline(seg.text)
  )
}

const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const HEADING = /^(#{1,3})\s+/
const BULLET = /^\s*[-*+•]\s+/
const ORDERED = /^\s*(\d{1,3})[.)]\s+/
const QUOTE = /^>\s?/

/** One line as a block: its marker read off the start and taken away. */
function blockOf(line: NoteSegment[]): Block {
  const first = line[0]
  const lead = first && !first.href ? first.text : ''
  if (line.length === 1 && !first.href && HR.test(lead)) return { t: 'hr' }
  const strip = (re: RegExp) => [{ text: lead.replace(re, '') }, ...line.slice(1)]
  const heading = HEADING.exec(lead)
  if (heading) return { t: `h${heading[1].length}` as 'h1' | 'h2' | 'h3', inlines: inlinesOf(strip(HEADING)) }
  const ordered = ORDERED.exec(lead)
  if (ordered) return { t: 'li', ordered: true, n: Number(ordered[1]), inlines: inlinesOf(strip(ORDERED)) }
  if (BULLET.test(lead)) return { t: 'li', ordered: false, n: 0, inlines: inlinesOf(strip(BULLET)) }
  if (QUOTE.test(lead)) return { t: 'quote', inlines: inlinesOf(strip(QUOTE)) }
  return { t: 'p', inlines: inlinesOf(line) }
}

/** A note as the blocks it is drawn in, line by line. */
export function markdownBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let run: string[] = []
  let fence: string[] | null = null
  const flush = () => {
    if (run.length > 0) blocks.push(...parseNotes(run.join('\n')).map(blockOf))
    run = []
  }
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (fence) {
        blocks.push({ t: 'pre', text: fence.join('\n') })
        fence = null
      } else {
        flush()
        fence = []
      }
      continue
    }
    if (fence) fence.push(line)
    else run.push(line)
  }
  // An unclosed fence is still code.
  if (fence) blocks.push({ t: 'pre', text: fence.join('\n') })
  flush()
  return blocks
}
