import 'server-only'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'
import type { CurrentUser } from './auth'
import { canViewFinancials } from './authz'
import { audit } from './audit'
import { ProjectStatus } from '@/generated/prisma/enums'
import { isUniqueClash, nextProjectNumber } from './project-numbers'
import { entrySchema, type EntryResult } from './schedule-entry'
import { createEntries } from './schedule-service'
import { actualDatesForStatus } from './project-lifecycle'
import { getPlanGaps, getYearRevenue, orderValue } from './reports'
import {
  announceInvoiceReady,
  announceProjectChanges,
  announceProjectCreated,
  projectBefore,
  statusSinceFor,
  type EventActor,
} from './project-events'
import { normalizeSystem, trelloShortLink } from './webhook-events'
import { suggestStatus } from './trello'
import { INVOICE_KIND, invoicePartOf, suggestedInvoiceAmount, type InvoicePart } from './invoices'
import { COMMENT_MAX } from './comments'
import { createComment, displayName } from './comments-db'
import { mimeFromName, safeFileName, storageKeyFor, validateUpload } from './files'
import { saveStoredFile } from './file-storage'

// What the API and the MCP tools do, in one place. Every function takes the
// user the caller acts as and gives back plain data; the same rules as the
// pages apply — management only, and money only for those who may see it.

/** A refusal or a miss, with the HTTP status it means. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? code)
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

function assertManagement(user: CurrentUser): void {
  if (user.role === 'EMPLOYEE') throw new ApiError(403, 'forbidden', 'This key belongs to a crew account; the API is for the office.')
}

function assertFinancials(user: CurrentUser): void {
  assertManagement(user)
  if (!canViewFinancials(user)) throw new ApiError(403, 'forbidden', 'This user may not see financial data.')
}

/** Who an event names when the caller did not say: the key's user, over the API. */
const actorFor = (user: CurrentUser, actor?: EventActor): EventActor => actor ?? { type: 'api', userId: user.id, key: null }

/** A text that may be sent to clear a field: absent leaves it, null or empty clears it. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null))

// ── Projects ──────────────────────────────────────────────────────────

const projectSelect = {
  id: true,
  number: true,
  name: true,
  status: true,
  isSub: true,
  price: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  street: true,
  postalCode: true,
  city: true,
  description: true,
  externalUrl: true,
  sourceCreatedAt: true,
  createdAt: true,
  customer: { select: { id: true, name: true, company: true, contactPerson: true, email: true, phone: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  addOns: { select: { amount: true } },
  links: { select: { system: true, externalId: true, url: true }, orderBy: { system: 'asc' } },
  invoices: { select: { part: true, number: true, amount: true, readyAt: true }, orderBy: { part: 'asc' } },
} as const

type ProjectRow = {
  id: string
  number: string
  name: string
  status: ProjectStatus
  isSub: boolean
  price: { toString(): string } | null
  plannedStart: Date | null
  plannedEnd: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  street: string | null
  postalCode: string | null
  city: string | null
  description: string | null
  externalUrl: string | null
  sourceCreatedAt: Date | null
  createdAt: Date
  customer: {
    id: string
    name: string
    company: string | null
    contactPerson: string | null
    email: string | null
    phone: string | null
  }
  manager: { id: string; firstName: string; lastName: string } | null
  addOns: Array<{ amount: { toString(): string } }>
  links: Array<{ system: string; externalId: string; url: string | null }>
  invoices: Array<{ part: number; number: string | null; amount: { toString(): string } | null; readyAt: Date }>
}

function projectDto(p: ProjectRow, user: CurrentUser, statusSince: Date) {
  const money = canViewFinancials(user)
  return {
    id: p.id,
    number: p.number,
    name: p.name,
    status: p.status,
    /** Since when it stands in that status — for reminders on offers nobody answered. */
    statusSince: statusSince.toISOString(),
    isSub: p.isSub,
    customer: p.customer,
    manager: p.manager ? { id: p.manager.id, name: `${p.manager.firstName} ${p.manager.lastName}`.trim() } : null,
    address: { street: p.street, postalCode: p.postalCode, city: p.city },
    plannedStart: day(p.plannedStart),
    plannedEnd: day(p.plannedEnd),
    actualStart: day(p.actualStart),
    actualEnd: day(p.actualEnd),
    description: p.description,
    externalUrl: p.externalUrl,
    links: p.links,
    // Money only for those who may see it; the field is absent, not null.
    ...(money
      ? {
          price: p.price === null ? null : Number(p.price),
          orderValue: orderValue(p.price === null ? null : Number(p.price), p.addOns),
          /** The invoices marked ready so far — 1 the first half, 2 the final one. */
          invoices: p.invoices.map((i) => ({
            part: i.part,
            kind: INVOICE_KIND[i.part as InvoicePart],
            number: i.number,
            amount: i.amount === null ? null : Number(i.amount),
            readyAt: i.readyAt.toISOString(),
          })),
        }
      : {}),
  }
}

