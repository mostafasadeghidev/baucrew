/**
 * A line of the planning sheet made from a project's own figures — for the
 * job the office made in BauCrew that the sheet of the year does not know.
 * In a year with an imported sheet the months are the sheet's lines, so such
 * a job counts nowhere until it has a line; this is the line it gets: the
 * month it starts in, its order value, own crew or SUB as the project says.
 *
 * The line is tied to the project and marked as made by hand, so a re-import
 * of the sheet keeps it — and drops it again once the sheet carries the job
 * itself (`standInsToDrop`), so nothing is counted twice.
 *
 * Pure, so the rules are tested without a database.
 */

export type LineSource = {
  name: string
  plannedStart: Date | null
  /** The price as entered; null when there is none. */
  price: number | null
  addOns: Array<{ amount: number }>
  isSub: boolean
  /** The years of the lines the project already has. */
  lines: Array<{ year: number }>
}

export type LineDraft = { year: number; month: number; name: string; amount: number; isSub: boolean }

export type LineRefusal = 'noDate' | 'noValue' | 'hasLine'

/** Price plus Nachträge; null when neither is entered — the order value as the reports read it. */
export function lineAmount(price: number | null, addOns: Array<{ amount: number }>): number | null {
  const extra = addOns.reduce((sum, a) => sum + a.amount, 0)
  if (price == null) return extra > 0 ? extra : null
  return price + extra
}

export function planLineFromProject(p: LineSource): { line: LineDraft } | { error: LineRefusal } {
  if (!p.plannedStart) return { error: 'noDate' }
  const amount = lineAmount(p.price, p.addOns)
  if (amount === null) return { error: 'noValue' }
  const year = p.plannedStart.getUTCFullYear()
  if (p.lines.some((l) => l.year === year)) return { error: 'hasLine' }
  return { line: { year, month: p.plannedStart.getUTCMonth() + 1, name: p.name.trim(), amount, isSub: p.isSub } }
}

/**
 * After a re-import: the hand-made lines whose job the sheet now carries
 * itself — a sheet line of the same year tied to the same project — so the
 * stand-in does not count the job a second time.
 */
export function standInsToDrop(
  manual: Array<{ id: string; year: number; projectId: string | null }>,
  sheet: Array<{ year: number; projectId: string | null }>
): string[] {
  const covered = new Set(sheet.filter((l) => l.projectId).map((l) => `${l.year}|${l.projectId}`))
  return manual.filter((l) => l.projectId && covered.has(`${l.year}|${l.projectId}`)).map((l) => l.id)
}
