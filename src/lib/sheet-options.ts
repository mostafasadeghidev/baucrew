/**
 * What a printed work order shows, chosen per printout and carried in the
 * address — so the choice survives a reload, and the link the schedule makes
 * to one day's sheet can be given its own.
 *
 * - `types`: the work types ticked on the sheet. Left out, they are the
 *   project's own; given, they are exactly the ones named — a project of five
 *   trades is, on the day the painters go, a painting job. The whole list is
 *   always printed, the way the paper form has it; only the ticks change.
 * - `client`, `building`: what "Baustelleneinrichtung ausgerichtet auf" ticks —
 *   the project's Auftragsart and Objektart unless the office ticks otherwise
 *   for the day. An empty value ticks nothing.
 * - `notes=1`: print the project's description into the notes box. Off unless
 *   asked for: the description is the office's text, and the box on the sheet
 *   is for what the crew writes on the site — and for the assignment's own
 *   note, which is always printed.
 *
 * Pure, so the rules are tested without a request.
 */
export type SheetOptions = { types: string[]; clientType: string | null; buildingType: string | null; notes: boolean }

/** The project's own values — the defaults, written as nothing. */
export type SheetDefaults = { types: string[]; clientType: string | null; buildingType: string | null }

/** What may be ticked at all: the active work types and the two option lists. */
export type SheetChoices = { types: string[]; clientTypes: string[]; buildingTypes: string[] }

export type SheetParams = { types?: string; client?: string; building?: string; notes?: string }

/** The project's own values, kept only where the lists still offer them. */
export function sheetDefaults(project: SheetDefaults, known: SheetChoices): SheetDefaults {
  return {
    types: project.types.filter((id) => known.types.includes(id)),
    clientType: project.clientType && known.clientTypes.includes(project.clientType) ? project.clientType : null,
    buildingType: project.buildingType && known.buildingTypes.includes(project.buildingType) ? project.buildingType : null,
  }
}

const oneOf = (asked: string | undefined, own: string | null, known: string[]): string | null => {
  const value = asked === undefined ? own : asked
  return value !== null && known.includes(value) ? value : null
}

export function parseSheetOptions(params: SheetParams, own: SheetDefaults, known: SheetChoices): SheetOptions {
  const asked =
    params.types === undefined
      ? null
      : params.types
          .split(',')
          .map((id) => id.trim())
          .filter((id) => known.types.includes(id))
  return {
    types: asked ?? own.types.filter((id) => known.types.includes(id)),
    clientType: oneOf(params.client, own.clientType, known.clientTypes),
    buildingType: oneOf(params.building, own.buildingType, known.buildingTypes),
    notes: params.notes === '1',
  }
}

/** The options as the address carries them; what is the default is left out. */
export function sheetOptionsQuery(options: SheetOptions, own: SheetDefaults): Record<string, string> {
  const query: Record<string, string> = {}
  const same = options.types.length === own.types.length && options.types.every((id) => own.types.includes(id))
  if (!same) query.types = options.types.join(',')
  if (options.clientType !== own.clientType) query.client = options.clientType ?? ''
  if (options.buildingType !== own.buildingType) query.building = options.buildingType ?? ''
  if (options.notes) query.notes = '1'
  return query
}
