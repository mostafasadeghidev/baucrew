import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

const currentUser = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => currentUser.value,
}))

import { canViewFinancials, requireAdmin, requireManagement, requireUser } from '@/lib/authz'

type U = { id: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; canViewFinancials: boolean }
const admin: U = { id: 'a', role: 'ADMIN', canViewFinancials: true }
const manager: U = { id: 'm', role: 'MANAGER', canViewFinancials: false }
const managerWithFinance: U = { id: 'mf', role: 'MANAGER', canViewFinancials: true }
const employee: U = { id: 'e', role: 'EMPLOYEE', canViewFinancials: false }

describe('canViewFinancials', () => {
  it('admins always see financials', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canViewFinancials(admin as any)).toBe(true)
  })
  it('managers only with the explicit flag', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canViewFinancials(manager as any)).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canViewFinancials(managerWithFinance as any)).toBe(true)
  })
  it('employees never, even if the flag were set by mistake', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canViewFinancials({ ...employee, canViewFinancials: true } as any)).toBe(false)
  })
})

describe('require* guards', () => {
  it('requireUser redirects anonymous users to /login', async () => {
    currentUser.value = null
    await expect(requireUser()).rejects.toThrow('REDIRECT:/login')
  })
  it('requireManagement sends employees to /my', async () => {
    currentUser.value = employee
    await expect(requireManagement()).rejects.toThrow('REDIRECT:/my')
  })
  it('requireManagement lets managers and admins through', async () => {
    currentUser.value = manager
    await expect(requireManagement()).resolves.toMatchObject({ id: 'm' })
    currentUser.value = admin
    await expect(requireManagement()).resolves.toMatchObject({ id: 'a' })
  })
  it('requireAdmin rejects managers', async () => {
    currentUser.value = manager
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/')
    currentUser.value = admin
    await expect(requireAdmin()).resolves.toMatchObject({ id: 'a' })
  })
})