export const listProjectsInput = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(ProjectStatus).optional(),
  /** Only projects linked to this system ("trello"), and with `externalId` to that one record. */
  system: z.string().trim().max(40).optional(),
  externalId: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function listProjects(user: CurrentUser, input: z.infer<typeof listProjectsInput>) {
  assertManagement(user)
  const system = input.system ? normalizeSystem(input.system) : null
  if (input.system && !system) throw new ApiError(400, 'invalid', 'system is letters, digits, - and _.')
  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(system ? { links: { some: { system, ...(input.externalId ? { externalId: input.externalId } : {}) } } } : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: 'insensitive' as const } },
            { number: { contains: input.q } },
            { customer: { name: { contains: input.q, mode: 'insensitive' as const } } },
            { city: { contains: input.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.project.findMany({ where, select: projectSelect, orderBy: { number: 'desc' }, take: input.limit, skip: input.offset }),
    db.project.count({ where }),
  ])
  const since = await statusSinceFor(rows)
  return { items: rows.map((p) => projectDto(p, user, since.get(p.id)!)), total, limit: input.limit, offset: input.offset }
}

/** A project by id or by its number ("2026-0048"). */
export async function getProject(user: CurrentUser, idOrNumber: string) {
  assertManagement(user)
  const p = await db.project.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    select: {
      ...projectSelect,
      team: { select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      vehicles: { select: { vehicle: { select: { id: true, name: true } } } },
      scheduleEntries: {
        where: { cancelledAt: null },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          note: true,
          employees: { select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
          vehicles: { select: { vehicle: { select: { id: true, name: true } } } },
        },
      },
      planEntries: { select: { year: true, month: true, name: true, amount: true }, orderBy: [{ year: 'asc' }, { month: 'asc' }] },
    },
  })
  if (!p) throw new ApiError(404, 'notFound', 'No such project.')
  const since = await statusSinceFor([p])
  return {
    ...projectDto(p, user, since.get(p.id)!),
    team: p.team.map((t) => ({ id: t.employee.id, name: `${t.employee.firstName} ${t.employee.lastName}`.trim() })),
    vehicles: p.vehicles.map((v) => v.vehicle),
    schedule: p.scheduleEntries.map((e) => ({
      id: e.id,
      date: day(e.date),
      startTime: e.startTime,
      endTime: e.endTime,
      note: e.note,
      employees: e.employees.map((x) => ({ id: x.employee.id, name: `${x.employee.firstName} ${x.employee.lastName}`.trim() })),
      vehicles: e.vehicles.map((x) => x.vehicle),
    })),
    ...(canViewFinancials(user)
      ? { planLines: p.planEntries.map((l) => ({ year: l.year, month: l.month, name: l.name, amount: Number(l.amount) })) }
      : {}),
  }
}

export const createProjectInput = z
  .object({
    name: z.string().trim().min(1).max(300),
    customerId: z.string().min(1).optional(),
    /** Found by name, or created when there is no such customer. */
    customerName: z.string().trim().min(1).max(200).optional(),
    status: z.enum(ProjectStatus).default('LEAD'),
    isSub: z.boolean().default(false),
    plannedStart: isoDate.optional(),
    plannedEnd: isoDate.optional(),
    price: z.number().min(0).max(999_999_999).optional(),
    street: text(200),
    postalCode: text(20),
    city: text(120),
    description: text(10000),
  })
  .refine((d) => d.customerId || d.customerName, { message: 'customerId or customerName is required', path: ['customerId'] })
  .refine((d) => !(d.plannedStart && d.plannedEnd) || d.plannedEnd >= d.plannedStart, {
    message: 'plannedEnd must not be before plannedStart',
    path: ['plannedEnd'],
  })

/** A customer by id, or by name — found, or made — with what is known of how to reach them. */
async function customerFor(input: { customerId?: string; customerName?: string; customer?: CustomerContactFields }): Promise<string> {
  if (input.customerId) {
    if (!(await db.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }))) {
      throw new ApiError(404, 'notFound', 'No such customer.')
    }
    if (input.customer) await fillCustomerGaps(input.customerId, input.customer)
    return input.customerId
  }
  const name = input.customer?.name ?? input.customerName
  if (!name) throw new ApiError(400, 'invalid', 'customerId, customer or customerName is required.')
  const existing = await db.customer.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) {
    if (input.customer) await fillCustomerGaps(existing.id, input.customer)
    return existing.id
  }
  const { name: _name, ...contact } = input.customer ?? { name }
  return (await db.customer.create({ data: { name, ...contact }, select: { id: true } })).id
}

