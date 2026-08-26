/**
 * Where a device is right now. Pure — the DB work lives in the device
 * actions; availability is never stored, it is read from the open handout so
 * a later sync with an outside system cannot contradict it.
 */

export type Handout = {
  returnedAt: Date | null
  project: { id: string; number: string; name: string } | null
  employee: { id: string; firstName: string; lastName: string } | null
}

export type DeviceState =
  | { status: 'free' }
  | { status: 'onSite'; projectId: string; label: string }
  | { status: 'withEmployee'; employeeId: string; label: string }
  | { status: 'out'; label: string }

/** The open handout decides; anything returned is history. */
export function deviceState(handouts: Handout[]): DeviceState {
  const open = handouts.find((h) => h.returnedAt === null)
  if (!open) return { status: 'free' }
  if (open.project) {
    return {
      status: 'onSite',
      projectId: open.project.id,
      label: `${open.project.number} — ${open.project.name}`,
    }
  }
  if (open.employee) {
    return {
      status: 'withEmployee',
      employeeId: open.employee.id,
      label: `${open.employee.firstName} ${open.employee.lastName}`.trim(),
    }
  }
  // Booked out without saying where — still not free.
  return { status: 'out', label: '' }
}

export function isAvailable(handouts: Handout[]): boolean {
  return deviceState(handouts).status === 'free'
}

/** Days a device has been out; for the "still on that site?" hint. */
export function daysOut(takenAt: Date, now: Date): number {
  const ms = now.getTime() - takenAt.getTime()
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0
}
