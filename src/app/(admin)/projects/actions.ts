'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, requireManagement, canViewFinancials } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { actualDatesForStatus } from '@/lib/project-lifecycle'
import { ProjectStatus } from '@/generated/prisma/enums'

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
    street: optional,
    postalCode: optional,
    city: optional,
    latitude: coord,
    longitude: coord,
    phone: optional,
    contact: optional,
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    actualStart: optionalDate,
    actualEnd: optionalDate,
    managerId: z.string().transform((v) => (v ? v : null)),
    vehicleIds: z.array(z.string().min(1)).max(20),
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
    actualStart: formData.get('actualStart') ?? '',
    actualEnd: formData.get('actualEnd') ?? '',
    managerId: formData.get('managerId') ?? '',
    vehicleIds: formData.getAll('vehicleIds').map(String).filter(Boolean),
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

async function nextProjectNumber(): Promise<string> {
  const year = new Date().getUTCFullYear()
  const prefix = `${year}-`
  const last = await db.project.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const lastSeq = last ? Number(last.number.slice(prefix.length)) : 0
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`
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
          actualStart: d.actualStart,
          actualEnd: d.actualEnd,
          managerId: d.managerId,
          description: d.description,
          internalNotes: d.internalNotes,
          workCategories: { create: d.categoryIds.map((id) => ({ workCategoryId: id })) },
          team: { create: d.teamIds.map((id) => ({ employeeId: id })) },
          vehicles: { create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
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

  await audit({
    userId: user.id,
    action: 'project.create',
    entity: 'Project',
    entityId: project.id,
    newValue: `${project.number} ${project.name}${templateId ? ' (Vorlage)' : ''}`,
  })
  revalidatePath('/projects')
  redirect(`/projects/${project.id}`)
}

export async function updateProject(
  id: string,
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const user = await requireManagement()
  const parsed = parseProjectForm(formData)
  if (!parsed.success) return { error: formErrorKey(parsed.error.issues) }

  const before = await db.project.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }

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
    },
  })

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
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  redirect(`/projects/${id}`)
}

// ── Quick status change (detail page header) ─────────────────

export async function setProjectStatus(id: string, status: string): Promise<{ error?: string }> {
  const user = await requireManagement()
  if (!(status in ProjectStatus)) return { error: 'saveFailed' }
  const before = await db.project.findUnique({
    where: { id },
    select: { status: true, number: true, actualStart: true, actualEnd: true },
  })
  if (!before) return { error: 'saveFailed' }
  if (before.status === status) return {}
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
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  revalidatePath('/dashboard')
  return {}
}

// ── Project items (tools & materials) ─────────────────────────

const ITEM_STATUSES = ['REQUIRED', 'COLLECTED', 'MISSING'] as const
type ItemStatus = (typeof ITEM_STATUSES)[number]

export async function addProjectItem(
  projectId: string,
  catalogItemId: string,
  quantity: number | null
): Promise<{ error?: 'itemAlreadyAdded' | 'saveFailed' }> {
  const user = await requireManagement()
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
  const user = await requireManagement()
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
  const user = await requireManagement()
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
  const project = await db.project.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'project.delete',
    entity: 'Project',
    entityId: id,
    oldValue: `${project.number} ${project.name}`,
  })
  revalidatePath('/projects')
  redirect('/projects')
}