/** Contact details are added where the customer has none; what the office entered is never overwritten. */
async function fillCustomerGaps(customerId: string, contact: CustomerContactFields): Promise<void> {
  const current = await db.customer.findUnique({ where: { id: customerId } })
  if (!current) return
  const data: Record<string, string> = {}
  for (const key of ['company', 'contactPerson', 'phone', 'email', 'street', 'postalCode', 'city'] as const) {
    const value = contact[key]
    if (value && !current[key]) data[key] = value
  }
  if (Object.keys(data).length > 0) await db.customer.update({ where: { id: customerId }, data })
}

/**
 * The site manager an automation names: by id, or by the full name as the
 * other system spells it ("Vorname Nachname", case and spaces aside). A name
 * that fits nobody, or more than one, sets nothing and says so.
 */
async function managerFor(input: { managerId?: string | null; managerName?: string }): Promise<{ id?: string | null; warning?: string }> {
  if (input.managerId !== undefined) {
    if (input.managerId === null) return { id: null }
    if (!(await db.employee.findUnique({ where: { id: input.managerId }, select: { id: true } }))) {
      throw new ApiError(404, 'notFound', 'No such employee.')
    }
    return { id: input.managerId }
  }
  if (!input.managerName) return {}
  const wanted = input.managerName.toLowerCase().replace(/\s+/g, ' ').trim()
  const people = await db.employee.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true } })
  const fits = people.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().replace(/\s+/g, ' ').trim() === wanted)
  if (fits.length === 1) return { id: fits[0].id }
  return { warning: fits.length === 0 ? 'managerNotFound' : 'managerAmbiguous' }
}

/** Makes the project and gives back its id; telling automations is the caller's, once everything hangs on it. */
async function insertProject(user: CurrentUser, data: Omit<Prisma.ProjectUncheckedCreateInput, 'number'>): Promise<string> {
  // Retry once if the sequential number collides with a concurrent create.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await db.project.create({ data: { ...data, number: await nextProjectNumber() }, select: { id: true } })
      await audit({ userId: user.id, action: 'api.project.create', entity: 'Project', entityId: created.id, newValue: data.name })
      return created.id
    } catch (e) {
      if (!isUniqueClash(e) || attempt === 1) throw e
    }
  }
  throw new ApiError(500, 'saveFailed')
}

export async function createProject(user: CurrentUser, input: z.infer<typeof createProjectInput>, actor?: EventActor) {
  assertManagement(user)
  const customerId = await customerFor(input)
  const id = await insertProject(user, {
    name: input.name,
    customerId,
    status: input.status,
    isSub: input.isSub,
    plannedStart: input.plannedStart ? utcDay(input.plannedStart) : null,
    plannedEnd: input.plannedEnd ? utcDay(input.plannedEnd) : null,
    price: canViewFinancials(user) && input.price !== undefined ? input.price : null,
    street: input.street,
    postalCode: input.postalCode,
    city: input.city,
    description: input.description,
  })
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  await announceProjectCreated(id, actorFor(user, actor))
  return getProject(user, id)
}

export const projectStatusInput = z.object({ status: z.enum(ProjectStatus) })

export async function setProjectStatus(user: CurrentUser, idOrNumber: string, status: ProjectStatus, actor?: EventActor) {
  return updateProject(user, idOrNumber, { status }, actor)
}

export const updateProjectInput = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    status: z.enum(ProjectStatus).optional(),
    isSub: z.boolean().optional(),
    plannedStart: isoDate.nullable().optional(),
    plannedEnd: isoDate.nullable().optional(),
    price: z.number().min(0).max(999_999_999).nullable().optional(),
    managerId: z.string().min(1).nullable().optional(),
    /** Matched against the employees' full names; nothing is set when nobody, or more than one, fits. */
    managerName: z.string().trim().min(1).max(200).optional(),
    description: clearableText(10000),
    street: clearableText(200),
    postalCode: clearableText(20),
    city: clearableText(120),
  })
  .strict()

/**
 * Changes what is sent and leaves the rest: an absent field stays as it is,
 * null clears it. A new status fills the actual dates the way the pages do.
 * The money needs financial access; a manager's name that fits nobody is
 * reported in `warnings` rather than refused.
 */
