// Parser for Trello's standard board export ("Menu → Print and Export →
// Export as JSON"). Only the fields we import are read; everything else in the
// (large) file is ignored.

export type TrelloList = { id: string; name: string; closed: boolean }
export type TrelloCard = {
  id: string
  name: string
  desc: string
  idList: string
  closed: boolean
  due: string | null
  labels: string[]
}
export type TrelloBoard = {
  name: string
  lists: TrelloList[]
  cards: TrelloCard[]
}

export function parseTrelloExport(json: unknown): TrelloBoard | null {
  if (typeof json !== 'object' || json === null) return null
  const raw = json as Record<string, unknown>
  if (!Array.isArray(raw.lists) || !Array.isArray(raw.cards)) return null

  const lists: TrelloList[] = raw.lists
    .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
    .map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? '').trim(),
      closed: Boolean(l.closed),
    }))
    .filter((l) => l.id && l.name)

  const cards: TrelloCard[] = raw.cards
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? '').trim(),
      desc: String(c.desc ?? '').trim(),
      idList: String(c.idList ?? ''),
      closed: Boolean(c.closed),
      due: typeof c.due === 'string' ? c.due : null,
      labels: Array.isArray(c.labels)
        ? c.labels
            .map((lb) =>
              typeof lb === 'object' && lb !== null ? String((lb as { name?: unknown }).name ?? '') : ''
            )
            .filter(Boolean)
        : [],
    }))
    .filter((c) => c.id && c.name)

  return { name: String(raw.name ?? 'Trello').trim(), lists, cards }
}

/**
 * Splits a Trello card title into customer + project name.
 * Convention used on the boards ("Muster Musterdorf DD",
 * "Beispiel Musterstadt Hauptstraße 28"): the first word is the
 * customer, the rest describes the job. Titles with " - " or ": " use that
 * separator instead. Single-word titles are both customer and project.
 */
export function splitCardTitle(title: string): { customer: string; project: string } {
  // " - ", " – " or ": " separate customer from job description
  const sep = title.match(/\s[-–]\s|:\s/)
  if (sep && sep.index !== undefined) {
    const customer = title.slice(0, sep.index).trim()
    const project = title.slice(sep.index + sep[0].length).trim()
    if (customer && project) return { customer, project: title.trim() }
  }
  const [first, ...rest] = title.trim().split(/\s+/)
  return { customer: first, project: rest.length ? title.trim() : first }
}
