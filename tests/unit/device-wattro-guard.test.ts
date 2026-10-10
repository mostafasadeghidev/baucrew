import { beforeEach, describe, expect, it, vi } from 'vitest'

// A machine Wattro keeps: the form may change only what this app alone
// knows, and it cannot be deleted here (the next sync would bring it back
// without its notes and hand-out history). Enforced in the actions, not only
// by the form leaving the fields out.

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => ({ id: 'm', role: 'MANAGER', canViewFinancials: false }),
}))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))

const device = vi.hoisted(() => ({
  row: null as null | { name: string; externalSystem: string | null },
  update: vi.fn(),
  delete: vi.fn(),
}))
const handouts = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    deviceAssignment: {
      findFirst: async () => null,
      create: (...args: unknown[]) => handouts.create(...args),
    },
    device: {
      findUnique: async () => device.row,
      update: (...args: unknown[]) => device.update(...args),
      delete: (...args: unknown[]) => device.delete(...args),
    },
  },
}))

import { deleteDevice, handOutDevice, updateDevice } from '@/app/(admin)/devices/actions'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const everything = {
  name: 'Umbenannt',
  inventoryNo: 'X-1',
  storageLocation: 'Regal 9',
  category: 'Leitern',
  videoUrl: 'https://example.com/v',
  notes: 'Nur mit Aushang',
}

beforeEach(() => {
  handouts.create.mockReset()
  device.update.mockReset()
  device.delete.mockReset()
})

describe('updateDevice', () => {
  it('takes only category, video and notes for a Wattro machine, whatever the form sends', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: 'wattro' }
    await expect(updateDevice('d1', form(everything))).resolves.toMatchObject({ savedAt: expect.any(Number) })
    expect(device.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { category: 'Leitern', videoUrl: 'https://example.com/v', notes: 'Nur mit Aushang' },
    })
  })

  it('saves a Wattro machine even though the form has no name field', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: 'wattro' }
    await expect(updateDevice('d1', form({ notes: 'neu' }))).resolves.toMatchObject({ savedAt: expect.any(Number) })
  })

  it('takes every field for a device of this app’s own', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: null }
    await updateDevice('d2', form({ ...everything, active: 'on' }))
    expect(device.update).toHaveBeenCalledWith({
      where: { id: 'd2' },
      data: expect.objectContaining({ name: 'Umbenannt', inventoryNo: 'X-1', storageLocation: 'Regal 9', active: true }),
    })
  })

  it('still needs a name for a device of this app’s own', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: null }
    await expect(updateDevice('d2', form({ notes: 'x' }))).resolves.toEqual({ error: 'saveFailed' })
    expect(device.update).not.toHaveBeenCalled()
  })
})

describe('deleteDevice', () => {
  it('refuses a Wattro machine', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: 'wattro' }
    await expect(deleteDevice('d1', {}, new FormData())).resolves.toEqual({ error: 'saveFailed' })
    expect(device.delete).not.toHaveBeenCalled()
  })

  it('deletes a device of this app’s own', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: null }
    await expect(deleteDevice('d2', {}, new FormData())).rejects.toThrow('REDIRECT:/devices')
    expect(device.delete).toHaveBeenCalledWith({ where: { id: 'd2' } })
  })
})

describe('handOutDevice', () => {
  it('refuses a Wattro machine — it is handed out in Wattro, by the crew’s scan', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: 'wattro' }
    await expect(handOutDevice('d1', { projectId: 'p1' })).resolves.toEqual({ error: 'wattro' })
    expect(handouts.create).not.toHaveBeenCalled()
  })

  it('hands out a device of this app’s own', async () => {
    device.row = { name: 'Muster Leiter', externalSystem: null }
    await expect(handOutDevice('d2', { projectId: 'p1' })).resolves.toMatchObject({ savedAt: expect.any(Number) })
    expect(handouts.create).toHaveBeenCalledOnce()
  })
})
