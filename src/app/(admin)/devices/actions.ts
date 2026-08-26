'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import type { SaveState } from '@/components/saved-form'

function text(formData: FormData, field: string, max = 200): string | null {
  const value = String(formData.get(field) ?? '').trim().slice(0, max)
  return value || null
}

export async function createDevice(formData: FormData): Promise<SaveState> {
  const user = await requireManagement()
  const name = text(formData, 'name')
  if (!name) return { error: 'saveFailed' }

  const device = await db.device.create({
    data: {
      name,
      inventoryNo: text(formData, 'inventoryNo', 60),
      category: text(formData, 'category', 60),
      storageLocation: text(formData, 'storageLocation', 120),
      videoUrl: text(formData, 'videoUrl', 500),
      notes: text(formData, 'notes', 1000),
      active: formData.get('active') === 'on',
    },
  })
  await audit({
    userId: user.id,
    action: 'device.create',
    entity: 'System',
    entityId: device.id,
    newValue: name,
  })
  revalidatePath('/devices')
  redirect(`/devices/${device.id}`)
}

export async function updateDevice(id: string, formData: FormData): Promise<SaveState> {
  const user = await requireManagement()
  const name = text(formData, 'name')
  if (!name) return { error: 'saveFailed' }

  await db.device.update({
    where: { id },
    data: {
      name,
      inventoryNo: text(formData, 'inventoryNo', 60),
      category: text(formData, 'category', 60),
      storageLocation: text(formData, 'storageLocation', 120),
      videoUrl: text(formData, 'videoUrl', 500),
      notes: text(formData, 'notes', 1000),
      active: formData.get('active') === 'on',
    },
  })
  await audit({
    userId: user.id,
    action: 'device.update',
    entity: 'System',
    entityId: id,
    newValue: name,
  })
  revalidatePath('/devices')
  revalidatePath(`/devices/${id}`)
  return { savedAt: Date.now() }
}

export async function deleteDevice(
  id: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireManagement()
  const device = await db.device.findUnique({ where: { id }, select: { name: true } })
  if (!device) return { error: 'saveFailed' }
  await db.device.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'device.delete',
    entity: 'System',
    entityId: id,
    oldValue: device.name,
  })
  revalidatePath('/devices')
  redirect('/devices')
}

export type HandoutResult = { error?: 'busy' | 'saveFailed'; savedAt?: number }

/**
 * Hands a device to a site or a person. A device that is still out cannot be
 * given away twice — that is the whole point of the module.
 */
export async function handOutDevice(
  deviceId: string,
  input: { projectId?: string; employeeId?: string; note?: string }
): Promise<HandoutResult> {
  const user = await requireManagement()
  const open = await db.deviceAssignment.findFirst({
    where: { deviceId, returnedAt: null },
    select: { id: true },
  })
  if (open) return { error: 'busy' }

  const projectId = input.projectId || null
  const employeeId = input.employeeId || null
  if (!projectId && !employeeId) return { error: 'saveFailed' }

  await db.deviceAssignment.create({
    data: {
      deviceId,
      projectId,
      employeeId,
      note: (input.note ?? '').trim().slice(0, 300) || null,
      createdById: user.id,
    },
  })
  await audit({
    userId: user.id,
    action: 'device.handOut',
    entity: 'System',
    entityId: deviceId,
    newValue: projectId ? `project:${projectId}` : `employee:${employeeId}`,
  })
  revalidatePath('/devices')
  revalidatePath(`/devices/${deviceId}`)
  if (projectId) revalidatePath(`/projects/${projectId}`)
  return { savedAt: Date.now() }
}

/** Takes the device back into the store. */
export async function returnDevice(deviceId: string): Promise<HandoutResult> {
  const user = await requireManagement()
  const open = await db.deviceAssignment.findFirst({
    where: { deviceId, returnedAt: null },
    select: { id: true, projectId: true },
  })
  if (!open) return { savedAt: Date.now() }

  await db.deviceAssignment.update({
    where: { id: open.id },
    data: { returnedAt: new Date() },
  })
  await audit({
    userId: user.id,
    action: 'device.return',
    entity: 'System',
    entityId: deviceId,
  })
  revalidatePath('/devices')
  revalidatePath(`/devices/${deviceId}`)
  if (open.projectId) revalidatePath(`/projects/${open.projectId}`)
  return { savedAt: Date.now() }
}