export async function updateProject(
  user: CurrentUser,
  idOrNumber: string,
  input: Partial<z.infer<typeof updateProjectInput>>,
  actor?: EventActor
) {
  assertManagement(user)
  const current = await db.project.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    select: { id: true, status: true, actualStart: true, actualEnd: true, plannedStart: true, plannedEnd: true },
  })
  if (!current) throw new ApiError(404, 'notFound', 'No such project.')

  const warnings: string[] = []
  const data: Prisma.ProjectUncheckedUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.isSub !== undefined) data.isSub = input.isSub
  if (input.description !== undefined) data.description = input.description
  if (input.street !== undefined) data.street = input.street
  if (input.postalCode !== undefined) data.postalCode = input.postalCode
  if (input.city !== undefined) data.city = input.city
  if (input.plannedStart !== undefined) data.plannedStart = input.plannedStart ? utcDay(input.plannedStart) : null
  if (input.plannedEnd !== undefined) data.plannedEnd = input.plannedEnd ? utcDay(input.plannedEnd) : null
  const start = input.plannedStart !== undefined ? (data.plannedStart as Date | null) : current.plannedStart
  const end = input.plannedEnd !== undefined ? (data.plannedEnd as Date | null) : current.plannedEnd
  if (start && end && end < start) throw new ApiError(400, 'invalid', 'plannedEnd must not be before plannedStart.')
  if (input.price !== undefined) {
    if (!canViewFinancials(user)) throw new ApiError(403, 'forbidden', 'This user may not change the price.')
    data.price = input.price
  }
  const manager = await managerFor(input)
  if (manager.id !== undefined) data.managerId = manager.id
  if (manager.warning) warnings.push(manager.warning)
  const statusChanged = input.status !== undefined && input.status !== current.status
  if (statusChanged) {
    data.status = input.status
    Object.assign(data, await actualDatesForStatus(current.id, input.status!, current))
  }

  if (Object.keys(data).length > 0) {
    const before = await projectBefore(current.id)
    await db.project.update({ where: { id: current.id }, data })
    if (statusChanged) {
      await audit({
        userId: user.id,
        action: 'api.project.status',
        entity: 'Project',
        entityId: current.id,
        field: 'status',
        oldValue: current.status,
        newValue: input.status,
      })
    }
    const fields = Object.keys(data).filter((k) => k !== 'status' && k !== 'actualStart' && k !== 'actualEnd')
    if (fields.length > 0) {
      await audit({ userId: user.id, action: 'api.project.update', entity: 'Project', entityId: current.id, newValue: fields.join(', ') })
    }
    revalidatePath('/projects')
    revalidatePath(`/projects/${current.id}`)
    revalidatePath('/dashboard')
    await announceProjectChanges(before, actorFor(user, actor))
  }
  const project = await getProject(user, current.id)
  return warnings.length > 0 ? { ...project, warnings } : project
}

// ── Links to other systems ───────────────────────────────────────────

const customerContactInput = z.object({
  name: z.string().trim().min(1).max(200),
  company: text(200),
  contactPerson: text(200),
  phone: text(60),
  email: text(200),
  street: text(200),
  postalCode: text(20),
  city: text(120),
})
/** A customer as an automation sends it: the name, and whatever else it knows. */
type CustomerContactFields = Partial<z.infer<typeof customerContactInput>> & { name: string }

export const upsertProjectByLinkInput = updateProjectInput
  .extend({
    customerId: z.string().min(1).optional(),
    customer: customerContactInput.optional(),
    /** The column the card stands in on its board: the status is read from its name when none is sent. */
    list: z.string().trim().min(1).max(200).optional(),
    /** The record's address in the other system. */
    url: z.string().trim().max(500).optional(),
  })
  .strict()

function linkKey(systemRaw: string, externalIdRaw: string): { system: string; externalId: string } {
  const system = normalizeSystem(systemRaw)
  if (!system) throw new ApiError(400, 'invalid', 'The system is letters, digits, - and _ ("trello").')
  const externalId = externalIdRaw.trim()
  if (!externalId || externalId.length > 200) throw new ApiError(400, 'invalid', 'The external id is 1 to 200 characters.')
  return { system, externalId }
}

async function linkedProjectId(system: string, externalId: string): Promise<string | null> {
  const link = await db.projectLink.findUnique({ where: { system_externalId: { system, externalId } }, select: { projectId: true } })
  return link?.projectId ?? null
}

export async function getProjectByLink(user: CurrentUser, systemRaw: string, externalIdRaw: string) {
  assertManagement(user)
  const { system, externalId } = linkKey(systemRaw, externalIdRaw)
  const id = await linkedProjectId(system, externalId)
  if (!id) throw new ApiError(404, 'notFound', 'No project is linked to that record.')
  return getProject(user, id)
}

/**
 * The door for a record of another system — a Trello card, above all: the
 * project linked to it is updated with what is sent, and when there is none
 * a project is made and linked, as a lead unless a status or a board column
 * says otherwise. Sending the same card twice never makes two projects.
 *
 * A project imported from Trello before links existed is found by the card's
 * short link in its address and linked from then on.
 */
