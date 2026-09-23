'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, requireManagement, requireStaff, canViewFinancials } from '@/lib/authz'
import { canSeeProject } from '@/lib/project-scope'
import { audit } from '@/lib/audit'
import { planChecklistChanges } from '@/lib/project-checklists'
import { actualDatesForStatus } from '@/lib/project-lifecycle'
import { ProjectStatus } from '@/generated/prisma/enums'
import { nextProjectNumber } from '@/lib/project-numbers'
import {
  announceProjectChanges,
  announceProjectCreated,
  announceProjectDeleted,
  projectBefore,
} from '@/lib/project-events'
import { cookies } from 'next/headers'
import { createProject as createProjectRecord, createProjectInput } from '@/lib/api-service'
import { BOARD_COOKIE, COLUMN_TITLE_MAX } from '@/lib/boards'
import { addBoardColumn, removeBoardColumn, renameBoardColumn, saveColumnOrder } from '@/lib/boards-db'
import { isColumnSort, orderCards, positionBetween, renumbered, sortedBy, tooClose } from '@/lib/board-order'

export type ProjectFormState = {
  error?: 'nameRequired' | 'customerRequired' | 'dateOrder' | 'invalidPrice' | 'saveFailed'
}

const coord = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  })

const optional = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v ? v : null))

const optionalDate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      ctx.addIssue({ code: 'custom' })
      return z.NEVER
    }
    return new Date(`${v}T00:00:00.000Z`)
  })

const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    customerId: z.string().min(1),
    status: z.enum(ProjectStatus),
    isSub: z.string().transform((v) => v === 'on'),
    // Values come from the configurable lists in Settings — stored as text.
    clientType: optional,
    buildingType: optional,
    priority: z.enum(['', 'HIGH', 'LOW']).catch('').transform((v) => (v ? v : null)),
    leadSource: optional,
    street: optional,
    postalCode: optional,
    city: optional,
    latitude: coord,
    longitude: coord,
    phone: optional,
    contact: optional,
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    dueDate: optionalDate,
    actualStart: optionalDate,
    actualEnd: optionalDate,
    managerId: z.string().transform((v) => (v ? v : null)),
    vehicleIds: z.array(z.string().min(1)).max(20),
    checklistIds: z.array(z.string().min(1)).max(30),
    deviceIds: z.array(z.string().min(1)).max(30),
    description: z
      .string()
      .trim()
      .max(10000)
      .transform((v) => (v ? v : null)),
    internalNotes: z
      .string()
      .trim()
      .max(10000)
      .transform((v) => (v ? v : null)),
    categoryIds: z.array(z.string()),
    teamIds: z.array(z.string()),
  })
  .refine(
    (d) => !(d.plannedStart && d.plannedEnd) || d.plannedEnd >= d.plannedStart,
    { path: ['plannedEnd'], message: 'dateOrder' }
  )

function parsePrice(raw: string): { ok: true; value: number | null } | { ok: false } {
  const v = raw.trim()
  if (!v) return { ok: true, value: null }
  const normalized = v.replace(/\./g, '').replace(',', '.').replace(/\s|€/g, '')
  // Accept plain "12000.50" too: if the original had no comma, don't strip dots
  const candidate = v.includes(',') ? normalized : v.replace(/\s|€/g, '')
  const num = Number(candidate)
  if (!Number.isFinite(num) || num < 0 || num > 999_999_999) return { ok: false }
  return { ok: true, value: num }
}

function parseProjectForm(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get('name') ?? '',
    customerId: formData.get('customerId') ?? '',
    status: formData.get('status') ?? 'LEAD',
    isSub: formData.get('isSub') ?? '',
    clientType: formData.get('clientType') ?? '',
    priority: formData.get('priority') ?? '',
    leadSource: formData.get('leadSource') ?? '',
    buildingType: formData.get('buildingType') ?? '',
    street: formData.get('street') ?? '',
    postalCode: formData.get('postalCode') ?? '',
    city: formData.get('city') ?? '',
    latitude: formData.get('latitude') ?? '',
    longitude: formData.get('longitude') ?? '',
    phone: formData.get('phone') ?? '',
    contact: formData.get('contact') ?? '',
    plannedStart: formData.get('plannedStart') ?? '',
    plannedEnd: formData.get('plannedEnd') ?? '',
    dueDate: formData.get('dueDate') ?? '',
    actualStart: formData.get('actualStart') ?? '',
    actualEnd: formData.get('actualEnd') ?? '',
    managerId: formData.get('managerId') ?? '',
    vehicleIds: formData.getAll('vehicleIds').map(String).filter(Boolean),
    checklistIds: formData.getAll('checklistIds').map(String).filter(Boolean),
    deviceIds: formData.getAll('deviceIds').map(String).filter(Boolean),
    description: formData.get('description') ?? '',
    internalNotes: formData.get('internalNotes') ?? '',
    categoryIds: formData.getAll('categoryIds').map(String),
    teamIds: formData.getAll('teamIds').map(String),
  })
}

