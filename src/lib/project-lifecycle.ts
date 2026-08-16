import 'server-only'
import { db } from './db'
import { audit } from './audit'
import {
  derivedActualDates,
  statusAfterFirstScheduleEntry,
  type LifecycleStatus,
} from './project-lifecycle-rules'
import type { ProjectStatus } from '@/generated/prisma/enums'

function todayUtc(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

/** First scheduled day and last scheduled day not after today for a project. */
export async function scheduleBounds(projectId: string): Promise<{ first: Date | null; lastUpToToday: Date | null }> {
  const [first, last] = await Promise.all([
    db.scheduleEntry.findFirst({ where: { projectId }, orderBy: { date: 'asc' }, select: { date: true } }),
    db.scheduleEntry.findFirst({
      where: { projectId, date: { lte: todayUtc() } },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ])
  return { first: first?.date ?? null, lastUpToToday: last?.date ?? null }
}

/**
 * Called after a schedule entry was created: a project in a preparation status
 * (LEAD / QUOTED / APPROVED) becomes PLANNED. Never moves backwards.
 */
export async function promoteToPlanned(projectId: string, userId: string): Promise<void> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { status: true, number: true } })
  if (!p) return
  const next = statusAfterFirstScheduleEntry(p.status as LifecycleStatus)
  if (!next) return
  await db.project.update({ where: { id: projectId }, data: { status: next as ProjectStatus } })
  await audit({
    userId,
    action: 'project.status.auto',
    entity: 'Project',
    entityId: projectId,
    field: 'status',
    oldValue: p.status,
    newValue: `${next} (Einsatz geplant)`,
  })
}

/**
 * Data to write together with a manual status change: derived actual dates.
 * Returns {} when nothing needs to be filled in.
 */
export async function actualDatesForStatus(
  projectId: string,
  newStatus: ProjectStatus,
  current: { actualStart: Date | null; actualEnd: Date | null }
): Promise<{ actualStart?: Date; actualEnd?: Date }> {
  const bounds = await scheduleBounds(projectId)
  return derivedActualDates({
    newStatus: newStatus as LifecycleStatus,
    actualStart: current.actualStart,
    actualEnd: current.actualEnd,
    firstEntryDate: bounds.first,
    lastEntryDateUpToToday: bounds.lastUpToToday,
    today: new Date(),
  })
}

let lastSync = 0
const SYNC_INTERVAL_MS = 5 * 60 * 1000

/**
 * PLANNED projects whose first scheduled day has arrived become IN_PROGRESS,
 * with actualStart = that first day (only when empty). One SQL statement,
 * throttled to once every few minutes per server process; safe to call from
 * any admin page. Runs immediately when `force` is set.
 */
export async function syncProjectsInProgress(force = false): Promise<number> {
  const now = Date.now()
  if (!force && now - lastSync < SYNC_INTERVAL_MS) return 0
  lastSync = now
  const today = todayUtc()
  const rows = await db.$queryRaw<Array<{ id: string; number: string; first: Date }>>`
    UPDATE "Project" p
    SET status = 'IN_PROGRESS',
        "actualStart" = COALESCE(p."actualStart", s.first),
        "updatedAt" = now()
    FROM (SELECT "projectId", MIN(date) AS first FROM "ScheduleEntry" GROUP BY "projectId") s
    WHERE s."projectId" = p.id
      AND p.status = 'PLANNED'
      AND s.first <= ${today}
    RETURNING p.id, p.number, s.first
  `
  for (const r of rows) {
    await audit({
      userId: null,
      action: 'project.status.auto',
      entity: 'Project',
      entityId: r.id,
      field: 'status',
      oldValue: 'PLANNED',
      newValue: `IN_PROGRESS (erster Einsatztag ${r.first.toISOString().slice(0, 10)})`,
    })
  }
  return rows.length
}