export async function upsertProjectByLink(
  user: CurrentUser,
  systemRaw: string,
  externalIdRaw: string,
  input: Partial<Omit<z.infer<typeof upsertProjectByLinkInput>, 'customer'>> & { customer?: CustomerContactFields },
  actor?: EventActor
) {
  assertManagement(user)
  const { system, externalId } = linkKey(systemRaw, externalIdRaw)
  const { customerId, customer, list, url, ...fields } = input
  if (fields.status === undefined && list) fields.status = suggestStatus(list) as ProjectStatus

  let projectId = await linkedProjectId(system, externalId)
  if (!projectId && system === 'trello') {
    const short = trelloShortLink(url)
    const adopted = short
      ? await db.project.findFirst({
          where: { externalUrl: { contains: `/c/${short}` }, links: { none: { system } } },
          select: { id: true },
        })
      : null
    if (adopted) {
      await db.projectLink.create({ data: { projectId: adopted.id, system, externalId, url: url || null } })
      projectId = adopted.id
    }
  }

  if (projectId) {
    if (url) await db.projectLink.update({ where: { system_externalId: { system, externalId } }, data: { url } })
    if (customer) {
      const row = await db.project.findUnique({ where: { id: projectId }, select: { customerId: true } })
      if (row) await fillCustomerGaps(row.customerId, customer)
    }
    return { created: false, project: await updateProject(user, projectId, fields, actor) }
  }

  if (!fields.name) throw new ApiError(400, 'invalid', 'name is required to make a new project.')
  if (fields.plannedStart && fields.plannedEnd && fields.plannedEnd < fields.plannedStart) {
    throw new ApiError(400, 'invalid', 'plannedEnd must not be before plannedStart.')
  }
  if (fields.price != null && !canViewFinancials(user)) throw new ApiError(403, 'forbidden', 'This user may not set the price.')
  const manager = await managerFor(fields)
  const id = await insertProject(user, {
    name: fields.name,
    customerId: await customerFor({ customerId, customer }),
    status: fields.status ?? 'LEAD',
    isSub: fields.isSub ?? false,
    plannedStart: fields.plannedStart ? utcDay(fields.plannedStart) : null,
    plannedEnd: fields.plannedEnd ? utcDay(fields.plannedEnd) : null,
    price: fields.price ?? null,
    managerId: manager.id ?? null,
    description: fields.description ?? null,
    street: fields.street ?? null,
    postalCode: fields.postalCode ?? null,
    city: fields.city ?? null,
  })
  try {
    await db.projectLink.create({ data: { projectId: id, system, externalId, url: url || null } })
  } catch (e) {
    // The same record, sent twice at the same moment: the other request made the project.
    if (!isUniqueClash(e)) throw e
    await db.project.delete({ where: { id } })
    const other = await linkedProjectId(system, externalId)
    if (!other) throw e
    return { created: false, project: await updateProject(user, other, fields, actor) }
  }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  await announceProjectCreated(id, actorFor(user, actor))
  const project = await getProject(user, id)
  return { created: true, project: manager.warning ? { ...project, warnings: [manager.warning] } : project }
}

export const projectLinkInput = z.object({
  externalId: z.string().trim().min(1).max(200),
  url: z.string().trim().max(500).optional(),
})

/** Links a project to its record in a system, or moves its link there; a record linked to another project is refused. */
export async function setProjectLink(user: CurrentUser, idOrNumber: string, systemRaw: string, input: z.infer<typeof projectLinkInput>) {
  assertManagement(user)
  const { system, externalId } = linkKey(systemRaw, input.externalId)
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] }, select: { id: true } })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  const taken = await linkedProjectId(system, externalId)
  if (taken && taken !== project.id) throw new ApiError(409, 'linkTaken', 'That record is linked to another project.')
  await db.projectLink.upsert({
    where: { projectId_system: { projectId: project.id, system } },
    create: { projectId: project.id, system, externalId, url: input.url || null },
    update: { externalId, ...(input.url !== undefined ? { url: input.url || null } : {}) },
  })
  await audit({ userId: user.id, action: 'api.project.link', entity: 'Project', entityId: project.id, field: system, newValue: externalId })
  return getProject(user, project.id)
}

export async function removeProjectLink(user: CurrentUser, idOrNumber: string, systemRaw: string) {
  assertManagement(user)
  const system = normalizeSystem(systemRaw)
  if (!system) throw new ApiError(400, 'invalid', 'The system is letters, digits, - and _.')
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] }, select: { id: true } })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  const removed = await db.projectLink.deleteMany({ where: { projectId: project.id, system } })
  if (removed.count > 0) {
    await audit({ userId: user.id, action: 'api.project.unlink', entity: 'Project', entityId: project.id, field: system })
  }
  return getProject(user, project.id)
}

// ── Invoices ──────────────────────────────────────────────────────────

export const invoiceReadyInput = z.object({
  /** Its number in the accounting program. */
  number: text(60),
  /** Left out: half the order value for the first, what the first left for the final. */
  amount: z.number().min(0).max(999_999_999).nullable().optional(),
})

