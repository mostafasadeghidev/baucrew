'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireStaff } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { addNeeds, previewNeeds, type AddNeedsResult, type NeedPick, type NeedPreviewLine } from '@/lib/project-needs-server'

// The card's needs sections (Material, Werkzeug): a row's quantity and note,
// and a whole list pasted in at once. Adding one entry, its status and
// removing it stay in ../actions.ts, where the schedule dialog uses them too.

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/card/${projectId}`)
}

/** A row's quantity and note, as the office corrects them on the card. */
export async function updateProjectItem(
  projectId: string,
  projectItemId: string,
  input: { quantity: number | null; note: string | null }
): Promise<{ error?: 'saveFailed' }> {
  const user = await requireStaff()
  const item = await db.projectItem.findUnique({
    where: { id: projectItemId },
    include: { catalogItem: { select: { name: true } } },
  })
  if (!item || item.projectId !== projectId || !(await canWorkOn(user, projectId))) return { error: 'saveFailed' }
  const quantity =
    input.quantity != null && Number.isFinite(input.quantity) && input.quantity >= 0 && input.quantity <= 999_999_999
      ? input.quantity
      : null
  const note = input.note?.trim().slice(0, 500) || null
  await db.projectItem.update({ where: { id: projectItemId }, data: { quantity, note } })
  await audit({
    userId: user.id,
    action: 'projectItem.update',
    entity: 'Project',
    entityId: projectId,
    field: item.catalogItem.name,
    oldValue: [item.quantity != null ? String(Number(item.quantity)) : '', item.note ?? ''].join(' · '),
    newValue: [quantity != null ? String(quantity) : '', note ?? ''].join(' · '),
  })
  refresh(projectId)
  return {}
}

/** The lines of a pasted needs list with the catalogue entry each one means — nothing written yet. */
export async function previewNeedsList(projectId: string, text: string): Promise<{ lines?: NeedPreviewLine[]; error?: 'notAllowed' }> {
  const user = await requireStaff()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  return { lines: await previewNeeds(projectId, text) }
}

/** The lines as the person settled them in the preview, onto the project's list. */
export async function addNeedsList(projectId: string, picks: NeedPick[]): Promise<{ result?: AddNeedsResult; error?: 'notAllowed' }> {
  const user = await requireStaff()
  const result = await addNeeds(user, projectId, picks)
  if (!result) return { error: 'notAllowed' }
  refresh(projectId)
  return { result }
}
