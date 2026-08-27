'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import type { SaveState } from '@/components/saved-form'
import { deviceState } from '@/lib/devices'

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

export type NeedResult = { error?: 'alreadyAdded' | 'saveFailed' }

/** Adds a machine to the list a project needs (no handout yet). */
export async function addProjectDevice(projectId: string, deviceId: string): Promise<NeedResult> {
  const user = await requireManagement()
  if (!deviceId) return { error: 'saveFailed' }
  try {
    await db.projectDevice.create({ data: { projectId, deviceId } })
  } catch (e: unknown) {
    const duplicate =
      typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
    return { error: duplicate ? 'alreadyAdded' : 'saveFailed' }
  }
  await audit({
    userId: user.id,
    action: 'projectDevice.add',
    entity: 'Project',
    entityId: projectId,
    newValue: deviceId,
  })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/schedule')
  return {}
}

export async function removeProjectDevice(projectId: string, deviceId: string): Promise<NeedResult> {
  const user = await requireManagement()
  await db.projectDevice.deleteMany({ where: { projectId, deviceId } })
  await audit({
    userId: user.id,
    action: 'projectDevice.remove',
    entity: 'Project',
    entityId: projectId,
    oldValue: deviceId,
  })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/schedule')
  return {}
}

/** The machines a project needs, each with where it is right now. */
export async function getProjectDevices(projectId: string): Promise<{
  rows: Array<{ id: string; name: string; inventoryNo: string | null; state: 'free' | 'here' | 'busy'; where: string }>
  options: Array<{ value: string; label: string }>
}> {
  await requireManagement()
  const [needs, all] = await Promise.all([
    db.projectDevice.findMany({
      where: { projectId },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            inventoryNo: true,
            assignments: {
              where: { returnedAt: null },
              select: {
                returnedAt: true,
                project: { select: { id: true, number: true, name: true } },
                employee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    }),
    db.device.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, inventoryNo: true },
    }),
  ])

  const taken = new Set(needs.map((n) => n.deviceId))
  return {
    rows: needs.map((need) => {
      const state = deviceState(need.device.assignments)
      const here = state.status === 'onSite' && state.projectId === projectId
      return {
        id: need.device.id,
        name: need.device.name,
        inventoryNo: need.device.inventoryNo,
        state: here ? ('here' as const) : state.status === 'free' ? ('free' as const) : ('busy' as const),
        where: state.status === 'onSite' || state.status === 'withEmployee' ? state.label : '',
      }
    }),
    options: all
      .filter((d) => !taken.has(d.id))
      .map((d) => ({ value: d.id, label: d.inventoryNo ? `${d.name} (${d.inventoryNo})` : d.name })),
  }
}
