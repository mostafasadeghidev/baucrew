// The links between the planning sheet and the projects, as a file.
//
// Deciding which sheet line belongs to which project takes a person an
// afternoon; the decisions should not have to be made twice. This file
// format carries them from one installation to another — a line is named
// by year, month, wording and amount, a project by the record it came from
// (a board card's id) or, failing that, by its number and name.

export type PlanLinkRecord = {
  year: number
  month: number
  name: string
  amount: number
  project: {
    number: string
    name: string
    externalSystem: string | null
    externalId: string | null
  }
}

export type PlanLinksFile = {
  format: 'baucrew-plan-links'
  version: 1
  exportedAt: string
  links: PlanLinkRecord[]
}

export function serializePlanLinks(links: PlanLinkRecord[], now: Date = new Date()): string {
  const file: PlanLinksFile = {
    format: 'baucrew-plan-links',
    version: 1,
    exportedAt: now.toISOString(),
    links,
  }
  return JSON.stringify(file, null, 2)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const optionalString = (v: unknown): v is string | null | undefined =>
  v === null || v === undefined || typeof v === 'string'

/** Reads a links file back; null when it is not one. */
export function parsePlanLinks(text: string): PlanLinkRecord[] | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.format !== 'baucrew-plan-links' || !Array.isArray(raw.links)) return null
  const links: PlanLinkRecord[] = []
  for (const item of raw.links) {
    if (!isRecord(item) || !isRecord(item.project)) return null
    const { year, month, name, amount, project } = item
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      typeof name !== 'string' ||
      typeof amount !== 'number' ||
      typeof project.number !== 'string' ||
      typeof project.name !== 'string' ||
      !optionalString(project.externalSystem) ||
      !optionalString(project.externalId)
    ) {
      return null
    }
    links.push({
      year: year as number,
      month: month as number,
      name,
      amount,
      project: {
        number: project.number,
        name: project.name,
        externalSystem: project.externalSystem ?? null,
        externalId: project.externalId ?? null,
      },
    })
  }
  return links
}
