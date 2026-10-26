/**
 * The client's own project number — the one that sat in brackets behind a
 * Trello card's title ("Musterhof (4100001)"). It is a field of its own on the
 * project (`Project.jobNumber`): typed in, imported, edited, shown small under
 * a card's name, and the project's ID in Wattro. The app's own number
 * (`Project.number`, "2026-0048") is a different thing and never changes.
 *
 * Pure, so the rules are tested without a form or a database.
 */

/** Wattro's own limit for a project's `human_id`. */
export const JOB_NUMBER_MAX = 50

/** Whitespace tidied; empty stays empty (no number). */
export function normalizeJobNumber(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, JOB_NUMBER_MAX)
  return text || null
}

/** The number a card shows: the project's own field, null when it has none. */
export function jobNumberOf(project: { jobNumber: string | null }): string | null {
  return project.jobNumber
}

/**
 * The number Wattro knows a project by: the client's number when there is one,
 * the app's own otherwise (so every project has an ID there).
 */
export function wattroKeyOf(project: { jobNumber: string | null; number: string }): string {
  return (project.jobNumber ?? project.number).slice(0, JOB_NUMBER_MAX)
}
