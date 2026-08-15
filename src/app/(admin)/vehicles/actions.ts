'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { VehicleStatus } from '@/generated/prisma/enums'

const optional = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v ? v : null))

const vehicleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  licensePlate: optional,
  type: optional,
  status: z.enum(VehicleStatus),
  active: z.string().transform((v) => v === 'on'),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v ? v : null)),
})

export type VehicleFormState = { error?: 'nameRequired' | 'saveFailed' }

function parseVehicleForm(formData: FormData) {
  return vehicleSchema.safeParse({
    name: formData.get('name') ?? '',
    licensePlate: formData.get('licensePlate') ?? '',
    type: formData.get('type') ?? '',
    status: formData.get('status') ?? 'AVAILABLE',
    active: formData.get('active') ?? '',
    notes: formData.get('notes') ?? '',
  })
}

function errorKey(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>
): NonNullable<VehicleFormState['error']> {
  return issues.some((i) => i.path[0] === 'name') ? 'nameRequired' : 'saveFailed'
}

export async function createVehicle(
  _prev: VehicleFormState,
  formData: FormData
): Promise<VehicleFormState> {
  const user = await requireManagement()
  const parsed = parseVehicleForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const vehicle = await db.vehicle.create({ data: parsed.data })
  await audit({
    userId: user.id,
    action: 'vehicle.create',
    entity: 'Vehicle',
    entityId: vehicle.id,
    newValue: vehicle.name,
  })
  revalidatePath('/vehicles')
  redirect(`/vehicles/${vehicle.id}`)
}

export async function updateVehicle(
  id: string,
  _prev: VehicleFormState,
  formData: FormData
): Promise<VehicleFormState> {
  const user = await requireManagement()
  const parsed = parseVehicleForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const before = await db.vehicle.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  await db.vehicle.update({ where: { id }, data: parsed.data })
  if (before.status !== parsed.data.status) {
    await audit({
      userId: user.id,
      action: 'vehicle.status',
      entity: 'Vehicle',
      entityId: id,
      field: 'status',
      oldValue: before.status,
      newValue: parsed.data.status,
    })
  }
  await audit({
    userId: user.id,
    action: 'vehicle.update',
    entity: 'Vehicle',
    entityId: id,
    newValue: parsed.data.name,
  })
  revalidatePath('/vehicles')
  revalidatePath(`/vehicles/${id}`)
  redirect(`/vehicles/${id}`)
}

/** Quick status change from the vehicle detail header. */
export async function setVehicleStatus(id: string, status: string): Promise<{ error?: string }> {
  const user = await requireManagement()
  if (!(status in VehicleStatus)) return { error: 'saveFailed' }
  const before = await db.vehicle.findUnique({ where: { id }, select: { status: true, name: true } })
  if (!before) return { error: 'saveFailed' }
  if (before.status === status) return {}
  await db.vehicle.update({ where: { id }, data: { status: status as VehicleStatus } })
  await audit({
    userId: user.id,
    action: 'vehicle.status',
    entity: 'Vehicle',
    entityId: id,
    field: 'status',
    oldValue: before.status,
    newValue: status,
  })
  revalidatePath('/vehicles')
  revalidatePath(`/vehicles/${id}`)
  revalidatePath('/schedule')
  return {}
}

export type DeleteState = { error?: string }

const OPEN_STATUSES = [
  'LEAD',
  'QUOTED',
  'APPROVED',
  'PLANNED',
  'IN_PROGRESS',
] as const

function todayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

export async function deleteVehicle(
  id: string,
  _prev: DeleteState,
  _formData: FormData
): Promise<DeleteState> {
  const user = await requireManagement()
  const [openProjects, upcomingEntries] = await Promise.all([
    db.project.count({ where: { vehicleId: id, status: { in: [...OPEN_STATUSES] } } }),
    db.scheduleEntryVehicle.count({
      where: { vehicleId: id, scheduleEntry: { date: { gte: todayUtc() } } },
    }),
  ])
  if (openProjects > 0 || upcomingEntries > 0) {
    return { error: 'cannotDeleteInUse' }
  }
  const vehicle = await db.vehicle.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'vehicle.delete',
    entity: 'Vehicle',
    entityId: id,
    oldValue: vehicle.name,
  })
  revalidatePath('/vehicles')
  redirect('/vehicles')
}
