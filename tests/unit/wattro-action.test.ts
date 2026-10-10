import { beforeEach, describe, expect, it, vi } from 'vitest'

// The action must stay behind the office guard: employees and site managers
// are sent away before the sync is so much as looked at.

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const currentUser = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => currentUser.value,
}))

const syncMock = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@/lib/wattro/sync', () => ({
  syncWattroDevices: (...args: unknown[]) => syncMock.run(...args),
}))

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { syncWattroDevicesAction } from '@/app/(admin)/devices/wattro-actions'

beforeEach(() => {
  vi.mocked(audit).mockClear()
  vi.mocked(revalidatePath).mockClear()
  syncMock.run.mockReset()
})

describe('syncWattroDevicesAction authorization', () => {
  it('sends an employee to /my without running the sync', async () => {
    currentUser.value = { id: 'e', role: 'EMPLOYEE', canViewFinancials: false }
    await expect(syncWattroDevicesAction()).rejects.toThrow('REDIRECT:/my')
    expect(syncMock.run).not.toHaveBeenCalled()
  })

  it('sends a site manager to /projects without running the sync', async () => {
    currentUser.value = { id: 's', role: 'SITE_MANAGER', canViewFinancials: false }
    await expect(syncWattroDevicesAction()).rejects.toThrow('REDIRECT:/projects')
    expect(syncMock.run).not.toHaveBeenCalled()
  })

  it('runs the sync for a manager, audits it and refreshes the page', async () => {
    currentUser.value = { id: 'm', role: 'MANAGER', canViewFinancials: false }
    syncMock.run.mockResolvedValueOnce({
      ok: true,
      counts: {
        created: 1,
        adopted: 2,
        updated: 3,
        unchanged: 4,
        deactivated: 0,
        invalid: 0,
        conflictCount: 0,
        conflicts: [],
        fetchedActive: 6,
        fetchedInactive: 0,
      },
    })

    const outcome = await syncWattroDevicesAction()

    expect(outcome).toMatchObject({ ok: true })
    expect(syncMock.run).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'device.wattroSync' }))
    expect(revalidatePath).toHaveBeenCalledWith('/devices')
  })

  it('audits a failed sync without pretending it worked', async () => {
    currentUser.value = { id: 'a', role: 'ADMIN', canViewFinancials: true }
    syncMock.run.mockResolvedValueOnce({ ok: false, error: 'auth' })

    const outcome = await syncWattroDevicesAction()

    expect(outcome).toMatchObject({ ok: false, error: 'auth' })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'device.wattroSyncFailed' }))
    expect(revalidatePath).toHaveBeenCalledWith('/devices')
  })
})