function formErrorKey(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
): NonNullable<ProjectFormState['error']> {
  if (issues.some((i) => i.path[0] === 'name')) return 'nameRequired'
  if (issues.some((i) => i.path[0] === 'customerId')) return 'customerRequired'
  if (issues.some((i) => i.message === 'dateOrder')) return 'dateOrder'
  return 'saveFailed'
}

/** Copies checklist templates onto a project (each project gets its own copy). */
async function copyChecklistsToProject(projectId: string, templateIds: string[]) {
  if (templateIds.length === 0) return
  const templates = await db.checklistTemplate.findMany({
    where: { id: { in: templateIds } },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  for (const template of templates) {
    await db.projectChecklist.create({
      data: {
        projectId,
        name: template.name,
        templateId: template.id,
        items: { create: template.items.map((i, sortOrder) => ({ text: i.text, sortOrder })) },
      },
    })
  }
}

/**
 * Brings a project's checklists in line with the form selection: new ones are
 * copied in, unselected ones go again — but only while nothing was ticked, so
 * work done on site is never thrown away.
 */
async function syncProjectChecklists(projectId: string, templateIds: string[]) {
  const current = await db.projectChecklist.findMany({
    where: { projectId },
    select: { id: true, templateId: true, items: { select: { ok: true } } },
  })
  const plan = planChecklistChanges(
    current.map((c) => ({
      id: c.id,
      templateId: c.templateId,
      ticked: c.items.some((i) => i.ok !== null),
    })),
    templateIds
  )
  if (plan.remove.length > 0) {
    await db.projectChecklist.deleteMany({ where: { id: { in: plan.remove } } })
  }
  await copyChecklistsToProject(projectId, plan.add)
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const user = await requireManagement()
  const parsed = parseProjectForm(formData)
  if (!parsed.success) return { error: formErrorKey(parsed.error.issues) }

  const priceRaw = String(formData.get('price') ?? '')
  const price = parsePrice(priceRaw)
  if (!price.ok) return { error: 'invalidPrice' }

  const d = parsed.data
  let project = null
  // Retry once if the sequential number collides with a concurrent create.
  for (let attempt = 0; attempt < 2 && !project; attempt++) {
    try {
      project = await db.project.create({
        data: {
          number: await nextProjectNumber(),
          name: d.name,
          customerId: d.customerId,
          status: d.status,
          isSub: d.isSub,
          clientType: d.clientType,
          priority: d.priority,
          leadSource: d.leadSource,
          buildingType: d.buildingType,
          street: d.street,
          postalCode: d.postalCode,
          city: d.city,
          latitude: d.latitude,
          longitude: d.longitude,
          phone: d.phone,
          contact: d.contact,
          price: canViewFinancials(user) ? price.value : null,
          plannedStart: d.plannedStart,
          plannedEnd: d.plannedEnd,
          dueDate: d.dueDate,
          actualStart: d.actualStart,
          actualEnd: d.actualEnd,
          managerId: d.managerId,
          description: d.description,
          internalNotes: d.internalNotes,
          workCategories: { create: d.categoryIds.map((id) => ({ workCategoryId: id })) },
          team: { create: d.teamIds.map((id) => ({ employeeId: id })) },
          vehicles: { create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
          deviceNeeds: { create: d.deviceIds.map((id) => ({ deviceId: id })) },
        },
      })
    } catch (e: unknown) {
      const isUniqueConflict =
        typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
      if (!isUniqueConflict || attempt === 1) throw e
    }
  }
  if (!project) return { error: 'saveFailed' }

  // Create-from-template: copy the template's recommended tools/materials.
  // If the form submitted an adjusted list (`items` JSON), use that; otherwise
  // copy the template's items unchanged.
  const templateId = String(formData.get('templateId') ?? '')
  const itemsJson = String(formData.get('items') ?? '')
  let items: Array<{ catalogItemId: string; quantity: number | null }> | null = null
  if (itemsJson) {
    try {
      const parsedItems = JSON.parse(itemsJson) as unknown
      if (Array.isArray(parsedItems)) {
        items = parsedItems
          .filter((x): x is { catalogItemId: string; quantity?: unknown } =>
            typeof x === 'object' && x !== null && typeof (x as { catalogItemId?: unknown }).catalogItemId === 'string'
          )
          .map((x) => ({
            catalogItemId: x.catalogItemId,
            quantity: typeof x.quantity === 'number' && Number.isFinite(x.quantity) && x.quantity >= 0 ? x.quantity : null,
          }))
      }
    } catch {
      items = null
    }
  }
  if (items == null && templateId) {
    const templateItems = await db.templateItem.findMany({ where: { templateId } })
    items = templateItems.map((item) => ({
      catalogItemId: item.catalogItemId,
      quantity: item.quantity != null ? Number(item.quantity) : null,
    }))
  }
  if (items && items.length > 0) {
    await db.projectItem.createMany({
      data: items.map((item) => ({ projectId: project.id, catalogItemId: item.catalogItemId, quantity: item.quantity })),
      skipDuplicates: true,
    })
  }

  await copyChecklistsToProject(project.id, d.checklistIds)

  // Taking over an inbox draft: remember where it came from, close the draft.
  const draftId = String(formData.get('draftId') ?? '')
  if (draftId) {
    const draft = await db.projectDraft.findUnique({ where: { id: draftId } })
    if (draft) {
      await db.project.update({
        where: { id: project.id },
        data: {
          externalSystem: draft.externalSystem,
          externalId: draft.externalId,
          externalUrl: draft.externalUrl,
        },
      })
      await db.projectDraft.update({
        where: { id: draftId },
        data: { status: 'done', projectId: project.id },
      })
      if (draft.externalSystem && draft.externalId) {
        // The same record as a link, so an automation finds the project by it.
        await db.projectLink
          .create({
            data: {
              projectId: project.id,
              system: draft.externalSystem.toLowerCase(),
              externalId: draft.externalId,
              url: draft.externalUrl,
            },
          })
          .catch(() => {})
      }
    }
  }

  await audit({
    userId: user.id,
    action: 'project.create',
    entity: 'Project',
    entityId: project.id,
    newValue: `${project.number} ${project.name}${templateId ? ' (Vorlage)' : ''}`,
  })
  await announceProjectCreated(project.id, { type: 'user', userId: user.id })
  revalidatePath('/projects')
  redirect(`/projects/${project.id}`)
}

export async function updateProject(
  id: string,
  /** Where to go afterwards; the project's page when null. The board's card sheet returns to itself. */
  returnTo: string | null,
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const user = await requireStaff()
  if (!(await canSeeProject(user, id))) return { error: 'saveFailed' }
  const parsed = parseProjectForm(formData)
  if (!parsed.success) return { error: formErrorKey(parsed.error.issues) }

  const before = await db.project.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  const snapshot = await projectBefore(id)

  const d = parsed.data
  const financials = canViewFinancials(user)
  let priceValue: number | null | undefined
  if (financials) {
    const price = parsePrice(String(formData.get('price') ?? ''))
    if (!price.ok) return { error: 'invalidPrice' }
    priceValue = price.value
  }

  await db.project.update({
    where: { id },
    data: {
      name: d.name,
      customerId: d.customerId,
      status: d.status,
      isSub: d.isSub,
      clientType: d.clientType,
      priority: d.priority,
      leadSource: d.leadSource,
      buildingType: d.buildingType,
      street: d.street,
      postalCode: d.postalCode,
      city: d.city,
      latitude: d.latitude,
      longitude: d.longitude,
      phone: d.phone,
      contact: d.contact,
      // Users without financial access must never overwrite the price.
      ...(financials ? { price: priceValue } : {}),
      plannedStart: d.plannedStart,
      plannedEnd: d.plannedEnd,
      dueDate: d.dueDate,
      actualStart: d.actualStart,
      actualEnd: d.actualEnd,
      // Status moved forward by hand and the actual dates were left empty → derive them.
      ...(before.status !== d.status
        ? await actualDatesForStatus(id, d.status, { actualStart: d.actualStart, actualEnd: d.actualEnd })
        : {}),
      managerId: d.managerId,
      description: d.description,
      internalNotes: d.internalNotes,
      workCategories: {
        deleteMany: {},
        create: d.categoryIds.map((cid) => ({ workCategoryId: cid })),
      },
      team: {
        deleteMany: {},
        create: d.teamIds.map((eid) => ({ employeeId: eid })),
      },
      vehicles: {
        deleteMany: {},
        create: d.vehicleIds.map((vid) => ({ vehicleId: vid })),
      },
      deviceNeeds: {
        deleteMany: {},
        create: d.deviceIds.map((did) => ({ deviceId: did })),
      },
    },
  })

  await syncProjectChecklists(id, d.checklistIds)

  if (before.status !== d.status) {
    await audit({
      userId: user.id,
      action: 'project.status',
      entity: 'Project',
      entityId: id,
      field: 'status',
      oldValue: before.status,
      newValue: d.status,
    })
  }
  await audit({
    userId: user.id,
    action: 'project.update',
    entity: 'Project',
    entityId: id,
    newValue: `${before.number} ${d.name}`,
  })
  await announceProjectChanges(snapshot, { type: 'user', userId: user.id })
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  redirect(returnTo ?? `/projects/${id}`)
}

// ── Quick status change (detail page header) ─────────────────

export async function setProjectStatus(id: string, status: string): Promise<{ error?: string }> {
  const user = await requireStaff()
  if (!(await canSeeProject(user, id))) return { error: 'saveFailed' }
  const result = await changeStatus(user, id, status)
  if (result.error) return result
  refreshAfterStatus(id)
  return {}
}

/** Everywhere a status shows: the board and list, the project, the overview, the CRM's pipeline. */
function refreshAfterStatus(id: string) {
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/sites')
  revalidatePath('/reports')
}

/**
 * The status change itself — from the project's own menu, from a card dropped
 * in another column, from the pipeline. Nothing happens for the status the
 * project already has.
 */
async function changeStatus(user: { id: string }, id: string, status: string): Promise<{ error?: string }> {
  if (!(status in ProjectStatus)) return { error: 'saveFailed' }
  const before = await db.project.findUnique({
    where: { id },
    select: { status: true, number: true, actualStart: true, actualEnd: true },
  })
  if (!before) return { error: 'saveFailed' }
  if (before.status === status) return {}
  const snapshot = await projectBefore(id)
  const derived = await actualDatesForStatus(id, status as ProjectStatus, before)
  await db.project.update({ where: { id }, data: { status: status as ProjectStatus, ...derived } })
  await audit({
    userId: user.id,
    action: 'project.status',
    entity: 'Project',
    entityId: id,
    field: 'status',
    oldValue: before.status,
    newValue: status,
  })
  await announceProjectChanges(snapshot, { type: 'user', userId: user.id })
  return {}
}

/**
 * A card let go on the board: in this column, between these two neighbours.
 * The column may be the one it was in (a re-ordering) or another (a status
 * change and a place). The place is the midpoint between the neighbours'
 * positions; where a neighbour has never been placed, or the gap between
 * them is used up, the whole column is numbered afresh in the order it
 * shows — once, after which every card in it has a place.
 */
export async function moveCard(
  id: string,
  status: string,
  neighbors: { prev: string | null; next: string | null }
): Promise<{ error?: string }> {
  const user = await requireStaff()
  if (!(await canSeeProject(user, id))) return { error: 'saveFailed' }
  const moved = await changeStatus(user, id, status)
  if (moved.error) return moved
  const [prev, next] = await Promise.all([
    neighbors.prev ? db.project.findUnique({ where: { id: neighbors.prev }, select: { id: true, status: true, boardPosition: true } }) : null,
    neighbors.next ? db.project.findUnique({ where: { id: neighbors.next }, select: { id: true, status: true, boardPosition: true } }) : null,
  ])
  // A neighbour that has left the column since the board was drawn counts for nothing.
  const before = prev && prev.status === status ? prev : null
  const after = next && next.status === status ? next : null
  const unplaced = (before && before.boardPosition == null) || (after && after.boardPosition == null)
  if (!unplaced && !tooClose(before?.boardPosition ?? null, after?.boardPosition ?? null)) {
    await db.project.update({
      where: { id },
      data: { boardPosition: positionBetween(before?.boardPosition ?? null, after?.boardPosition ?? null) },
    })
  } else {
    const column = await db.project.findMany({
      where: { status: status as ProjectStatus, archivedAt: null, id: { not: id } },
      select: { id: true, number: true, boardPosition: true },
    })
    const ordered = orderCards(column.map((c) => ({ ...c, position: c.boardPosition })))
    const at = before ? ordered.findIndex((c) => c.id === before.id) + 1 : after ? ordered.findIndex((c) => c.id === after.id) : 0
    ordered.splice(Math.max(0, at), 0, { id, number: '', position: null, boardPosition: null })
    await db.$transaction(
      renumbered(ordered).map((row) => db.project.update({ where: { id: row.id }, data: { boardPosition: row.position } }))
    )
  }
  refreshAfterStatus(id)
  return {}
}

/** A column put in order from its menu: by name, number, planned start or the day the card was made. */
export async function sortColumn(status: string, by: string): Promise<{ error?: string }> {
  await requireManagement()
  if (!(status in ProjectStatus) || !isColumnSort(by)) return { error: 'saveFailed' }
  const column = await db.project.findMany({
    where: { status: status as ProjectStatus, archivedAt: null },
    select: { id: true, name: true, number: true, plannedStart: true, createdAt: true },
  })
  await db.$transaction(
    renumbered(sortedBy(column, by)).map((row) => db.project.update({ where: { id: row.id }, data: { boardPosition: row.position } }))
  )
  revalidatePath('/projects')
  return {}
}

/**
 * A card put away, or taken out again. Archived, it is off the board and
 * the list — a Trello card in the archive — and still the project it was
 * everywhere else: the schedule, the reports, its own page.
 */
export async function archiveProject(id: string, archived: boolean): Promise<{ error?: string }> {
  const user = await requireStaff()
  if (!(await canSeeProject(user, id))) return { error: 'saveFailed' }
  const project = await db.project.findUnique({ where: { id }, select: { number: true, name: true, archivedAt: true } })
  if (!project) return { error: 'saveFailed' }
  if (Boolean(project.archivedAt) === archived) return {}
  await db.project.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
  await audit({
    userId: user.id,
    action: archived ? 'project.archive' : 'project.restore',
    entity: 'Project',
    entityId: id,
    newValue: `${project.number} ${project.name}`,
  })
  refreshAfterStatus(id)
  return {}
}

/** A column's name typed over on the board; blank gives it the status's name back. */
export async function renameColumn(boardId: string, status: string, title: string): Promise<{ error?: string }> {
  const user = await requireManagement()
  if (!(status in ProjectStatus)) return { error: 'saveFailed' }
  const name = title.trim().slice(0, COLUMN_TITLE_MAX)
  if (!(await renameBoardColumn(boardId, status, name || null))) return { error: 'notFound' }
  await audit({ userId: user.id, action: 'board.column.rename', entity: 'Board', entityId: boardId, newValue: `${status}: ${name}` })
  revalidatePath('/projects')
  revalidatePath('/settings/boards')
  return {}
}

/** A column added at the right end of the board, for a status it does not show yet. */
export async function addColumn(boardId: string, status: string): Promise<{ error?: string }> {
  const user = await requireManagement()
  if (!(status in ProjectStatus)) return { error: 'saveFailed' }
  if (!(await addBoardColumn(boardId, status))) return { error: 'saveFailed' }
  await audit({ userId: user.id, action: 'board.column.add', entity: 'Board', entityId: boardId, newValue: status })
  revalidatePath('/projects')
  revalidatePath('/settings/boards')
  return {}
}

/** A column taken off the board; its projects stay, on every board that still shows their status. */
export async function removeColumn(boardId: string, status: string): Promise<{ error?: string }> {
  const user = await requireManagement()
  if (!(status in ProjectStatus)) return { error: 'saveFailed' }
  if (!(await removeBoardColumn(boardId, status))) return { error: 'lastColumn' }
  await audit({ userId: user.id, action: 'board.column.remove', entity: 'Board', entityId: boardId, oldValue: status })
  revalidatePath('/projects')
  revalidatePath('/settings/boards')
  return {}
}

/**
 * The order a board's columns stand in, as somebody dragged them. Which
 * columns a board has is chosen in Einstellungen; the order they stand in is
 * chosen here, on the board itself, where it can be seen.
 *
 * Management rather than admin: this is arranging a desk, not changing what
 * the company records.
 */
export async function setBoardOrder(boardId: string, statuses: string[]): Promise<{ error?: string }> {
  const user = await requireStaff()
  if (!(await saveColumnOrder(boardId, statuses))) return { error: 'notFound' }
  await audit({ userId: user.id, action: 'board.columns', entity: 'Board', entityId: boardId, newValue: statuses.join(',') })
  revalidatePath('/projects')
  revalidatePath('/settings/boards')
  return {}
}

/** Which board this browser opened last, so the projects page comes back to it. */
export async function rememberBoard(boardId: string): Promise<void> {
  await requireStaff()
  const store = await cookies()
  store.set(BOARD_COOKIE, boardId, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

// ── Project items (tools & materials) ─────────────────────────

const ITEM_STATUSES = ['REQUIRED', 'COLLECTED', 'MISSING'] as const
type ItemStatus = (typeof ITEM_STATUSES)[number]

export async function addProjectItem(
  projectId: string,
  catalogItemId: string,
  quantity: number | null
): Promise<{ error?: 'itemAlreadyAdded' | 'saveFailed' }> {
  const user = await requireStaff()
  if (!catalogItemId) return { error: 'saveFailed' }
  const qty =
    quantity != null && Number.isFinite(quantity) && quantity >= 0 && quantity <= 999_999_999
      ? quantity
      : null
  try {
    const item = await db.projectItem.create({
      data: { projectId, catalogItemId, quantity: qty },
      include: { catalogItem: { select: { name: true } } },
    })
    await audit({
      userId: user.id,
      action: 'projectItem.add',
      entity: 'Project',
      entityId: projectId,
      newValue: item.catalogItem.name,
    })
  } catch (e: unknown) {
    const isUniqueConflict =
      typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
    if (isUniqueConflict) return { error: 'itemAlreadyAdded' }
    return { error: 'saveFailed' }
  }
  revalidatePath(`/projects/${projectId}`)
  return {}
}

export async function removeProjectItem(projectId: string, projectItemId: string): Promise<void> {
  const user = await requireStaff()
  const item = await db.projectItem.findUnique({
    where: { id: projectItemId },
    include: { catalogItem: { select: { name: true } } },
  })
  if (!item || item.projectId !== projectId) return
  await db.projectItem.delete({ where: { id: projectItemId } })
  await audit({
    userId: user.id,
    action: 'projectItem.remove',
    entity: 'Project',
    entityId: projectId,
    oldValue: item.catalogItem.name,
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function setProjectItemStatus(
  projectId: string,
  projectItemId: string,
  status: string
): Promise<void> {
  const user = await requireStaff()
  if (!ITEM_STATUSES.includes(status as ItemStatus)) return
  const item = await db.projectItem.findUnique({
    where: { id: projectItemId },
    include: { catalogItem: { select: { name: true } } },
  })
  if (!item || item.projectId !== projectId) return
  await db.projectItem.update({
    where: { id: projectItemId },
    data: { status: status as ItemStatus },
  })
  await audit({
    userId: user.id,
    action: 'projectItem.status',
    entity: 'Project',
    entityId: projectId,
    field: item.catalogItem.name,
    oldValue: item.status,
    newValue: status,
  })
  revalidatePath(`/projects/${projectId}`)
}

export type DeleteState = { error?: string }

export async function deleteProject(
  id: string,
  _prev: DeleteState,
  _formData: FormData
): Promise<DeleteState> {
  const user = await requireAdmin()
  const snapshot = await projectBefore(id)
  const project = await db.project.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'project.delete',
    entity: 'Project',
    entityId: id,
    oldValue: `${project.number} ${project.name}`,
  })
  await announceProjectDeleted(snapshot, { type: 'user', userId: user.id })
  revalidatePath('/projects')
  redirect('/projects')
}

// ── Follow-on offers ("Nachträge") ───────────────────────────

export type AddOnResult = { error?: 'invalidAmount' | 'labelRequired' | 'notAllowed' | 'saveFailed' }

/**
 * Adds an accepted follow-on offer to the project. It raises the order value
 * everywhere (project page, revenue, pipeline, customer report), so only users
 * with financial access may book one.
 */
export async function addProjectAddOn(projectId: string, formData: FormData): Promise<AddOnResult> {
  const user = await requireManagement()
  if (!canViewFinancials(user)) return { error: 'notAllowed' }
  const label = String(formData.get('label') ?? '').trim().slice(0, 200)
  const raw = String(formData.get('amount') ?? '').replace(',', '.').trim()
  const dateRaw = String(formData.get('date') ?? '')
  const amount = Number(raw)
  if (!label) return { error: 'labelRequired' }
  if (!raw || !Number.isFinite(amount) || amount <= 0 || amount > 99_999_999) return { error: 'invalidAmount' }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? new Date(`${dateRaw}T00:00:00.000Z`) : new Date()

  const project = await db.project.findUnique({ where: { id: projectId }, select: { number: true } })
  if (!project) return { error: 'saveFailed' }
  const snapshot = await projectBefore(projectId)
  await db.projectAddOn.create({ data: { projectId, label, amount, date } })
  await audit({
    userId: user.id,
    action: 'project.addOn',
    entity: 'Project',
    entityId: projectId,
    field: label,
    newValue: String(amount),
  })
  // The order value changed with it.
  await announceProjectChanges(snapshot, { type: 'user', userId: user.id })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/reports')
  return {}
}

export async function removeProjectAddOn(projectId: string, addOnId: string): Promise<AddOnResult> {
  const user = await requireManagement()
  if (!canViewFinancials(user)) return { error: 'notAllowed' }
  const addOn = await db.projectAddOn.findFirst({ where: { id: addOnId, projectId } })
  if (!addOn) return { error: 'saveFailed' }
  const snapshot = await projectBefore(projectId)
  await db.projectAddOn.delete({ where: { id: addOnId } })
  await audit({
    userId: user.id,
    action: 'project.addOnRemoved',
    entity: 'Project',
    entityId: projectId,
    field: addOn.label,
    oldValue: String(Number(addOn.amount)),
  })
  await announceProjectChanges(snapshot, { type: 'user', userId: user.id })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/reports')
  return {}
}

// ── Two records, one project ─────────────────────────────────

export type MergeResult = {
  error?: 'notFound' | 'same' | 'saveFailed'
  /** Assignments left behind: the kept project already had one on that day. */
  conflicts?: number
}

/**
 * Folds one project into another. Everything that hangs on the dropped
 * project moves to the kept one; the kept one takes over what it lacks —
 * the board card it came from above all, so the next import updates it
 * instead of creating the duplicate again — and the dropped one is deleted.
 * A project has one assignment per day, so an assignment on a day the kept
 * project already has stays behind and is reported.
 */
export async function mergeProjects(keepId: string, dropId: string): Promise<MergeResult> {
  const user = await requireAdmin()
  if (keepId === dropId) return { error: 'same' }
  const [keep, drop] = await Promise.all([
    db.project.findUnique({ where: { id: keepId } }),
    db.project.findUnique({ where: { id: dropId } }),
  ])
  if (!keep || !drop) return { error: 'notFound' }

  const [cats, team, vehicles, devices, items, days] = await Promise.all([
    db.projectWorkCategory.findMany({ where: { projectId: keepId }, select: { workCategoryId: true } }),
    db.projectEmployee.findMany({ where: { projectId: keepId }, select: { employeeId: true } }),
    db.projectVehicle.findMany({ where: { projectId: keepId }, select: { vehicleId: true } }),
    db.projectDevice.findMany({ where: { projectId: keepId }, select: { deviceId: true } }),
    db.projectItem.findMany({ where: { projectId: keepId }, select: { catalogItemId: true } }),
    db.scheduleEntry.findMany({ where: { projectId: keepId }, select: { date: true } }),
  ])
  const keepDays = days.map((d) => d.date)
  const conflicts = await db.scheduleEntry.count({ where: { projectId: dropId, date: { in: keepDays } } })
  const keepLinks = await db.projectLink.findMany({ where: { projectId: keepId }, select: { system: true } })
  const keepInvoices = await db.projectInvoice.findMany({ where: { projectId: keepId }, select: { part: true } })
  const [keepSnapshot, dropSnapshot] = await Promise.all([projectBefore(keepId), projectBefore(dropId)])

  const from = `${drop.number} ${drop.name}`
  const joined = (mine: string | null, theirs: string | null) =>
    theirs ? `${mine ? `${mine}\n\n` : ''}--- ${from} ---\n${theirs}` : mine

  try {
    await db.$transaction([
      db.projectWorkCategory.updateMany({
        where: { projectId: dropId, workCategoryId: { notIn: cats.map((c) => c.workCategoryId) } },
        data: { projectId: keepId },
      }),
      db.projectEmployee.updateMany({
        where: { projectId: dropId, employeeId: { notIn: team.map((t) => t.employeeId) } },
        data: { projectId: keepId },
      }),
      db.projectVehicle.updateMany({
        where: { projectId: dropId, vehicleId: { notIn: vehicles.map((v) => v.vehicleId) } },
        data: { projectId: keepId },
      }),
      db.projectDevice.updateMany({
        where: { projectId: dropId, deviceId: { notIn: devices.map((d) => d.deviceId) } },
        data: { projectId: keepId },
      }),
      db.projectItem.updateMany({
        where: { projectId: dropId, catalogItemId: { notIn: items.map((i) => i.catalogItemId) } },
        data: { projectId: keepId },
      }),
      db.scheduleEntry.updateMany({
        where: { projectId: dropId, date: { notIn: keepDays } },
        data: { projectId: keepId },
      }),
      db.projectAddOn.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.note.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.document.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.projectChecklist.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.timeEntry.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.deviceAssignment.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.planEntry.updateMany({ where: { projectId: dropId }, data: { projectId: keepId } }),
      db.projectLink.updateMany({
        where: { projectId: dropId, system: { notIn: keepLinks.map((l) => l.system) } },
        data: { projectId: keepId },
      }),
      db.projectInvoice.updateMany({
        where: { projectId: dropId, part: { notIn: keepInvoices.map((i) => i.part) } },
        data: { projectId: keepId },
      }),
      db.project.update({
        where: { id: keepId },
        data: {
          externalSystem: keep.externalSystem ?? drop.externalSystem,
          externalId: keep.externalId ?? drop.externalId,
          externalUrl: keep.externalUrl ?? drop.externalUrl,
          sourceCreatedAt: keep.sourceCreatedAt ?? drop.sourceCreatedAt,
          clientType: keep.clientType ?? drop.clientType,
          buildingType: keep.buildingType ?? drop.buildingType,
          priority: keep.priority ?? drop.priority,
          leadSource: keep.leadSource ?? drop.leadSource,
          street: keep.street ?? drop.street,
          city: keep.city ?? drop.city,
          postalCode: keep.postalCode ?? drop.postalCode,
          latitude: keep.latitude ?? drop.latitude,
          longitude: keep.longitude ?? drop.longitude,
          phone: keep.phone ?? drop.phone,
          contact: keep.contact ?? drop.contact,
          price: keep.price ?? drop.price,
          isSub: keep.isSub || drop.isSub,
          plannedStart: keep.plannedStart ?? drop.plannedStart,
          plannedEnd: keep.plannedEnd ?? drop.plannedEnd,
          dueDate: keep.dueDate ?? drop.dueDate,
          actualStart: keep.actualStart ?? drop.actualStart,
          actualEnd: keep.actualEnd ?? drop.actualEnd,
          managerId: keep.managerId ?? drop.managerId,
          description: joined(keep.description, drop.description),
          internalNotes: joined(keep.internalNotes, drop.internalNotes),
        },
      }),
      db.project.delete({ where: { id: dropId } }),
    ])
  } catch (e) {
    console.error('merge failed', e)
    return { error: 'saveFailed' }
  }

  await audit({
    userId: user.id,
    action: 'project.merge',
    entity: 'Project',
    entityId: keepId,
    oldValue: from,
    newValue: `${keep.number} ${keep.name}`,
  })
  const actor = { type: 'user' as const, userId: user.id }
  await announceProjectChanges(keepSnapshot, actor)
  await announceProjectDeleted(dropSnapshot, actor, { id: keepId, number: keep.number })
  for (const path of ['/projects', `/projects/${keepId}`, '/schedule', '/reports', '/reports/plan']) {
    revalidatePath(path)
  }
  return { conflicts }
}

// ── The board: a card added from its list, a card changed from its menu ──

export type QuickAddResult = { error?: 'nameRequired' | 'customerRequired' | 'saveFailed' }

/**
 * "Karte hinzufügen" at the foot of a list: a project with a name and a
 * customer — picked, or made from the name typed — in that list's status.
 * Everything else is filled in on the card afterwards.
 */
/**
 * Lays a template over a project that was just made with nothing but a name
 * and a customer: what the template recommends — description, trade, site
 * manager, crew, vehicles, machines, tools and materials, checklists — copied
 * onto it, the way the long form does when it is opened with a template.
 */
async function applyTemplate(projectId: string, templateId: string) {
  const template = await db.projectTemplate.findFirst({
    where: { id: templateId, active: true },
    select: {
      description: true,
      workCategoryId: true,
      managerId: true,
      vehicles: { select: { vehicleId: true } },
      employees: { select: { employeeId: true } },
      checklists: { select: { checklistTemplateId: true } },
      deviceNeeds: { select: { deviceId: true } },
      items: { select: { catalogItemId: true, quantity: true } },
    },
  })
  if (!template) return
  // The site manager belongs to the crew, as in the form.
  const crew = [...new Set([...(template.managerId ? [template.managerId] : []), ...template.employees.map((e) => e.employeeId)])]
  await db.project.update({
    where: { id: projectId },
    data: {
      ...(template.description ? { description: template.description } : {}),
      ...(template.managerId ? { managerId: template.managerId } : {}),
      ...(template.workCategoryId ? { workCategories: { create: [{ workCategoryId: template.workCategoryId }] } } : {}),
      team: { create: crew.map((employeeId) => ({ employeeId })) },
      vehicles: { create: template.vehicles.map((v) => ({ vehicleId: v.vehicleId })) },
      deviceNeeds: { create: template.deviceNeeds.map((d) => ({ deviceId: d.deviceId })) },
    },
  })
  if (template.items.length > 0) {
    await db.projectItem.createMany({
      data: template.items.map((item) => ({ projectId, catalogItemId: item.catalogItemId, quantity: item.quantity })),
      skipDuplicates: true,
    })
  }
  await copyChecklistsToProject(projectId, template.checklists.map((c) => c.checklistTemplateId))
}

export async function quickAddProject(status: string, formData: FormData): Promise<QuickAddResult> {
  const user = await requireStaff()
  const name = String(formData.get('name') ?? '').trim().slice(0, 300)
  const templateId = String(formData.get('templateId') ?? '').trim()
  const customerId = String(formData.get('customerId') ?? '').trim()
  const customerName = String(formData.get('customerName') ?? '').trim().slice(0, 200)
  if (!name) return { error: 'nameRequired' }
  if (!customerId && !customerName) return { error: 'customerRequired' }
  if (!(status in ProjectStatus)) return { error: 'saveFailed' }
  try {
    const input = createProjectInput.parse({ name, status, ...(customerId ? { customerId } : { customerName }) })
    const project = await createProjectRecord(user, input, { type: 'user', userId: user.id })
    if (templateId) await applyTemplate(project.id, templateId)
    // A site manager's own card: named on it from the start, or it would vanish from their board.
    if (user.role === 'SITE_MANAGER' && user.employee && !templateId) {
      await db.project.update({ where: { id: project.id }, data: { managerId: user.employee.id } })
    }
  } catch (e) {
    console.error('quick add failed', e)
    return { error: 'saveFailed' }
  }
  revalidatePath('/projects')
  return {}
}

/** The quick menu on a card: another name, or urgent on and off. */
export async function quickUpdateProject(
  id: string,
  changes: { name?: string; urgent?: boolean }
): Promise<{ error?: 'nameRequired' | 'saveFailed' }> {
  const user = await requireStaff()
  if (!(await canSeeProject(user, id))) return { error: 'saveFailed' }
  const project = await db.project.findUnique({ where: { id }, select: { name: true, priority: true } })
  if (!project) return { error: 'saveFailed' }
  const data: { name?: string; priority?: string | null } = {}
  if (changes.name !== undefined) {
    const name = changes.name.trim().slice(0, 300)
    if (!name) return { error: 'nameRequired' }
    if (name !== project.name) data.name = name
  }
  if (changes.urgent !== undefined) {
    // Taking "hoch" away leaves a "niedrig" alone.
    const priority = changes.urgent ? 'HIGH' : project.priority === 'HIGH' ? null : project.priority
    if (priority !== project.priority) data.priority = priority
  }
  if (Object.keys(data).length === 0) return {}
  const snapshot = await projectBefore(id)
  await db.project.update({ where: { id }, data })
  if (data.name !== undefined) {
    await audit({ userId: user.id, action: 'project.update', entity: 'Project', entityId: id, field: 'name', oldValue: project.name, newValue: data.name })
  }
  if (data.priority !== undefined) {
    await audit({ userId: user.id, action: 'project.update', entity: 'Project', entityId: id, field: 'priority', oldValue: project.priority, newValue: data.priority })
  }
  await announceProjectChanges(snapshot, { type: 'user', userId: user.id })
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return {}
}
