// The note the plan match leaves on a project, and how to read it back.
//
// When a sheet job is tied to a project, the project is handed the dates
// and the amount it lacked, and a line in its description says so. Reading
// that line back is what lets a later link tell a figure the sheet gave
// (which it may extend when the same project gets a further phase) from a
// figure the office typed in (which is never touched).

export const NOTE_START = 'Abgleich mit der Jahresplanung '
export const NOTE_END = ' aus der Tabelle übernommen.'

const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
const fmtAmount = (v: number) => `${v.toLocaleString('de-DE')} €`

/** The note for one link: what was taken, on which day. */
export function planNote(
  stamp: string,
  taken: { start?: Date; end?: Date; price?: number }
): string {
  const parts: string[] = []
  if (taken.start) parts.push(`Start ${fmtDate(taken.start)}`)
  if (taken.end) parts.push(`Ende ${fmtDate(taken.end)}`)
  if (taken.price !== undefined) parts.push(`Auftragswert ${fmtAmount(taken.price)}`)
  return `${NOTE_START}${stamp}: ${parts.join(', ')}${NOTE_END}`
}

/**
 * The description as paragraphs. The project form hands the text back with
 * Windows line ends after every save, so both kinds are read.
 */
const paragraphs = (description: string) =>
  description.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim())

const isNote = (paragraph: string) => paragraph.startsWith(NOTE_START) && paragraph.endsWith(NOTE_END)

/** The description with every plan note taken out; null when nothing is left. */
export function withoutPlanNotes(description: string | null): string | null {
  if (!description) return null
  const kept = paragraphs(description)
    .filter((p) => p.length > 0 && !isNote(p))
    .join('\n\n')
  return kept || null
}

export type SheetFigures = {
  /** The start the sheet gave last, as YYYY-MM-DD; null when it never did. */
  start: string | null
  end: string | null
  /** The amount the sheet gave last. */
  price: number | null
}

/**
 * What the sheet gave the project, going by the notes — the latest note for
 * each figure counts, since every link overwrites what the one before gave.
 */
export function sheetFigures(description: string | null): SheetFigures {
  const figures: SheetFigures = { start: null, end: null, price: null }
  if (!description) return figures
  for (const p of paragraphs(description)) {
    if (!isNote(p)) continue
    const start = /Start (\d{4}-\d{2}-\d{2})/.exec(p)
    if (start) figures.start = start[1]
    const end = /Ende (\d{4}-\d{2}-\d{2})/.exec(p)
    if (end) figures.end = end[1]
    const price = /Auftragswert ([\d.]+(?:,\d+)?) €/.exec(p)
    if (price) figures.price = Number(price[1].replace(/\./g, '').replace(',', '.'))
  }
  return figures
}

/** Whether a project's date is the one the sheet gave it. */
export const isSheetDate = (given: string | null, date: Date | null) =>
  given !== null && date !== null && fmtDate(date) === given

/** Whether a project's amount is the one the sheet gave it. */
export const isSheetPrice = (given: number | null, price: number | null) =>
  given !== null && price !== null && price === given
