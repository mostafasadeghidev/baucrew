/**
 * What a project is called: nobody types a name for it any more — it is the
 * customer's name followed by the work it is for, "Muster GmbH · Malern",
 * several trades one after the other, "Muster GmbH · Malern, Trockenbau".
 *
 * The title is kept in `Project.name`, so every place that names a project —
 * board, list, schedule, PDFs, notifications, the API, Wattro — shows the
 * same words without working them out itself (src/lib/project-title-db.ts
 * keeps it current). The trades are written with their German names, the
 * office's own words for them, in either language of the app.
 *
 * Where no trade says what the work is, the office's own words do — the
 * project's `workNote`, "Küche" — after the trades: "Muster GmbH · Malern,
 * Küche", or "Muster GmbH · Küche" alone.
 *
 * Trades that are no work on a site — the office's own marketing and
 * organisation, kept as labels on the board (NOT_WORK) — stay on the project
 * but never name it, and neither does a work note that says one of them.
 *
 * A project with neither is called what it was called before:
 * `sourceTitle` — the Trello card's title, the words an automation gave it, a
 * checklist item it was made from — and failing that the customer alone.
 *
 * Pure: nothing here touches the database.
 */

export const TITLE_SEPARATOR = ' · '
/** What `Project.name` has always held at most. */
export const TITLE_MAX = 300

/**
 * "Lead Anzeige", "Kundengewinnung (SM)", "Mitarbeitergewinnung",
 * "Systematisierung", "Beispiele/Inspirationen": what the office files on the
 * board besides its jobs, by a part of the name, any case. The migration
 * 20261103090000_project_title_not_work uses the same pattern.
 */
export const NOT_WORK = /lead|anzeige|gewinnung|systematisier|beispiel|inspiration/i

/** Is this trade, or these words, work on a site — something a project may be named after? */
export const isWork = (name: string) => !NOT_WORK.test(name)

export type TitleParts = {
  /** The customer's name. */
  customer: string
  /** The project's trades by their German name, in the order Settings lists them. */
  trades: string[]
  /** The type of work in the office's own words, where no trade says it. */
  workNote?: string | null
  /** The title it had before, typed or imported; null for a project made in the app. */
  sourceTitle?: string | null
}

export function projectTitle({ customer, trades, workNote, sourceTitle }: TitleParts): string {
  const who = customer.trim()
  const note = workNote?.replace(/\s+/g, ' ').trim()
  const work = [...new Set([...trades.map((t) => t.trim()), note])]
    .filter((w): w is string => !!w && isWork(w))
    .join(', ')
  const title = work ? [who, work].filter(Boolean).join(TITLE_SEPARATOR) : sourceTitle?.trim() || who
  return title.slice(0, TITLE_MAX)
}

/**
 * The old title shown small under the new one — the place, the detail the
 * card's title had — while it says something the title itself does not.
 */
export function formerTitle(name: string, sourceTitle: string | null | undefined): string | null {
  const before = sourceTitle?.trim()
  return before && before !== name.trim() ? before : null
}