const invoicePart = (raw: string | number): InvoicePart => {
  const part = invoicePartOf(raw)
  if (!part) throw new ApiError(400, 'invalid', 'The invoice is 1 (first) or 2 (final).')
  return part
}

/**
 * Marks one of a project's two invoices ready — on the project page or from an
 * automation — and tells the automations, which prepare the e-mail. One that is
 * ready already only takes the new number and amount; nobody is told twice.
 */
export async function markInvoiceReady(
  user: CurrentUser,
  idOrNumber: string,
  partRaw: string | number,
  input: { number?: string | null; amount?: number | null },
  actor?: EventActor
) {
  assertFinancials(user)
  const part = invoicePart(partRaw)
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    select: { id: true, price: true, addOns: { select: { amount: true } }, invoices: { select: { part: true, amount: true } } },
  })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  const amountOf = (i: { amount: unknown } | undefined) => (i?.amount == null ? null : Number(i.amount))
  const existing = project.invoices.find((i) => i.part === part)

  if (existing) {
    await db.projectInvoice.update({
      where: { projectId_part: { projectId: project.id, part } },
      data: {
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
      },
    })
  } else {
    const amount =
      input.amount !== undefined
        ? input.amount
        : suggestedInvoiceAmount(part, orderValue(project.price, project.addOns), amountOf(project.invoices.find((i) => i.part === 1)))
    try {
      await db.projectInvoice.create({
        data: { projectId: project.id, part, number: input.number ?? null, amount, readyById: user.id },
      })
    } catch (e) {
      // Marked twice at the same moment: the other request told the automations.
      if (!isUniqueClash(e)) throw e
      return getProject(user, project.id)
    }
  }
  await audit({
    userId: user.id,
    action: existing ? 'project.invoice.change' : 'project.invoice.ready',
    entity: 'Project',
    entityId: project.id,
    field: `invoice${part}`,
    newValue: input.number ?? undefined,
  })
  if (!existing) await announceInvoiceReady(project.id, part, actorFor(user, actor))
  revalidatePath(`/projects/${project.id}`)
  return getProject(user, project.id)
}

/** Takes a ready mark back — marked by mistake. An e-mail an automation already drafted stays where it is. */
export async function withdrawInvoice(user: CurrentUser, idOrNumber: string, partRaw: string | number) {
  assertFinancials(user)
  const part = invoicePart(partRaw)
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] }, select: { id: true } })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  const removed = await db.projectInvoice.deleteMany({ where: { projectId: project.id, part } })
  if (removed.count > 0) {
    await audit({ userId: user.id, action: 'project.invoice.withdraw', entity: 'Project', entityId: project.id, field: `invoice${part}` })
    revalidatePath(`/projects/${project.id}`)
  }
  return getProject(user, project.id)
}

// ── Comments ──────────────────────────────────────────────────────────

export const commentInput = z.object({
  body: z.string().trim().min(1).max(COMMENT_MAX),
  /** For the office only; the team does not see it. */
  office: z.boolean().default(false),
})

const commentSelect = {
  id: true,
  body: true,
  visibility: true,
  mentions: true,
  createdAt: true,
  author: { select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } },
} as const

type CommentRow = {
  id: string
  body: string
  visibility: string
  mentions: string[]
  createdAt: Date
  author: { id: string; username: string; employee: { firstName: string; lastName: string } | null } | null
}

const commentDto = (n: CommentRow) => ({
  id: n.id,
  body: n.body,
  office: n.visibility === 'MANAGEMENT',
  createdAt: n.createdAt.toISOString(),
  author: n.author ? { id: n.author.id, username: n.author.username, name: displayName(n.author) } : null,
  /** The ids of the users named with @. */
  mentions: n.mentions,
})

async function projectIdOf(idOrNumber: string): Promise<string> {
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] }, select: { id: true } })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  return project.id
}

/** The comments on a project, oldest first. */
export async function listComments(user: CurrentUser, idOrNumber: string) {
  assertManagement(user)
  const projectId = await projectIdOf(idOrNumber)
  const rows = await db.note.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, select: commentSelect })
  return rows.map(commentDto)
}

/** A comment from an automation — "Angebot versendet", say — written as the key's user. */
export async function addComment(user: CurrentUser, idOrNumber: string, input: z.infer<typeof commentInput>, actor?: EventActor) {
  assertManagement(user)
  const projectId = await projectIdOf(idOrNumber)
  const result = await createComment({ projectId, authorId: user.id, body: input.body, office: input.office, actor: actorFor(user, actor) })
  if ('error' in result) throw new ApiError(400, 'invalid', 'The comment is empty.')
  revalidatePath(`/projects/${projectId}`)
  const row = await db.note.findUnique({ where: { id: result.id }, select: commentSelect })
  return row ? commentDto(row) : null
}

