// Pure logic — no server-only import so it can be unit-tested directly.

export const ABSENCE_TYPES = ['VACATION', 'SICK', 'OTHER'] as const
export type AbsenceType = (typeof ABSENCE_TYPES)[number]

export function isAbsenceType(v: unknown): v is AbsenceType {
  return typeof v === 'string' && (ABSENCE_TYPES as readonly string[]).includes(v)
}

export type AbsenceRange = {
  employeeId: string
  startDate: Date
  endDate: Date
  type: string
}

/** Dates are UTC-midnight @db.Date values; compare by calendar day, inclusive. */
export function absenceCoversDay(a: { startDate: Date; endDate: Date }, day: Date): boolean {
  const d = day.toISOString().slice(0, 10)
  return a.startDate.toISOString().slice(0, 10) <= d && d <= a.endDate.toISOString().slice(0, 10)
}

/** employeeId → absence type for everyone away on that day. */
export function absentEmployeesOn(absences: AbsenceRange[], day: Date): Map<string, string> {
  const out = new Map<string, string>()
  for (const a of absences) {
    if (!out.has(a.employeeId) && absenceCoversDay(a, day)) out.set(a.employeeId, a.type)
  }
  return out
}
