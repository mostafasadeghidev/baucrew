import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { isOffice } from './authz'
import { canWorkOn } from './crew-access'
import { getOptionList } from './option-lists-db'
import { matchNeed, parseNeedsList, type CatalogRef, type NeedLine } from './project-needs'

// A project's needs list read from text and written onto the project — the
// card's "Liste einfügen" and the assistant's add_project_needs both go
// through here, so both follow the same rules (see ./project-needs).

type Who = { id: string; role: string; employee: { id: string } | null }

export type NeedPreviewLine = NeedLine & {
  match: CatalogRef | null
  how: 'exact' | 'close' | null
  candidates: CatalogRef[]
  /** The matched entry already stands on the project's list. */
  onProject: boolean
}

/** The lines of a pasted list, each with the catalogue entry it means and whether the project has it already. */
export async function previewNeeds(projectId: string, text: string): Promise<NeedPreviewLine[]> {
  const kinds = await getOptionList('itemKinds')
  const lines = parseNeedsList(text.slice(0, 100_000), kinds).slice(0, 300)
  const [catalog, onProject] = await Promise.all([
    db.catalogItem.findMany({ where: { active: true }, select: { id: true, kind: true, name: true, unit: true }, orderBy: { name: 'asc' } }),
    db.projectItem.findMany({ where: { projectId }, select: { catalogItemId: true } }),
  ])
  const assigned = new Set(onProject.map((p) => p.catalogItemId))
  return lines.map((line) => {
    const found = matchNeed(line, catalog)
    return { ...line, match: found.item, how: found.how, candidates: found.candidates, onProject: !!found.item && assigned.has(found.item.id) }
  })
}

export type NeedPick = {
  /** The catalogue entry to add; or none, with `create` to make it first. */
  catalogItemId: string | null
  create: { kind: string; name: string; unit: string | null } | null
  quantity: number | null
  note: string | null
}

export type AddNeedsResult = {
  added: number
  /** Already on the list: its empty quantity or note was filled. */
  updated: number
  /** Already on the list with nothing to add, or not allowed to be made. */
  skipped: number
  /** New catalogue entries made on the way. */
  created: number
  /** The names that were added or filled, for the reply. */
  names: string[]
}

const cleanQuantity = (q: number | null) =>
  q != null && Number.isFinite(q) && q >= 0 && q <= 999_999_999 ? Math.round(q * 100) / 100 : null

/**
 * Puts the picked lines on the project's list. A line for an entry the list
 * already has does not make a second row: it fills that row's empty quantity
 * or note. A new catalogue entry is the office's to make; a site manager's
 * line without an entry is skipped.
 */
export async function addNeeds(user: Who, projectId: string, picks: NeedPick[]): Promise<AddNeedsResult | null> {
  if (!(await canWorkOn(user, projectId))) return null
  const office = isOffice(user)
  const kinds = new Set((await getOptionList('itemKinds')).map((k) => k.value))
  const result: AddNeedsResult = { added: 0, updated: 0, skipped: 0, created: 0, names: [] }

  for (const pick of picks.slice(0, 300)) {
    const quantity = cleanQuantity(pick.quantity)
    const note = pick.note?.trim().slice(0, 500) || null
    let itemId = pick.catalogItemId
    let name: string | null = null
    if (itemId) {
      const item = await db.catalogItem.findUnique({ where: { id: itemId }, select: { name: true } })
      if (!item) itemId = null
      else name = item.name
    }
    if (!itemId && pick.create && office && kinds.has(pick.create.kind)) {
      const newName = pick.create.name.trim().slice(0, 200)
      if (newName) {
        // The same name and kind made a moment ago by another line is used again, not made twice.
        const existing = await db.catalogItem.findFirst({
          where: { kind: pick.create.kind, name: { equals: newName, mode: 'insensitive' } },
          select: { id: true, name: true },
        })
        const item =
          existing ??
          (await db.catalogItem.create({
            data: { kind: pick.create.kind, name: newName, unit: pick.create.unit?.trim().slice(0, 40) || null },
            select: { id: true, name: true },
          }))
        if (!existing) {
          result.created++
          await audit({ userId: user.id, action: 'catalogItem.create', entity: 'CatalogItem', entityId: item.id, newValue: `${item.name} (${pick.create.kind})` })
        }
        itemId = item.id
        name = item.name
      }
    }
    if (!itemId || !name) {
      result.skipped++
      continue
    }

    const row = await db.projectItem.findUnique({ where: { projectId_catalogItemId: { projectId, catalogItemId: itemId } } })
    if (row) {
      const data = {
        ...(row.quantity == null && quantity != null ? { quantity } : {}),
        ...(!row.note && note ? { note } : {}),
      }
      if (Object.keys(data).length === 0) {
        result.skipped++
        continue
      }
      await db.projectItem.update({ where: { id: row.id }, data })
      result.updated++
    } else {
      await db.projectItem.create({ data: { projectId, catalogItemId: itemId, quantity, note } })
      result.added++
    }
    result.names.push(name)
  }

  if (result.names.length > 0) {
    await audit({ userId: user.id, action: 'projectItem.add', entity: 'Project', entityId: projectId, newValue: result.names.join(', ').slice(0, 1000) })
  }
  return result
}

/** What a project needs, grouped the way the card shows it: per kind, and the machines. */
export async function projectNeedsOf(projectId: string) {
  const [items, devices] = await Promise.all([
    db.projectItem.findMany({
      where: { projectId },
      include: { catalogItem: { select: { id: true, kind: true, name: true, unit: true } } },
      orderBy: { catalogItem: { name: 'asc' } },
    }),
    db.projectDevice.findMany({
      where: { projectId },
      include: { device: { select: { id: true, name: true, inventoryNo: true, externalSystem: true } } },
      orderBy: { device: { name: 'asc' } },
    }),
  ])
  return {
    items: items.map((i) => ({
      id: i.id,
      catalogItemId: i.catalogItem.id,
      kind: i.catalogItem.kind,
      name: i.catalogItem.name,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      unit: i.catalogItem.unit,
      status: i.status,
      note: i.note,
    })),
    machines: devices.map((d) => ({
      id: d.device.id,
      name: d.device.name,
      inventoryNo: d.device.inventoryNo,
      /** Where the machine is kept: "wattro" for the ones synced from Wattro. */
      source: d.device.externalSystem ?? 'app',
    })),
  }
}