// ── Files ─────────────────────────────────────────────────────────────

/**
 * A file handed in by an automation — an attachment of the Trello card, say —
 * put on the project for the office. A file sent without a type gets one from
 * its name; the rules on size and type are the upload's own.
 */
export async function addProjectFile(user: CurrentUser, idOrNumber: string, file: File) {
  assertManagement(user)
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] }, select: { id: true } })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  const mimeType = file.type && file.type !== 'application/octet-stream' ? file.type : (mimeFromName(file.name) ?? file.type)
  const invalid = validateUpload(file.size, mimeType)
  if (invalid) throw new ApiError(400, invalid, invalid === 'badType' ? 'This type of file is not accepted.' : invalid === 'tooLarge' ? 'The file is larger than 25 MB.' : 'The file is empty.')
  const key = storageKeyFor(project.id, randomUUID(), file.name)
  await saveStoredFile(key, Buffer.from(await file.arrayBuffer()))
  const doc = await db.document.create({
    data: { projectId: project.id, filename: safeFileName(file.name), mimeType, size: file.size, path: key, source: 'api', uploadedById: user.id },
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
  })
  await audit({ userId: user.id, action: 'api.project.file', entity: 'Project', entityId: project.id, newValue: doc.filename })
  revalidatePath(`/projects/${project.id}`)
  return doc
}

// ── Customers ─────────────────────────────────────────────────────────

const customerSelect = {
  id: true,
  name: true,
  company: true,
  contactPerson: true,
  phone: true,
  email: true,
  street: true,
  postalCode: true,
  city: true,
  _count: { select: { projects: true } },
} as const

export async function listCustomers(user: CurrentUser, q: string | undefined, limit = 50) {
  assertManagement(user)
  const rows = await db.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    select: customerSelect,
    orderBy: { name: 'asc' },
    take: Math.min(Math.max(limit, 1), 200),
  })
  return rows.map((c) => ({ ...c, projects: c._count.projects, _count: undefined }))
}

export const createCustomerInput = z.object({
  name: z.string().trim().min(1).max(200),
  company: text(200),
  contactPerson: text(200),
  phone: text(60),
  email: text(200),
  street: text(200),
  postalCode: text(20),
  city: text(120),
  notes: text(5000),
})

export async function getCustomer(user: CurrentUser, id: string) {
  assertManagement(user)
  const c = await db.customer.findUnique({ where: { id }, select: customerSelect })
  if (!c) throw new ApiError(404, 'notFound', 'No such customer.')
  return { ...c, projects: c._count.projects, _count: undefined }
}

export const updateCustomerInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    company: clearableText(200),
    contactPerson: clearableText(200),
    phone: clearableText(60),
    email: clearableText(200),
    street: clearableText(200),
    postalCode: clearableText(20),
    city: clearableText(120),
    notes: clearableText(5000),
  })
  .strict()

/** Changes what is sent; an absent field stays, null clears it. */
export async function updateCustomer(user: CurrentUser, id: string, input: z.infer<typeof updateCustomerInput>) {
  assertManagement(user)
  if (!(await db.customer.findUnique({ where: { id }, select: { id: true } }))) throw new ApiError(404, 'notFound', 'No such customer.')
  const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  if (Object.keys(data).length > 0) {
    await db.customer.update({ where: { id }, data })
    await audit({ userId: user.id, action: 'api.customer.update', entity: 'Customer', entityId: id, newValue: Object.keys(data).join(', ') })
    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)
  }
  return getCustomer(user, id)
}

export async function createCustomer(user: CurrentUser, input: z.infer<typeof createCustomerInput>) {
  assertManagement(user)
  const c = await db.customer.create({ data: input, select: customerSelect })
  await audit({ userId: user.id, action: 'api.customer.create', entity: 'Customer', entityId: c.id, newValue: c.name })
  revalidatePath('/customers')
  return { ...c, projects: c._count.projects, _count: undefined }
}

// ── People and vehicles ───────────────────────────────────────────────

export async function listEmployees(user: CurrentUser) {
  assertManagement(user)
  const rows = await db.employee.findMany({
    where: { active: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, phone: true, skills: true },
  })
  return rows.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), phone: e.phone, skills: e.skills }))
}

export async function listVehicles(user: CurrentUser) {
  assertManagement(user)
  return db.vehicle.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, licensePlate: true, status: true },
  })
}

// ── Schedule ──────────────────────────────────────────────────────────

export const listScheduleInput = z
  .object({
    from: isoDate,
    to: isoDate,
    projectId: z.string().min(1).optional(),
  })
  .refine((d) => d.to >= d.from, { message: 'to must not be before from', path: ['to'] })

