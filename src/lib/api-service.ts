import 'server-only'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
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
  customer: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  addOns: { select: { amount: true } },
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
  customer: { id: string; name: string }
  manager: { id: string; firstName: string; lastName: string } | null
  addOns: Array<{ amount: { toString(): string } }>
}

function projectDto(p: ProjectRow, user: CurrentUser) {
  const money = canViewFinancials(user)
  return {
    id: p.id,
    number: p.number,
    name: p.name,
    status: p.status,
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
    // Money only for those who may see it; the field is absent, not null.
    ...(money
      ? {
          price: p.price === null ? null : Number(p.price),
          orderValue: orderValue(p.price === null ? null : Number(p.price), p.addOns),
        }
      : {}),
  }
}

export const listProjectsInput = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(ProjectStatus).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function listProjects(user: CurrentUser, input: z.infer<typeof listProjectsInput>) {
  assertManagement(user)
  const where = {
    ...(input.status ? { status: input.status } : {}),
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
  return { items: rows.map((p) => projectDto(p, user)), total, limit: input.limit, offset: input.offset }
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
  return {
    ...projectDto(p, user),
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

export async function createProject(user: CurrentUser, input: z.infer<typeof createProjectInput>) {
  assertManagement(user)
  let customerId = input.customerId ?? null
  if (!customerId && input.customerName) {
    const existing = await db.customer.findFirst({
      where: { name: { equals: input.customerName, mode: 'insensitive' } },
      select: { id: true },
    })
    customerId = existing
      ? existing.id
      : (await db.customer.create({ data: { name: input.customerName }, select: { id: true } })).id
  }
  if (!customerId || !(await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
    throw new ApiError(404, 'notFound', 'No such customer.')
  }
  let created: { id: string } | null = null
  // Retry once if the sequential number collides with a concurrent create.
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    try {
      created = await db.project.create({
        data: {
          number: await nextProjectNumber(),
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
        },
        select: { id: true },
      })
    } catch (e) {
      if (!isUniqueClash(e) || attempt === 1) throw e
    }
  }
  if (!created) throw new ApiError(500, 'saveFailed')
  await audit({ userId: user.id, action: 'api.project.create', entity: 'Project', entityId: created.id, newValue: input.name })
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return getProject(user, created.id)
}

export const projectStatusInput = z.object({ status: z.enum(ProjectStatus) })

export async function setProjectStatus(user: CurrentUser, idOrNumber: string, status: ProjectStatus) {
  assertManagement(user)
  const before = await db.project.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    select: { id: true, status: true, number: true, actualStart: true, actualEnd: true },
  })
  if (!before) throw new ApiError(404, 'notFound', 'No such project.')
  if (before.status !== status) {
    const derived = await actualDatesForStatus(before.id, status, before)
    await db.project.update({ where: { id: before.id }, data: { status, ...derived } })
    await audit({
      userId: user.id,
      action: 'api.project.status',
      entity: 'Project',
      entityId: before.id,
      field: 'status',
      oldValue: before.status,
      newValue: status,
    })
    revalidatePath('/projects')
    revalidatePath(`/projects/${before.id}`)
    revalidatePath('/dashboard')
  }
  return getProject(user, before.id)
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
  }
}

export async function planGapsReport(user: CurrentUser, year: number) {
  assertFinancials(user)
  const gaps = await getPlanGaps(year)
  return { year, total: gaps.total, lines: gaps.rows.map((g) => ({ id: g.id, month: g.month, name: g.name, amount: g.amount, sub: g.isSub })) }
}

export const yearInput = z.coerce.number().int().min(2000).max(2100)
