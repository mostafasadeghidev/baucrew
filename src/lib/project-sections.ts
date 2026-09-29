/**
 * The five cards a project's data is edited in. On the project's page and on
 * the card's back one card is opened and saved at a time, while the windows
 * around it (members, labels, the fields grid, the move) change the project
 * too. The form says which cards it saves, and only their fields are written:
 * a card saved from a form drawn before such a window changed the project
 * cannot put the old values of the other four back.
 */

export const PROJECT_SECTIONS = ['basic', 'address', 'planning', 'assignment', 'description'] as const
export type ProjectSection = (typeof PROJECT_SECTIONS)[number]

/** The form field that names the cards being saved. */
export const SECTIONS_FIELD = 'sections'

/**
 * The cards a save covers: those the form names, or every one when it names
 * none at all — the add and edit pages, where all five are open.
 */
export function savedSections(raw: FormDataEntryValue | null): ReadonlySet<ProjectSection> {
  if (raw === null) return new Set(PROJECT_SECTIONS)
  const named = String(raw).split(',')
  return new Set(PROJECT_SECTIONS.filter((s) => named.includes(s)))
}
