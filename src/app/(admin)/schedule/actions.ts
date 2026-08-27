'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { getProjectDevices } from '../devices/actions'
import { promoteToPlanned, actualDatesForStatus } from '@/lib/project-lifecycle'
import { expandDateRange } from '@/lib/schedule-range'
import { assignmentBlock } from '@/lib/schedule-block'

export type EntryResult = {
  error?: 'duplicateEntry' | 'projectRequired' | 'saveFailed' | 'invalidRange' | 'rangeTooLong' | 'noWorkingDays'
  /** Number of entries created (range mode). */
  created?: number
  /** Number of days taken out of the plan (shortened range). */
  removed?: number
  /** Number of days that already existed and were brought in line. */
  updated?: number
}

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
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  saturday: z.boolean().optional().default(false),
  sunday: z.boolean().optional().default(false),
  applyToExisting: z.boolean().optional().default(true),
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
  /** Create mode only: last day of a "from – to" range (one entry per day). */
  endDate?: string
  /** Range mode: plan Saturdays / Sundays inside the range (default off). */
  saturday?: boolean
  sunday?: boolean
  /** Edit mode: bring days of the range that already exist in line with this entry. */
  applyToExisting?: boolean
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
  const range = expandDateRange(d.date, d.endDate, { saturday: d.saturday, sunday: d.sunday })
  if (range.error) return { error: range.error }
  const isRange = range.dates.length > 1
  let created = 0
  try {
    if (!isRange) {
      // A cancelled day for the same project blocks the unique key — reuse it.
      const cancelled = await db.scheduleEntry.findFirst({
        where: { projectId: d.projectId, date: new Date(`${d.date}T00:00:00.000Z`), cancelledAt: { not: null } },
        select: { id: true },
      })
      const data = {
        projectId: d.projectId,
        date: new Date(`${d.date}T00:00:00.000Z`),
        startTime: d.startTime,
        endTime: d.endTime,
        note: d.note,
        cancelledAt: null,
      }
      const entry = cancelled
        ? await db.scheduleEntry.update({
            where: { id: cancelled.id },
            data: {
              ...data,
              employees: { deleteMany: {}, create: d.employeeIds.map((id) => ({ employeeId: id })) },
              vehicles: { deleteMany: {}, create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
            },
            include: { project: { select: { number: true } } },
          })
        : await db.scheduleEntry.create({
            data: {
              ...data,
              employees: { create: d.employeeIds.map((id) => ({ employeeId: id })) },
              vehicles: { create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
            },
            include: { project: { select: { number: true } } },
          })
      created = 1
      await audit({
        userId: user.id,
        action: 'schedule.create',
        entity: 'ScheduleEntry',
        entityId: entry.id,
        newValue: `${entry.project.number} @ ${d.date}`,
      })
    } else {
      // Range: one entry per day; days that already have an entry for this
      // project are left untouched (unique projectId+date).
      const existing = await db.scheduleEntry.findMany({
        where: {
          projectId: d.projectId,
          date: { in: range.dates.map((x) => new Date(`${x}T00:00:00.000Z`)) },
        },
        select: { id: true, date: true, cancelledAt: true },
      })
      const active = new Set(
        existing.filter((e) => e.cancelledAt === null).map((e) => e.date.toISOString().slice(0, 10))
      )
      const revivable = new Map(
        existing
          .filter((e) => e.cancelledAt !== null)
          .map((e) => [e.date.toISOString().slice(0, 10), e.id] as const)
      )
      const todo = range.dates.filter((x) => !active.has(x))
      if (todo.length === 0) return { error: 'duplicateEntry' }
      const project = await db.project.findUnique({ where: { id: d.projectId }, select: { number: true } })
      const ids = await db.$transaction(
        todo.map((x) => {
          const base = {
            startTime: d.startTime,
            endTime: d.endTime,
            note: d.note,
            cancelledAt: null,
          }
          const revive = revivable.get(x)
          return revive
            ? db.scheduleEntry.update({
                where: { id: revive },
                data: {
                  ...base,
                  employees: { deleteMany: {}, create: d.employeeIds.map((id) => ({ employeeId: id })) },
                  vehicles: { deleteMany: {}, create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
                },
                select: { id: true },
              })
            : db.scheduleEntry.create({
                data: {
                  ...base,
                  projectId: d.projectId,
                  date: new Date(`${x}T00:00:00.000Z`),
                  employees: { create: d.employeeIds.map((id) => ({ employeeId: id })) },
                  vehicles: { create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
                },
                select: { id: true },
              })
        })
      )
      created = ids.length
      await audit({
        userId: user.id,
        action: 'schedule.createRange',
        entity: 'ScheduleEntry',
        entityId: ids[0].id,
        newValue: `${project?.number ?? d.projectId} @ ${todo[0]} – ${todo[todo.length - 1]} (${todo.length})`,
      })
    }
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'duplicateEntry' : 'saveFailed' }
  }
  // First planning step: preparation statuses become "Geplant" automatically.
  await promoteToPlanned(d.projectId, user.id)
  revalidateBoard(d.projectId)
  revalidatePath('/projects')
  return { created }
}

/**
 * "Projekt abschließen" from the entry dialog: marks the project COMPLETED,
 * sets actualEnd to this entry's date (when empty) and actualStart to the
 * first scheduled day (when empty). Projects already invoiced/paid are left alone.
 */
export async function completeProjectFromEntry(
  entryId: string,
  /** Take the days planned after this one out of the schedule (reversible). */
  removeLaterDays = true
): Promise<{ error?: string; removed?: number }> {
  const user = await requireManagement()
  const entry = await db.scheduleEntry.findUnique({
    where: { id: entryId },
    include: { project: { select: { id: true, number: true, status: true, actualStart: true, actualEnd: true } } },
  })
  if (!entry) return { error: 'saveFailed' }
  const p = entry.project
  if (p.status === 'INVOICED' || p.status === 'PAID' || p.status === 'CANCELLED') return {}
  const derived = await actualDatesForStatus(p.id, 'COMPLETED', { actualStart: p.actualStart, actualEnd: p.actualEnd })
  await db.project.update({
    where: { id: p.id },
    data: {
      status: 'COMPLETED',
      ...(derived.actualStart ? { actualStart: derived.actualStart } : {}),
      // The clicked entry is the day the work ended.
      ...(p.actualEnd ? {} : { actualEnd: entry.date }),
    },
  })
  await audit({
    userId: user.id,
    action: 'project.status',
    entity: 'Project',
    entityId: p.id,
    field: 'status',
    oldValue: p.status,
    newValue: `COMPLETED (aus Einsatz ${entry.date.toISOString().slice(0, 10)})`,
  })

  // The work is done — days planned after that are cancelled (soft), so the
  // crew and vehicles are free again. `reopenProject` brings them back.
  let removed = 0
  if (removeLaterDays) {
    const result = await db.scheduleEntry.updateMany({
      where: { projectId: p.id, date: { gt: entry.date }, cancelledAt: null },
      data: { cancelledAt: new Date() },
    })
    removed = result.count
    if (removed > 0) {
      await audit({
        userId: user.id,
        action: 'schedule.cancelLaterDays',
        entity: 'Project',
        entityId: p.id,
        newValue: `${removed} × nach ${entry.date.toISOString().slice(0, 10)}`,
      })
    }
  }

  revalidateBoard(p.id)
  revalidatePath('/projects')
  return { removed }
}

/**
 * Undo "project completed": the project goes back to in progress, the actual
 * end date is cleared and the days that were cancelled together with the
 * completion are put back into the plan.
 */
export async function reopenProject(projectId: string): Promise<{ error?: string; restored?: number }> {
  const user = await requireManagement()
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, number: true, status: true, actualStart: true },
  })
  if (!p) return { error: 'saveFailed' }

  const restoredEntries = await db.scheduleEntry.updateMany({
    where: { projectId, cancelledAt: { not: null } },
    data: { cancelledAt: null },
  })
  const next = p.actualStart ? 'IN_PROGRESS' : 'PLANNED'
  await db.project.update({
    where: { id: projectId },
    data: { status: next, actualEnd: null },
  })
  await audit({
    userId: user.id,
    action: 'project.reopen',
    entity: 'Project',
    entityId: projectId,
    field: 'status',
    oldValue: p.status,
    newValue: `${next} (${restoredEntries.count} Einsätze wiederhergestellt)`,
  })
  revalidateBoard(projectId)
  revalidatePath('/projects')
  return { restored: restoredEntries.count }
}

