/**
 * Guards for deleting/deactivating user accounts. Pure logic — no DB access —
 * so it can be unit-tested; callers pass in the facts.
 */

export type DeleteUserBlock = 'selfDelete' | 'lastAdmin'

/**
 * Why a user account must not be deleted right now, or null if it may be.
 *
 * - `selfDelete`: the acting admin tries to delete the account they are signed
 *   in with. They must sign out, sign in with another administrator and delete
 *   it from there.
 * - `lastAdmin`: the target is the only active administrator left; deleting it
 *   would lock everybody out of Settings.
 */
export function deleteUserBlockReason(input: {
  actorId: string
  target: { id: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; active: boolean }
  /** Number of active ADMIN accounts other than the target. */
  otherActiveAdmins: number
}): DeleteUserBlock | null {
  if (input.target.id === input.actorId) return 'selfDelete'
  if (input.target.role === 'ADMIN' && input.target.active && input.otherActiveAdmins === 0) {
    return 'lastAdmin'
  }
  return null
}
