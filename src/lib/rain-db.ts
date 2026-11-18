import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { addDays, todayUtc } from './dates'
import { outdoorWork } from './outdoor-work'
import { RAIN_CLOSED_STATUSES, RAIN_HORIZON_DAYS } from './rain-days'

/** What src/lib/rain-days.ts reads of a project; schedule days from today on. */
export function rainProjectSelect(today = todayUtc()) {
  return {
    id: true,
    status: true,
    doneAt: true,
    pausedAt: true,
    archivedAt: true,
    city: true,
    latitude: true,
    longitude: true,
    plannedStart: true,
    plannedEnd: true,
    workCategories: { select: { workCategory: { select: { outdoor: true, nameDe: true, nameEn: true } } } },
    workNote: true,
    workTypeText: true,
    sourceTitle: true,
    description: true,
    scheduleEntries: { where: { cancelledAt: null, date: { gte: today } }, select: { date: true } },
  } satisfies Prisma.ProjectSelect
}

/**
 * The open outdoor jobs that are planned within the next two weeks — by a
 * day on the schedule or by their planned range — for the overview. Whether
 * a plaster or paint job is on the facade is read from its words
 * (src/lib/outdoor-work.ts), so those are sorted out here, not in the query.
 */
export async function upcomingOutdoorProjects(scope: Prisma.ProjectWhereInput) {
  const today = todayUtc()
  const last = addDays(today, RAIN_HORIZON_DAYS - 1)
  const rows = await db.project.findMany({
    where: {
      AND: [scope],
      status: { notIn: [...RAIN_CLOSED_STATUSES] },
      doneAt: null,
      pausedAt: null,
      archivedAt: null,
      workCategories: { some: {} },
      OR: [
        { scheduleEntries: { some: { cancelledAt: null, date: { gte: today, lte: last } } } },
        { plannedStart: { lte: last }, OR: [{ plannedEnd: { gte: today } }, { plannedEnd: null, plannedStart: { gte: today } }] },
      ],
    },
    select: { ...rainProjectSelect(today), number: true, name: true },
  })
  return rows.filter((p) => outdoorWork(p))
}
