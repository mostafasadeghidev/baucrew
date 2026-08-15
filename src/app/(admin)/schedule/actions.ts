'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'

export type EntryResult = { error?: 'duplicateEntry' | 'projectRequired' | 'saveFailed' }

const timeField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    if (!/^\d{1,2}:\d{2}$/.test(v)) {
      ctx.addIssue({ code: 'custom' })
      return z.NEVER
    }
    return v
  })

const entrySchema = z.object({
  projectId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vehicleIds: z.array(z.string().min(1)).max(20),
  employeeIds: z.array(z.string().min(1)).max(50),
  startTime: timeField,
  endTime: timeField,
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v ? v : null)),
})

export type EntryInput = {
  projectId: string
  date: string
  vehicleIds: string[]
  employeeIds: string[]
  startTime: string
  endTime: string
  note: string
}

function isUniqueConflict(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
}

function revalidateBoard(projectId?: string) {
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function createScheduleEntry(input: EntryInput): Promise<EntryResult> {
  const user = await requireManagement()
  const parsed = entrySchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues.some((i) => i.path[0] === 'projectId')
        ? 'projectRequired'
        : 'saveFailed',
    }
  }
  const d = parsed.data
  try {
    const entry = await db.scheduleEntry.create({
      data: {
        projectId: d.projectId,
        date: new Date(`${d.date}T00:00:00.000Z`),
        startTime: d.startTime,
        endTime: d.endTime,
        note: d.note,
        employees: { create: d.employeeIds.map((id) => ({ employeeId: id })) },
        vehicles: { create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
      },
      include: { project: { select: { number: true } } },
    })
    await audit({
      userId: user.id,
      action: 'schedule.create',
      entity: 'ScheduleEntry',
      entityId: entry.id,
      newValue: `${entry.project.number} @ ${d.date}`,
    })
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'duplicateEntry' : 'saveFailed' }
  }
  revalidateBoard(d.projectId)
  return {}
}

export async function updateScheduleEntry(id: string, input: EntryInput): Promise<EntryResult> {
  const user = await requireManagement()
  const parsed = entrySchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues.some((i) => i.path[0] === 'projectId')
        ? 'projectRequired'
        : 'saveFailed',
    }
  }
  const d = parsed.data
  const before = await db.scheduleEntry.findUnique({
    where: { id },
    include: { project: { select: { number: true } } },
  })
  if (!before) return { error: 'saveFailed' }
  try {
    await db.scheduleEntry.update({
      where: { id },
      data: {
        projectId: d.projectId,
        date: new Date(`${d.date}T00:00:00.000Z`),
        startTime: d.startTime,
        endTime: d.endTime,
        note: d.note,
        employees: {
          deleteMany: {},
          create: d.employeeIds.map((eid) => ({ employeeId: eid })),
        },
        vehicles: {
          deleteMany: {},
          create: d.vehicleIds.map((vid) => ({ vehicleId: vid })),
        },
      },
    })
    await audit({
      userId: user.id,
      action: 'schedule.update',
      entity: 'ScheduleEntry',
      entityId: id,
      oldValue: `${before.project.number} @ ${before.date.toISOString().slice(0, 10)}`,
      newValue: `${d.date}`,
    })
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'duplicateEntry' : 'saveFailed' }
  }
  revalidateBoard(d.projectId)
  if (before.projectId !== d.projectId) revalidateBoard(before.projectId)
  return {}
}

export async function moveScheduleEntry(id: string, newDate: string): Promise<EntryResult> {
  const user = await requireManagement()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { error: 'saveFailed' }
  const before = await db.scheduleEntry.findUnique({
    where: { id },
    include: { project: { select: { number: true } } },
  })
  if (!before) return { error: 'saveFailed' }
  const oldDate = before.date.toISOString().slice(0, 10)
  if (oldDate === newDate) return {}
  try {
    await db.scheduleEntry.update({
      where: { id },
      data: { date: new Date(`${newDate}T00:00:00.000Z`) },
    })
    await audit({
      userId: user.id,
      action: 'schedule.move',
      entity: 'ScheduleEntry',
      entityId: id,
      field: before.project.number,
      oldValue: oldDate,
      newValue: newDate,
    })
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'duplicateEntry' : 'saveFailed' }
  }
  revalidateBoard(before.projectId)
  return {}
}

/**
 * Defaults for a new assignment taken from the project record itself
 * ("enter once, use everywhere"): its team, its vehicle and its item list.
 */
export async function getProjectScheduleDefaults(projectId: string): Promise<{
  employeeIds: string[]
  vehicleIds: string[]
  items: Array<{ id: string; name: string; unit: string | null; quantity: number | null; status: 'REQUIRED' | 'COLLECTED' | 'MISSING' }>
  catalogOptions: Array<{ value: string; label: string }>
} | null> {
  await requireManagement()
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      vehicleId: true,
      team: { select: { employeeId: true, employee: { select: { active: true } } } },
      items: {
        include: { catalogItem: { select: { name: true, unit: true } } },
        orderBy: { catalogItem: { name: 'asc' } },
      },
    },
  })
  if (!project) return null
  const assigned = new Set(project.items.map((i) => i.catalogItemId))
  const catalog = await db.catalogItem.findMany({
    where: { active: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, unit: true },
  })
  return {
    employeeIds: project.team.filter((m) => m.employee.active).map((m) => m.employeeId),
    vehicleIds: project.vehicleId ? [project.vehicleId] : [],
    items: project.items.map((i) => ({
      id: i.id,
      name: i.catalogItem.name,
      unit: i.catalogItem.unit,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      status: i.status,
    })),
    catalogOptions: catalog
      .filter((c) => !assigned.has(c.id))
      .map((c) => ({ value: c.id, label: c.unit ? `${c.name} (${c.unit})` : c.name })),
  }
}

export async function deleteScheduleEntry(id: string): Promise<void> {
  const user = await requireManagement()
  const entry = await db.scheduleEntry.findUnique({
    where: { id },
    include: { project: { select: { number: true } } },
  })
  if (!entry) return
  await db.scheduleEntry.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'schedule.delete',
    entity: 'ScheduleEntry',
    entityId: id,
    oldValue: `${entry.project.number} @ ${entry.date.toISOString().slice(0, 10)}`,
  })
  revalidateBoard(entry.projectId)
}
