'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { LATE_ENTRY_DAYS, validInterval } from '@/lib/time-entries'
import { ProjectItemStatus } from '@/generated/prisma/enums'

const ITEM_STATUSES = Object.keys(ProjectItemStatus) as ProjectItemStatus[]

export type PackingResult = { error?: 'notAllowed' | 'saveFailed' }

/**
 * Employees tick their own packing list on the phone. Allowed for
 * management, for the shared warehouse account (employee login without a
 * linked employee — the kiosk) and for an employee who is on the project's
 * crew or scheduled for it around now. Everyone else is refused.
 */
export async function setMyItemStatus(projectItemId: string, status: string): Promise<PackingResult> {
  const user = await requireUser()
  if (!ITEM_STATUSES.includes(status as ProjectItemStatus)) return { error: 'saveFailed' }

  const item = await db.projectItem.findUnique({
    where: { id: projectItemId },
    include: { catalogItem: { select: { name: true } } },
  })
  if (!item) return { error: 'saveFailed' }

  if (user.role === 'EMPLOYEE' && user.employee) {
    const employeeId = user.employee.id
    const now = new Date()
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7))
    const [inTeam, scheduled] = await Promise.all([
      db.projectEmployee.count({ where: { projectId: item.projectId, employeeId } }),
      db.scheduleEntry.count({
        where: {
          projectId: item.projectId,
          cancelledAt: null,
          date: { gte: from, lte: to },
          employees: { some: { employeeId } },
        },
      }),
    ])
    if (inTeam === 0 && scheduled === 0) return { error: 'notAllowed' }
  }

  await db.projectItem.update({ where: { id: projectItemId }, data: { status: status as ProjectItemStatus } })
  await audit({
    userId: user.id,
    action: 'projectItem.status',
    entity: 'Project',
    entityId: item.projectId,
    field: item.catalogItem.name,
    oldValue: item.status,
    newValue: status,
  })
  revalidatePath('/my')
  revalidatePath('/today')
  revalidatePath('/dashboard/packing')
  revalidatePath(`/projects/${item.projectId}`)
  return {}
}

// ── Time tracking (start/stop on the phone) ─────────────────

export type TimeResult = { error?: 'notAllowed' | 'saveFailed' | 'invalidRange' | 'outOfRange' }

/** May this employee book time on that project today? Same rule as the packing list. */
async function canBookOn(projectId: string, employeeId: string): Promise<boolean> {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7))
  const [inTeam, scheduled] = await Promise.all([
    db.projectEmployee.count({ where: { projectId, employeeId } }),
    db.scheduleEntry.count({
      where: {
        projectId,
        cancelledAt: null,
        date: { gte: from, lte: to },
        employees: { some: { employeeId } },
      },
    }),
  ])
  return inTeam > 0 || scheduled > 0
}

/** Starts the clock on a project; a still-running interval is closed first. */
export async function startMyTime(projectId: string): Promise<TimeResult> {
  const user = await requireUser()
  const employeeId = user.employee?.id
  if (!employeeId) return { error: 'notAllowed' }
  if (user.role === 'EMPLOYEE' && !(await canBookOn(projectId, employeeId))) {
    return { error: 'notAllowed' }
  }

  const now = new Date()
  await db.timeEntry.updateMany({
    where: { employeeId, endedAt: null },
    data: { endedAt: now },
  })
  await db.timeEntry.create({
    data: { employeeId, projectId, startedAt: now, source: 'worker' },
  })
  await audit({
    userId: user.id,
    action: 'time.start',
    entity: 'Project',
    entityId: projectId,
  })
  revalidatePath('/my')
  return {}
}

export async function stopMyTime(): Promise<TimeResult> {
  const user = await requireUser()
  const employeeId = user.employee?.id
  if (!employeeId) return { error: 'notAllowed' }

  const open = await db.timeEntry.findFirst({ where: { employeeId, endedAt: null } })
  if (!open) return {}
  await db.timeEntry.update({ where: { id: open.id }, data: { endedAt: new Date() } })
  await audit({
    userId: user.id,
    action: 'time.stop',
    entity: 'Project',
    entityId: open.projectId ?? open.id,
  })
  revalidatePath('/my')
  return {}
}

/**
 * A booking the worker adds later ("I forgot to press start"). Only for the
 * last few days, only on a project they are on, and only inside a plausible
 * interval — the office sees it marked as added later and can correct it.
 */
export async function addMyTime(input: {
  projectId: string
  date: string
  from: string
  to: string
}): Promise<TimeResult> {
  const user = await requireUser()
  const employeeId = user.employee?.id
  if (!employeeId) return { error: 'notAllowed' }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'saveFailed' }
  if (!/^\d{2}:\d{2}$/.test(input.from) || !/^\d{2}:\d{2}$/.test(input.to)) {
    return { error: 'saveFailed' }
  }

  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = new Date(`${input.date}T00:00:00.000Z`)
  const daysBack = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (Number.isNaN(daysBack) || daysBack < 0 || daysBack > LATE_ENTRY_DAYS) {
    return { error: 'outOfRange' }
  }

  // Same question as the clock, but for that day: is this their project?
  const [inTeam, scheduled] = await Promise.all([
    db.projectEmployee.count({ where: { projectId: input.projectId, employeeId } }),
    db.scheduleEntry.count({
      where: {
        projectId: input.projectId,
        cancelledAt: null,
        date: day,
        employees: { some: { employeeId } },
      },
    }),
  ])
  if (user.role === 'EMPLOYEE' && inTeam === 0 && scheduled === 0) return { error: 'notAllowed' }

  const startedAt = new Date(`${input.date}T${input.from}:00`)
  const endedAt = new Date(`${input.date}T${input.to}:00`)
  if (!validInterval(startedAt, endedAt)) return { error: 'invalidRange' }

  await db.timeEntry.create({
    data: {
      employeeId,
      projectId: input.projectId,
      startedAt,
      endedAt,
      source: 'worker_late',
      createdById: user.id,
    },
  })
  await audit({
    userId: user.id,
    action: 'time.addLate',
    entity: 'Project',
    entityId: input.projectId,
    newValue: `${input.date} ${input.from}–${input.to}`,
  })
  revalidatePath('/my')
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath(`/projects/${input.projectId}`)
  return {}
}
