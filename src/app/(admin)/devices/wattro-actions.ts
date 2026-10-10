'use server'

import { revalidatePath } from 'next/cache'
import { requireManagement } from '@/lib/authz'
import { syncWattroDevices } from '@/lib/wattro/sync'
import { recordSyncRun } from '@/lib/wattro/auto-sync'
import type { WattroSyncOutcome } from '@/lib/wattro/assets'

/**
 * Reads Wattro's machines into the Devices page. Office-only: the devices are
 * master data, and the sync writes into them. Wattro itself is only ever
 * read — hand-outs, returns and project changes never travel that way.
 */
export async function syncWattroDevicesAction(): Promise<WattroSyncOutcome> {
  const user = await requireManagement()
  const outcome = await syncWattroDevices()

  await recordSyncRun(user.id, outcome, 'manual')

  revalidatePath('/devices')
  return outcome
}
