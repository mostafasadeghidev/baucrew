/**
 * What a printed work order shows, chosen per printout and carried in the
 * address — so the choice survives a reload, and the link the schedule makes
 * to one day's sheet can be given its own.
 *
 * - `types`: the work types ticked on the sheet. Left out, they are the
 *   project's own; given, they are exactly the ones named — a project of five
 *   trades is, on the day the painters go, a painting job.
 * - `only=1`: print the ticked work types alone instead of the whole list with
 *   some of it ticked.
 * - `notes=1`: print the project's description into the notes box. Off unless
 *   asked for: the description is the office's text, and the box on the sheet
 *   is for what the crew writes on the site.
 *
 * Pure, so the rules are tested without a request.
 */
export type SheetOptions = { types: string[]; only: boolean; notes: boolean }

export function parseSheetOptions(
  params: { types?: string; only?: string; notes?: string },
  own: string[],
  known: string[]
): SheetOptions {
  const asked = params.types === undefined ? null : params.types.split(',').map((id) => id.trim()).filter((id) => known.includes(id))
  return {
    types: asked ?? own.filter((id) => known.includes(id)),
    only: params.only === '1',
    notes: params.notes === '1',
  }
}

/** The options as the address carries them; what is the default is left out. */
export function sheetOptionsQuery(options: SheetOptions, own: string[]): Record<string, string> {
  const query: Record<string, string> = {}
  const same = options.types.length === own.length && options.types.every((id) => own.includes(id))
  if (!same) query.types = options.types.join(',')
  if (options.only) query.only = '1'
  if (options.notes) query.notes = '1'
  return query
}
