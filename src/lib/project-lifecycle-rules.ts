/**
 * Pure rules for automatic project status transitions (no DB, unit-tested).
 *
 * Lifecycle: LEAD → QUOTED → APPROVED → PLANNED → IN_PROGRESS → COMPLETED → INVOICED → PAID
 * (CANCELLED aside). Automation only ever moves FORWARD, never back.
 */

export type LifecycleStatus =
  | 'LEAD'
  | 'QUOTED'
  | 'APPROVED'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'INVOICED'
  | 'PAID'
  | 'CANCELLED'

/** Statuses before any planning happened — "preparation" tab in the project list. */
export const PREPARATION_STATUSES: readonly LifecycleStatus[] = ['LEAD', 'QUOTED', 'APPROVED']

/** Statuses that count as "finished" (work done). */
export const FINISHED_STATUSES: readonly LifecycleStatus[] = ['COMPLETED', 'INVOICED', 'PAID']

/**
 * When the first schedule entry is created for a project: preparation statuses
 * become PLANNED. Anything already PLANNED or further stays untouched.
 */
export function statusAfterFirstScheduleEntry(current: LifecycleStatus): LifecycleStatus | null {
  return PREPARATION_STATUSES.includes(current) ? 'PLANNED' : null
}

/**
 * When the first scheduled day has arrived (firstEntryDate <= today) a PLANNED
 * project is IN_PROGRESS. Returns null when nothing should change.
 */
export function statusWhenFirstDayArrives(current: LifecycleStatus, firstEntryDate: Date | null, today: Date): LifecycleStatus | null {
  if (current !== 'PLANNED' || !firstEntryDate) return null
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const f = Date.UTC(firstEntryDate.getUTCFullYear(), firstEntryDate.getUTCMonth(), firstEntryDate.getUTCDate())
  return f <= t ? 'IN_PROGRESS' : null
}

/**
 * Derived actual dates when a status is set by hand:
 * - moving to IN_PROGRESS with no actualStart → first schedule day (or today)
 * - moving to a finished status with no actualEnd → last schedule day not after today (or today)
 */
export function derivedActualDates(input: {
  newStatus: LifecycleStatus
  actualStart: Date | null
  actualEnd: Date | null
  firstEntryDate: Date | null
  lastEntryDateUpToToday: Date | null
  today: Date
}): { actualStart?: Date; actualEnd?: Date } {
  const out: { actualStart?: Date; actualEnd?: Date } = {}
  const todayUtc = new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate()))
  const startsWork = input.newStatus === 'IN_PROGRESS' || FINISHED_STATUSES.includes(input.newStatus)
  if (startsWork && !input.actualStart) out.actualStart = input.firstEntryDate ?? todayUtc
  if (FINISHED_STATUSES.includes(input.newStatus) && !input.actualEnd) out.actualEnd = input.lastEntryDateUpToToday ?? todayUtc
  return out
}
