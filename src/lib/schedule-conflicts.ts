// Pure logic — no server-only import so it can be unit-tested directly.

import { absentEmployeesOn, type AbsenceRange } from './absences'

export type ConflictEntry = {
  id: string
  date: Date
  startTime?: string | null
  endTime?: string | null
  vehicles: Array<{ vehicle: { id: string; name: string; status: string } }>
  employees: Array<{ employee: { id: string; firstName: string; lastName: string; active?: boolean } }>
}

export type Conflict =
  | { type: 'employee'; name: string; date: Date; entryIds: string[] }
  | { type: 'vehicle'; name: string; date: Date; entryIds: string[] }
  | { type: 'vehicleUnavailable'; name: string; status: string; date: Date; entryIds: string[] }
  | { type: 'absence'; name: string; absenceType: string; date: Date; entryIds: string[] }

/** "07:30" → 450 minutes. Invalid/empty → null. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Two entries on the same day overlap unless BOTH have a start and an end
 * time and their ranges are disjoint. Entries without times count as
 * all-day and therefore overlap everything on that day.
 */
export function entriesOverlap(a: ConflictEntry, b: ConflictEntry): boolean {
  const aStart = timeToMinutes(a.startTime)
  const aEnd = timeToMinutes(a.endTime)
  const bStart = timeToMinutes(b.startTime)
  const bEnd = timeToMinutes(b.endTime)
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return true
  if (aEnd <= aStart || bEnd <= bStart) return true // malformed range → be safe
  return aStart < bEnd && bStart < aEnd
}

/**
 * Finds scheduling conflicts within a set of entries:
 * an employee or a vehicle booked in two overlapping entries on the same day,
 * and vehicles scheduled while not AVAILABLE.
 */
export function detectConflicts(entries: ConflictEntry[]): Conflict[] {
  const conflicts: Conflict[] = []
  const byEmployee = new Map<string, { name: string; date: Date; entries: ConflictEntry[] }>()
  const byVehicle = new Map<string, { name: string; date: Date; entries: ConflictEntry[] }>()

  for (const entry of entries) {
    const dateKey = entry.date.toISOString().slice(0, 10)
    for (const ee of entry.employees) {
      const key = `${ee.employee.id}|${dateKey}`
      const existing = byEmployee.get(key)
      if (existing) existing.entries.push(entry)
      else
        byEmployee.set(key, {
          name: `${ee.employee.firstName} ${ee.employee.lastName}`.trim(),
          date: entry.date,
          entries: [entry],
        })
    }
    for (const ev of entry.vehicles) {
      const key = `${ev.vehicle.id}|${dateKey}`
      const existing = byVehicle.get(key)
      if (existing) existing.entries.push(entry)
      else byVehicle.set(key, { name: ev.vehicle.name, date: entry.date, entries: [entry] })
      if (ev.vehicle.status !== 'AVAILABLE') {
        conflicts.push({
          type: 'vehicleUnavailable',
          name: ev.vehicle.name,
          status: ev.vehicle.status,
          date: entry.date,
          entryIds: [entry.id],
        })
      }
    }
  }

  /** Entry ids that overlap with at least one other entry in the group. */
  function overlappingIds(group: ConflictEntry[]): string[] {
    const ids = new Set<string>()
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (entriesOverlap(group[i], group[j])) {
          ids.add(group[i].id)
          ids.add(group[j].id)
        }
      }
    }
    return [...ids]
  }

  for (const c of byEmployee.values()) {
    if (c.entries.length < 2) continue
    const ids = overlappingIds(c.entries)
    if (ids.length > 1) conflicts.push({ type: 'employee', name: c.name, date: c.date, entryIds: ids })
  }
  for (const c of byVehicle.values()) {
    if (c.entries.length < 2) continue
    const ids = overlappingIds(c.entries)
    if (ids.length > 1) conflicts.push({ type: 'vehicle', name: c.name, date: c.date, entryIds: ids })
  }
  return conflicts
}

/**
 * Crew members scheduled on a day they are away (holiday, sick …).
 * One conflict per employee and day, carrying every affected entry.
 */
export function detectAbsenceConflicts(
  entries: ConflictEntry[],
  absences: AbsenceRange[]
): Conflict[] {
  if (absences.length === 0) return []
  const grouped = new Map<
    string,
    { name: string; absenceType: string; date: Date; entryIds: string[] }
  >()
  for (const entry of entries) {
    const away = absentEmployeesOn(absences, entry.date)
    if (away.size === 0) continue
    const dateKey = entry.date.toISOString().slice(0, 10)
    for (const ee of entry.employees) {
      const absenceType = away.get(ee.employee.id)
      if (!absenceType) continue
      const key = `${ee.employee.id}|${dateKey}`
      const existing = grouped.get(key)
      if (existing) existing.entryIds.push(entry.id)
      else
        grouped.set(key, {
          name: `${ee.employee.firstName} ${ee.employee.lastName}`.trim(),
          absenceType,
          date: entry.date,
          entryIds: [entry.id],
        })
    }
  }
  return [...grouped.values()].map((g) => ({ type: 'absence' as const, ...g }))
}
