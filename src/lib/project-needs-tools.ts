import 'server-only'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from './db'
import { audit } from './audit'
import { isOffice } from './authz'
import type { CurrentUser } from './auth'
import { ApiError } from './api-service'
import { projectScope } from './project-scope'
import { getOptionList } from './option-lists-db'
import { matchNeed } from './project-needs'
import { addNeeds, projectNeedsOf, type NeedPick } from './project-needs-server'

// The assistant's door to a project's needs (mcp-catalog.ts: list_catalog,
// get_project_needs, add_project_needs): the same catalogue, the same
// matching and the same rules as the card's "Liste einfügen". No money here —
// a catalogue entry has none.

export const listCatalogInput = z.object({
  query: z.string().trim().max(200).optional(),
  kind: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const addProjectNeedsInput = z.object({
  project: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        quantity: z.number().min(0).max(999_999_999).optional(),
        note: z.string().trim().max(500).optional(),
        kind: z.string().trim().max(40).optional(),
      })
    )
    .max(100)
    .optional(),
  machines: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  createMissing: z.boolean().optional(),
})

async function projectOf(user: CurrentUser, idOrNumber: string) {
  if (user.role === 'EMPLOYEE') throw new ApiError(403, 'forbidden', 'This is for the office.')
  const scope = projectScope(user)
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }, { jobNumber: idOrNumber }], ...(scope ? { AND: [scope] } : {}) },
    select: { id: true, number: true },
  })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  return project
}

/** The catalogue of materials and tools, searched by name or category. */
export async function listCatalog(user: CurrentUser, input: z.infer<typeof listCatalogInput>) {
  if (user.role === 'EMPLOYEE') throw new ApiError(403, 'forbidden', 'This is for the office.')
  const rows = await db.catalogItem.findMany({
    where: {
      active: true,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.query
        ? { OR: [{ name: { contains: input.query, mode: 'insensitive' } }, { category: { contains: input.query, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    take: input.limit ?? 200,
    select: { id: true, kind: true, name: true, category: true, unit: true, stockQuantity: true },
  })
  return rows.map((r) => ({ ...r, stockQuantity: r.stockQuantity != null ? Number(r.stockQuantity) : null }))
}

/** What a project needs: materials and tools with quantity, unit, status and note; the machines. */
export async function getProjectNeeds(user: CurrentUser, idOrNumber: string) {
  const project = await projectOf(user, idOrNumber)
  return { projectId: project.id, number: project.number, url: `/projects/${project.id}`, ...(await projectNeedsOf(project.id)) }
}

/**
 * Adds materials and tools by name — matched against the catalogue as the
 * card matches a pasted list — and machines by name or inventory number. A
 * name the catalogue does not know is reported back; it is made only when
 * asked (`createMissing`) and only for the office.
 */
export async function addProjectNeeds(user: CurrentUser, input: z.infer<typeof addProjectNeedsInput>) {
  const project = await projectOf(user, input.project)
  const kinds = await getOptionList('itemKinds')
  const catalog = await db.catalogItem.findMany({ where: { active: true }, select: { id: true, kind: true, name: true, unit: true } })
  const picks: NeedPick[] = []
  const unknown: Array<{ name: string; candidates: string[] }> = []
  for (const item of input.items ?? []) {
    const kind = item.kind ? (kinds.find((k) => [k.value, k.labelDe, k.labelEn].some((w) => w.toLowerCase() === item.kind!.toLowerCase()))?.value ?? null) : null
    const found = matchNeed({ name: item.name, kind }, catalog)
    if (found.item) {
      picks.push({ catalogItemId: found.item.id, create: null, quantity: item.quantity ?? null, note: item.note ?? null })
    } else if (input.createMissing && isOffice(user) && found.candidates.length === 0) {
      picks.push({ catalogItemId: null, create: { kind: kind ?? 'MATERIAL', name: item.name, unit: null }, quantity: item.quantity ?? null, note: item.note ?? null })
    } else {
      unknown.push({ name: item.name, candidates: found.candidates.map((c) => c.name) })
    }
  }
  const items = picks.length > 0 ? await addNeeds(user, project.id, picks) : null

  const machines = { added: [] as string[], already: [] as string[], unknown: [] as string[] }
  for (const text of input.machines ?? []) {
    const device = await db.device.findFirst({
      where: { active: true, OR: [{ inventoryNo: { equals: text, mode: 'insensitive' } }, { name: { equals: text, mode: 'insensitive' } }] },
      select: { id: true, name: true },
    })
    if (!device) {
      machines.unknown.push(text)
      continue
    }
    const there = await db.projectDevice.findUnique({ where: { projectId_deviceId: { projectId: project.id, deviceId: device.id } } })
    if (there) machines.already.push(device.name)
    else {
      await db.projectDevice.create({ data: { projectId: project.id, deviceId: device.id } })
      await audit({ userId: user.id, action: 'projectDevice.add', entity: 'Project', entityId: project.id, newValue: device.id })
      machines.added.push(device.name)
    }
  }

  revalidatePath(`/projects/${project.id}`)
  revalidatePath(`/projects/card/${project.id}`)
  return {
    projectId: project.id,
    url: `/projects/${project.id}`,
    items: items ? { added: items.added, filled: items.updated, skipped: items.skipped, createdInCatalog: items.created, names: items.names } : null,
    notInCatalog: unknown,
    machines,
  }
}