export async function listSchedule(user: CurrentUser, input: z.infer<typeof listScheduleInput>) {
  assertManagement(user)
  const rows = await db.scheduleEntry.findMany({
    where: {
      cancelledAt: null,
      date: { gte: utcDay(input.from), lte: utcDay(input.to) },
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      note: true,
      project: { select: { id: true, number: true, name: true, city: true, customer: { select: { name: true } } } },
      employees: { select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      vehicles: { select: { vehicle: { select: { id: true, name: true } } } },
    },
  })
  return rows.map((e) => ({
    id: e.id,
    date: day(e.date),
    startTime: e.startTime,
    endTime: e.endTime,
    note: e.note,
    project: { id: e.project.id, number: e.project.number, name: e.project.name, city: e.project.city, customer: e.project.customer.name },
    employees: e.employees.map((x) => ({ id: x.employee.id, name: `${x.employee.firstName} ${x.employee.lastName}`.trim() })),
    vehicles: e.vehicles.map((x) => x.vehicle),
  }))
}

/** What the API sends to put a project on the board; the dialog's own shape, with the empties optional. */
export const planEntryInput = z.object({
  projectId: z.string().min(1),
  date: isoDate,
  endDate: isoDate.optional(),
  saturday: z.boolean().optional(),
  sunday: z.boolean().optional(),
  employeeIds: z.array(z.string().min(1)).max(50).default([]),
  vehicleIds: z.array(z.string().min(1)).max(20).default([]),
  startTime: z.string().max(5).optional(),
  endTime: z.string().max(5).optional(),
  note: z.string().max(1000).optional(),
})

const ENTRY_ERRORS: Record<NonNullable<EntryResult['error']>, { status: number; message: string }> = {
  duplicateEntry: { status: 409, message: 'The project is already on the board for that day.' },
  projectRequired: { status: 400, message: 'projectId is required.' },
  invalidRange: { status: 400, message: 'endDate must not be before date.' },
  rangeTooLong: { status: 400, message: 'The range is too long (31 days at most).' },
  noWorkingDays: { status: 400, message: 'The range holds no working days; set saturday or sunday.' },
  saveFailed: { status: 500, message: 'Saving failed.' },
}

export async function planEntry(user: CurrentUser, input: z.infer<typeof planEntryInput>) {
  assertManagement(user)
  const project = await db.project.findFirst({
    where: { OR: [{ id: input.projectId }, { number: input.projectId }] },
    select: { id: true },
  })
  if (!project) throw new ApiError(404, 'notFound', 'No such project.')
  const parsed = entrySchema.safeParse({
    projectId: project.id,
    date: input.date,
    endDate: input.endDate ?? '',
    saturday: input.saturday ?? false,
    sunday: input.sunday ?? false,
    vehicleIds: input.vehicleIds,
    employeeIds: input.employeeIds,
    startTime: input.startTime ?? '',
    endTime: input.endTime ?? '',
    note: input.note ?? '',
  })
  if (!parsed.success) throw new ApiError(400, 'invalid', 'startTime and endTime must read like 07:30.')
  const result = await createEntries(user.id, parsed.data)
  if (result.error) {
    const e = ENTRY_ERRORS[result.error]
    throw new ApiError(e.status, result.error, e.message)
  }
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${project.id}`)
  return { created: result.created ?? 0, projectId: project.id }
}

// ── Reports ───────────────────────────────────────────────────────────

export async function revenueByMonth(user: CurrentUser, year: number) {
  assertFinancials(user)
  const r = await getYearRevenue(year)
  return {
    year,
    source: r.sheetLed ? 'sheet' : 'projects',
    yearTotal: r.yearTotal,
    months: r.months.map((m) => ({
      month: m.month + 1,
      ownCrew: m.ownTotal,
      sub: m.subTotal,
      total: m.total,
      rows: [...m.own, ...m.sub].map((p) => ({
        name: p.name,
        amount: p.price,
        sub: m.sub.includes(p),
        projectId: p.fromSheet ? null : p.id,
      })),
      notInSheet: m.extra.map((p) => ({ projectId: p.id, name: p.name, amount: p.price })),
    })),
    undated: r.undated.map((p) => ({ projectId: p.id, name: p.name, amount: p.price })),
    // Finished work from before the cutoff in Settings is not listed as
    // undated; a caller that wants it all knows how much was left out.
    undatedHistorical: r.undatedHistorical,
  }
}

export async function planGapsReport(user: CurrentUser, year: number) {
  assertFinancials(user)
  const gaps = await getPlanGaps(year)
  return { year, total: gaps.total, lines: gaps.rows.map((g) => ({ id: g.id, month: g.month, name: g.name, amount: g.amount, sub: g.isSub })) }
}

export const yearInput = z.coerce.number().int().min(2000).max(2100)
