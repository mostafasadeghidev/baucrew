/**
 * Turning the plain text of a note into something you can click.
 *
 * Projects taken over from the old board arrive with their attachments listed
 * in the description as two lines each — a name ending in a colon, then the
 * download address on the line below:
 *
 *     - 2026-07-13_Mängelrüge_Musterweg30.pdf:
 *     https://example.test/1/cards/…/download/2026-07-13_M%C3%A4ngel….pdf
 *
 * Written out like that a note is a wall of percent-encoded address and the
 * one thing a person wants — the file — is not clickable at all. So a line
 * that is nothing but an address is folded into the name above it and becomes
 * a single link; an address in the middle of a sentence keeps its place and
 * only becomes clickable.
 *
 * The link's words are the file's own name wherever the address ends in one,
 * and the site's name otherwise: an address is not a label, and a percent sign
 * is not a letter.
 */

export type NoteSegment = {
  /**
   * What the segment says. Empty on a link whose name is already written out
   * immediately before it — the note then shows the name once, with the link
   * as a mark beside it rather than the same file name twice.
   */
  text: string
  /** Present when the segment is a link. */
  href?: string
  /** The link's own name, for a screen reader, when `text` is empty. */
  title?: string
}

/** One line of a note, split into the words and the links inside it. */
export type NoteLine = NoteSegment[]

const URL_RE = /https?:\/\/[^\s<>()[\]"']+/g
/** The whole line is one address, with or without a list dash in front. */
const LONE_URL_RE = /^[-•*]?\s*(https?:\/\/[^\s<>()[\]"']+)\s*$/
/** A line that names what comes next: "- some file.pdf:" */
const LABEL_RE = /^[-•*]?\s*(.+?)\s*:\s*$/

/** The last part of the path, decoded, when it looks like a file. */
function fileNameOf(url: string): string | null {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  const last = path.split('/').filter(Boolean).pop()
  if (!last || !/\.[a-z0-9]{2,5}$/i.test(last)) return null
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/** What a link should say when nothing else names it. */
export function linkLabel(url: string): string {
  const file = fileNameOf(url)
  if (file) return file
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Whether a piece of the note already names the file the link points at. The
 * two are rarely spelled identically — a space in the note is an underscore in
 * the address — so both are flattened before they are compared.
 */
function sameName(before: string, label: string): boolean {
  const flat = (v: string) =>
    v
      .trim()
      .replace(/^[-•*]\s*/, '')
      .replace(/\s*:\s*$/, '')
      .replace(/[_\s]+/g, ' ')
      .toLowerCase()
  const left = flat(before)
  return left.length > 0 && left === flat(label)
}

export function parseNotes(text: string): NoteLine[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: NoteLine[] = []
  /** The line index in `out` that named the address we are about to read. */
  let pendingLabel: { at: number; label: string } | null = null

  for (const raw of lines) {
    const lone = raw.match(LONE_URL_RE)
    if (lone) {
      const href = lone[1]
      if (pendingLabel) {
        out[pendingLabel.at] = [{ text: pendingLabel.label, href }]
        pendingLabel = null
        continue
      }
      out.push([{ text: linkLabel(href), href }])
      continue
    }

    const segments: NoteLine = []
    let cursor = 0
    for (const match of raw.matchAll(URL_RE)) {
      const start = match.index
      const before = raw.slice(cursor, start)
      if (start > cursor) segments.push({ text: before })
      const label = linkLabel(match[0])
      // "- Muster Bericht.pdf: https://…/Muster_Bericht.pdf" writes the file's
      // name twice — once as the note's own words and once as the link's. The
      // note's words stay; the link keeps only its mark.
      const named = sameName(before, label)
      segments.push(named ? { text: '', href: match[0], title: label } : { text: label, href: match[0] })
      cursor = start + match[0].length
    }
    if (cursor < raw.length) segments.push({ text: raw.slice(cursor) })
    out.push(segments.length > 0 ? segments : [{ text: '' }])

    // Only a line that names something, and names nothing else, can lend its
    // words to the address under it.
    const label = segments.length === 1 && !segments[0].href ? raw.match(LABEL_RE) : null
    pendingLabel = label ? { at: out.length - 1, label: label[1] } : null
  }

  return out
}
