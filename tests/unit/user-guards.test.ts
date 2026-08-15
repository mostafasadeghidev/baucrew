import { describe, expect, it } from 'vitest'
import { deleteUserBlockReason } from '@/lib/user-guards'

const admin = { id: 'a1', role: 'ADMIN' as const, active: true }

describe('deleteUserBlockReason', () => {
  it('blocks deleting your own account', () => {
    expect(deleteUserBlockReason({ actorId: 'a1', target: admin, otherActiveAdmins: 3 })).toBe('selfDelete')
  })
  it('blocks deleting the last active admin', () => {
    expect(deleteUserBlockReason({ actorId: 'x', target: admin, otherActiveAdmins: 0 })).toBe('lastAdmin')
  })
  it('allows deleting an admin when another active admin exists', () => {
    expect(deleteUserBlockReason({ actorId: 'x', target: admin, otherActiveAdmins: 1 })).toBeNull()
  })
  it('allows deleting an inactive admin even if it is the only one', () => {
    expect(
      deleteUserBlockReason({ actorId: 'x', target: { ...admin, active: false }, otherActiveAdmins: 0 })
    ).toBeNull()
  })
  it('allows deleting office/employee accounts', () => {
    expect(
      deleteUserBlockReason({ actorId: 'x', target: { id: 'b', role: 'MANAGER', active: true }, otherActiveAdmins: 0 })
    ).toBeNull()
    expect(
      deleteUserBlockReason({ actorId: 'x', target: { id: 'c', role: 'EMPLOYEE', active: true }, otherActiveAdmins: 0 })
    ).toBeNull()
  })
})
