'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { audit } from '@/lib/audit'

const ITEM_STATUSES = ['REQUIRED', 'COLLECTED', 'MISSING'] as const
type ItemStatus = (typeof ITEM_STATUSES)[number]

/**
 * Warehouse packing workflow: unlike the management project editor, ALL
 * authenticated users (including employees on the warehouse touchscreen)
 * may update the collected/missing status of an item.
 */
export async function setItemStatusFromBoard(projectItemId: string, status: string): Promise<void> {
  const user = await requireUser()
  if (!ITEM_STATUSES.includes(status as ItemStatus)) return
  const item = await db.projectItem.findUnique({
    where: { id: projectItemId },
    include: { catalogItem: { select: { name: true } } },
  })
  if (!item) return
  await db.projectItem.update({
    where: { id: projectItemId },
    data: { status: status as ItemStatus },
  })
  await audit({
    userId: user.id,
    action: 'projectItem.status',
    entity: 'Project',
    entityId: item.projectId,
    field: item.catalogItem.name,
    oldValue: item.status,
    newValue: status,
  })
  revalidatePath('/today')
  revalidatePath(`/projects/${item.projectId}`)
}
