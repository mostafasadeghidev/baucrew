import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { promoteToPlanned } from './project-lifecycle'
import { expandDateRange } from './schedule-range'
import type { EntryData, EntryResult } from './schedule-entry'

const isUniqueConflict = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'

const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/**
 * Puts a project on the board for one day or a range of days — the one
 * place that does, for the schedule dialog and the API alike. A day the
 * project already has is left as it is; a day taken out of the plan earlier
 * is brought back rather than doubled. The first planning step moves a
 * project in preparation to "Geplant".
 */
export async function createEntries(userId: string, d: EntryData): Promise<EntryResult> {
  const range = expandDateRange(d.date, d.endDate, { saturday: d.saturday, sunday: d.sunday })
  if (range.error) return { error: range.error }
  const isRange = range.dates.length > 1
  let created = 0
  try {
    if (!isRange) {
      // A cancelled day for the same project blocks the unique key — reuse it.
      const cancelled = await db.scheduleEntry.findFirst({
        where: { projectId: d.projectId, date: utcDay(d.date), cancelledAt: { not: null } },
        select: { id: true },
      })
      const data = {
        projectId: d.projectId,
        date: utcDay(d.date),
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
        userId,
        action: 'schedule.create',
        entity: 'ScheduleEntry',
        entityId: entry.id,
        newValue: `${entry.project.number} @ ${d.date}`,
      })
    } else {
      // Range: one entry per day; days that already have an entry for this
      // project are left untouched (unique projectId+date).
      const existing = await db.scheduleEntry.findMany({
        where: { projectId: d.projectId, date: { in: range.dates.map(utcDay) } },
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
                  date: utcDay(x),
                  employees: { create: d.employeeIds.map((id) => ({ employeeId: id })) },
                  vehicles: { create: d.vehicleIds.map((id) => ({ vehicleId: id })) },
                },
                select: { id: true },
              })
        })
      )
      created = ids.length
      await audit({
        userId,
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
  await promoteToPlanned(d.projectId, userId)
  return { created }
}

/**
 * One day of a project moved to another, crew and vehicles along — the
 * board's drag, and the API's. The same project on the new day already is a
 * duplicate and refused.
 */
export async function moveEntry(userId: string, id: string, newDate: string): Promise<EntryResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { error: 'saveFailed' }
  const before = await db.scheduleEntry.findUnique({
    where: { id },
    include: { project: { select: { number: true } } },
  })
  if (!before) return { error: 'saveFailed' }
  const oldDate = before.date.toISOString().slice(0, 10)
  if (oldDate === newDate) return {}
  try {
    await db.scheduleEntry.update({ where: { id }, data: { date: utcDay(newDate) } })
    await audit({
      userId,
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
  return {}
}

/** What may change on one day without touching the days around it. */
export type EntryDayPatch = {
  employeeIds?: string[]
  vehicleIds?: string[]
  startTime?: string | null
  endTime?: string | null
  note?: string | null
}

/** One day's crew, vehicles, hours or note; what the patch leaves out stays as it is. */
export async function updateEntryDay(userId: string, id: string, patch: EntryDayPatch): Promise<EntryResult> {
  const before = await db.scheduleEntry.findUnique({ where: { id }, include: { project: { select: { number: true } } } })
  if (!before) return { error: 'saveFailed' }
  try {
    await db.scheduleEntry.update({
      where: { id },
      data: {
        ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
        ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.employeeIds
          ? { employees: { deleteMany: {}, create: patch.employeeIds.map((employeeId) => ({ employeeId })) } }
          : {}),
        ...(patch.vehicleIds ? { vehicles: { deleteMany: {}, create: patch.vehicleIds.map((vehicleId) => ({ vehicleId })) } } : {}),
      },
    })
  } catch {
    return { error: 'saveFailed' }
  }
  await audit({
    userId,
    action: 'schedule.update',
    entity: 'ScheduleEntry',
    entityId: id,
    oldValue: `${before.project.number} @ ${before.date.toISOString().slice(0, 10)}`,
    newValue: Object.keys(patch).join(', '),
  })
  return {}
}

/** One day taken out of the plan, the reversible way: cancelled, so planning it again brings it back. */
export async function cancelEntry(userId: string, id: string): Promise<void> {
  const entry = await db.scheduleEntry.update({
    where: { id },
    data: { cancelledAt: new Date() },
    include: { project: { select: { number: true } } },
  })
  await audit({
    userId,
    action: 'schedule.cancel',
    entity: 'ScheduleEntry',
    entityId: id,
    oldValue: `${entry.project.number} @ ${entry.date.toISOString().slice(0, 10)}`,
  })
}