/** How many days after this assignment are still planned (for the confirmation). */
export async function countLaterDays(entryId: string): Promise<number> {
  await requireManagement()
  const entry = await db.scheduleEntry.findUnique({ where: { id: entryId }, select: { projectId: true, date: true } })
  if (!entry) return 0
  return db.scheduleEntry.count({
    where: { projectId: entry.projectId, date: { gt: entry.date }, cancelledAt: null },
  })
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

  // "Bis" in the edit dialog: the block of consecutive days that contains this
  // assignment now runs until that date — missing days are added, days after
  // it are taken out of the plan (reversible, like completing a project).
  let created = 0
  let removed = 0
  if (d.endDate) {
    const planned = (
      await db.scheduleEntry.findMany({
        where: { projectId: d.projectId, cancelledAt: null },
        select: { date: true },
        orderBy: { date: 'asc' },
      })
    ).map((e) => e.date.toISOString().slice(0, 10))
    const block = assignmentBlock(planned, d.date)
    const dropped = block.filter((day) => day > d.endDate!)
    if (dropped.length > 0) {
      const result = await db.scheduleEntry.updateMany({
        where: {
          projectId: d.projectId,
          date: { in: dropped.map((x) => new Date(`${x}T00:00:00.000Z`)) },
          cancelledAt: null,
        },
        data: { cancelledAt: new Date() },
      })
      removed = result.count
      await audit({
        userId: user.id,
        action: 'schedule.shortenRange',
        entity: 'Project',
        entityId: d.projectId,
        newValue: `${removed} × nach ${d.endDate}`,
      })
    }
  }
  let updated = 0
  if (d.endDate && d.endDate > d.date) {
    const range = expandDateRange(d.date, d.endDate, { saturday: d.saturday, sunday: d.sunday })
    if (range.error) return { error: range.error }
    const extraDays = range.dates.filter((x) => x !== d.date)
    if (extraDays.length > 0) {
      const existing = await db.scheduleEntry.findMany({
        where: { projectId: d.projectId, date: { in: extraDays.map((x) => new Date(`${x}T00:00:00.000Z`)) } },
        select: { id: true, date: true, cancelledAt: true },
      })
      const day = (x: { date: Date }) => x.date.toISOString().slice(0, 10)
      const active = existing.filter((e) => e.cancelledAt === null)
      const cancelled = existing.filter((e) => e.cancelledAt !== null)
      const taken = new Set(existing.map(day))
      const todo = extraDays.filter((x) => !taken.has(x))

      const crew = {
        startTime: d.startTime,
        endTime: d.endTime,
        note: d.note,
        employees: { deleteMany: {}, create: d.employeeIds.map((eid) => ({ employeeId: eid })) },
        vehicles: { deleteMany: {}, create: d.vehicleIds.map((vid) => ({ vehicleId: vid })) },
      }

      if (todo.length > 0) {
        const ids = await db.$transaction(
          todo.map((x) =>
            db.scheduleEntry.create({
              data: {
                projectId: d.projectId,
                date: new Date(`${x}T00:00:00.000Z`),
                startTime: d.startTime,
                endTime: d.endTime,
                note: d.note,
                employees: { create: d.employeeIds.map((eid) => ({ employeeId: eid })) },
                vehicles: { create: d.vehicleIds.map((vid) => ({ vehicleId: vid })) },
              },
              select: { id: true },
            })
          )
        )
        created = ids.length
        await audit({
          userId: user.id,
          action: 'schedule.createRange',
          entity: 'ScheduleEntry',
          entityId: ids[0].id,
          newValue: `${before.project.number} @ ${todo[0]} – ${todo[todo.length - 1]} (${todo.length})`,
        })
      }

      // A day that was taken out of the plan earlier comes back — the range
      // says the block runs over it again.
      if (cancelled.length > 0) {
        await db.$transaction(
          cancelled.map((e) =>
            db.scheduleEntry.update({ where: { id: e.id }, data: { ...crew, cancelledAt: null } })
          )
        )
        created += cancelled.length
      }

      // Days that already have an assignment get the same crew, vehicles and
      // times — otherwise a change made "until Friday" would quietly stop at
      // the edited day.
      if (d.applyToExisting && active.length > 0) {
        await db.$transaction(
          active.map((e) => db.scheduleEntry.update({ where: { id: e.id }, data: crew }))
        )
        updated = active.length
        await audit({
          userId: user.id,
          action: 'schedule.applyRange',
          entity: 'Project',
          entityId: d.projectId,
          newValue: `${before.project.number} @ ${day(active[0])} – ${day(active[active.length - 1])} (${updated})`,
        })
      }
    }
  }

  revalidateBoard(d.projectId)
  if (before.projectId !== d.projectId) revalidateBoard(before.projectId)
  return { created, removed, updated }
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
  managerId: string
  items: Array<{
    id: string
    name: string
    unit: string | null
    quantity: number | null
    stock: number | null
    status: 'REQUIRED' | 'COLLECTED' | 'MISSING'
  }>
  catalogOptions: Array<{ value: string; label: string }>
  /** Days (ISO) the project already has assignments on. */
  scheduledDays: string[]
  /** Machines this project needs, with where each one is right now. */
  devices: Array<{
    id: string
    name: string
    inventoryNo: string | null
    state: 'free' | 'here' | 'busy'
    where: string
  }>
  /** Devices not on the list yet — for the picker. */
  deviceOptions: Array<{ value: string; label: string }>
} | null> {
  await requireManagement()
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      managerId: true,
      vehicles: { select: { vehicleId: true } },
      team: { select: { employeeId: true, employee: { select: { active: true } } } },
      items: {
        include: { catalogItem: { select: { name: true, unit: true, stockQuantity: true } } },
        orderBy: { catalogItem: { name: 'asc' } },
      },
    },
  })
  if (!project) return null
  const scheduled = await db.scheduleEntry.findMany({
    where: { projectId, cancelledAt: null },
    select: { date: true },
    orderBy: { date: 'asc' },
    take: 60,
  })
  const { rows: devices, options: deviceOptions } = await getProjectDevices(projectId)

  const assigned = new Set(project.items.map((i) => i.catalogItemId))
  const catalog = await db.catalogItem.findMany({
    where: { active: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, unit: true },
  })
  return {
    employeeIds: project.team.filter((m) => m.employee.active).map((m) => m.employeeId),
    managerId: project.managerId ?? '',
    scheduledDays: scheduled.map((e) => e.date.toISOString().slice(0, 10)),
    devices,
    deviceOptions,
    vehicleIds: project.vehicles.map((v) => v.vehicleId),
    items: project.items.map((i) => ({
      id: i.id,
      name: i.catalogItem.name,
      unit: i.catalogItem.unit,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      stock: i.catalogItem.stockQuantity != null ? Number(i.catalogItem.stockQuantity) : null,
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

/**
 * Site manager of the project, settable straight from the assignment dialog
 * (it belongs to the project, like the tool/material list).
 */
export async function setProjectManager(projectId: string, managerId: string): Promise<{ error?: string }> {
  const user = await requireManagement()
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { managerId: true, number: true },
  })
  if (!project) return { error: 'saveFailed' }
  if ((project.managerId ?? '') === managerId) return {}
  await db.project.update({
    where: { id: projectId },
    data: { managerId: managerId || null },
  })
  await audit({
    userId: user.id,
    action: 'project.update',
    entity: 'Project',
    entityId: projectId,
    field: 'managerId',
    oldValue: project.managerId ?? '',
    newValue: managerId,
  })
  revalidateBoard(projectId)
  revalidatePath('/projects')
  return {}
}

/**
 * Ctrl/⌘ + drag on the board: duplicates an assignment (team, vehicles, times,
 * note) onto another day instead of moving it.
 */
export async function copyScheduleEntry(id: string, date: string): Promise<EntryResult> {
  const user = await requireManagement()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'saveFailed' }
  const entry = await db.scheduleEntry.findUnique({
    where: { id },
    include: {
      employees: { select: { employeeId: true } },
      vehicles: { select: { vehicleId: true } },
      project: { select: { number: true } },
    },
  })
  if (!entry) return { error: 'saveFailed' }
  try {
    const copy = await db.scheduleEntry.create({
      data: {
        projectId: entry.projectId,
        date: new Date(`${date}T00:00:00.000Z`),
        startTime: entry.startTime,
        endTime: entry.endTime,
        note: entry.note,
        employees: { create: entry.employees.map((e) => ({ employeeId: e.employeeId })) },
        vehicles: { create: entry.vehicles.map((v) => ({ vehicleId: v.vehicleId })) },
      },
    })
    await audit({
      userId: user.id,
      action: 'schedule.copy',
      entity: 'ScheduleEntry',
      entityId: copy.id,
      newValue: `${entry.project.number} @ ${date}`,
    })
  } catch (e) {
    return { error: isUniqueConflict(e) ? 'duplicateEntry' : 'saveFailed' }
  }
  revalidateBoard(entry.projectId)
  return { created: 1 }
}
