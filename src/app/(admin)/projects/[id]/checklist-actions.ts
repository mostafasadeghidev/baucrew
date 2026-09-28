'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireStaff, requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { audit } from '@/lib/audit'
import { notifyCard } from '@/lib/notifications-db'

export type ChecklistResult = { error?: 'notAllowed' | 'saveFailed'; savedAt?: number }

/** Adds a checklist to a project — empty or copied from a template. */
export async function addProjectChecklist(
  projectId: string,
  input: { templateId?: string; name?: string }
): Promise<ChecklistResult> {
  const user = await requireStaff()
  const name = (input.name ?? '').trim().slice(0, 200)

  let items: Array<{ text: string; sortOrder: number }> = []
  let title = name
  if (input.templateId) {
    const template = await db.checklistTemplate.findUnique({
      where: { id: input.templateId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!template) return { error: 'saveFailed' }
    title = name || template.name
    items = template.items.map((i, index) => ({ text: i.text, sortOrder: index }))
  }
  if (!title) return { error: 'saveFailed' }

  const checklist = await db.projectChecklist.create({
    data: {
      projectId,
      name: title,
      templateId: input.templateId ?? null,
      items: { create: items },
    },
  })
  await audit({
    userId: user.id,
    action: 'checklist.add',
    entity: 'Project',
    entityId: projectId,
    newValue: `${title} (${items.length})`,
  })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my')
  return { savedAt: Date.now(), ...(checklist ? {} : {}) }
}

export async function removeProjectChecklist(checklistId: string): Promise<ChecklistResult> {
  const user = await requireStaff()
  const checklist = await db.projectChecklist.findUnique({
    where: { id: checklistId },
    select: { projectId: true, name: true },
  })
  if (!checklist) return { error: 'saveFailed' }
  await db.projectChecklist.delete({ where: { id: checklistId } })
  await audit({
    userId: user.id,
    action: 'checklist.remove',
    entity: 'Project',
    entityId: checklist.projectId,
    oldValue: checklist.name,
  })
  revalidatePath(`/projects/${checklist.projectId}`)
  revalidatePath('/my')
  return { savedAt: Date.now() }
}

/** Adds a single line to an existing checklist (office or crew on site). */
export async function addChecklistItem(checklistId: string, text: string): Promise<ChecklistResult> {
  const user = await requireUser()
  const value = text.trim().slice(0, 500)
  if (!value) return { error: 'saveFailed' }
  const checklist = await db.projectChecklist.findUnique({
    where: { id: checklistId },
    select: { projectId: true, _count: { select: { items: true } } },
  })
  if (!checklist) return { error: 'saveFailed' }
  if (!(await mayEditChecklist(user, checklist.projectId))) return { error: 'notAllowed' }

  await db.projectChecklistItem.create({
    data: { checklistId, text: value, sortOrder: checklist._count.items },
  })
  await audit({
    userId: user.id,
    action: 'checklist.item.add',
    entity: 'Project',
    entityId: checklist.projectId,
    newValue: value,
  })
  revalidatePath(`/projects/${checklist.projectId}`)
  revalidatePath('/my')
  return { savedAt: Date.now() }
}

export async function removeChecklistItem(itemId: string): Promise<ChecklistResult> {
  const user = await requireStaff()
  const item = await db.projectChecklistItem.findUnique({
    where: { id: itemId },
    select: { text: true, checklist: { select: { projectId: true } } },
  })
  if (!item) return { error: 'saveFailed' }
  await db.projectChecklistItem.delete({ where: { id: itemId } })
  await audit({
    userId: user.id,
    action: 'checklist.item.remove',
    entity: 'Project',
    entityId: item.checklist.projectId,
    oldValue: item.text,
  })
  revalidatePath(`/projects/${item.checklist.projectId}`)
  revalidatePath('/my')
  return { savedAt: Date.now() }
}

/**
 * Ticks one line: `ok` true = in order, false = problem (note explains),
 * null = back to open. Who ticked it and when is stored with it.
 */
export async function setChecklistItem(
  itemId: string,
  input: { ok: boolean | null; note?: string }
): Promise<ChecklistResult> {
  const user = await requireUser()
  const item = await db.projectChecklistItem.findUnique({
    where: { id: itemId },
    select: { text: true, ok: true, checklist: { select: { projectId: true } } },
  })
  if (!item) return { error: 'saveFailed' }
  if (!(await mayEditChecklist(user, item.checklist.projectId))) return { error: 'notAllowed' }

  await db.projectChecklistItem.update({
    where: { id: itemId },
    data: {
      ok: input.ok,
      note: input.note !== undefined ? input.note.trim().slice(0, 1000) || null : undefined,
      checkedAt: input.ok === null ? null : new Date(),
      checkedById: input.ok === null ? null : (user.employee?.id ?? null),
    },
  })
  await audit({
    userId: user.id,
    action: 'checklist.item.check',
    entity: 'Project',
    entityId: item.checklist.projectId,
    field: item.text,
    oldValue: item.ok === null ? '' : item.ok ? 'OK' : 'PROBLEM',
    newValue: input.ok === null ? '' : input.ok ? 'OK' : 'PROBLEM',
  })
  revalidatePath(`/projects/${item.checklist.projectId}`)
  revalidatePath('/my')
  return { savedAt: Date.now() }
}

/** Who may tick and edit a project's checklists: whoever may work on the project (src/lib/crew-access.ts). */
const mayEditChecklist = canWorkOn

/**
 * Trello's person and day on a checklist item: who is to see to it, and by
 * when. The person put on it hears of it in the bell.
 */
export async function setChecklistItemPlan(
  itemId: string,
  plan: { assigneeId?: string | null; dueDate?: string | null }
): Promise<ChecklistResult> {
  const user = await requireStaff()
  const item = await db.projectChecklistItem.findUnique({
    where: { id: itemId },
    select: { text: true, assigneeId: true, checklist: { select: { projectId: true } } },
  })
  if (!item) return { error: 'saveFailed' }
  if (!(await mayEditChecklist(user, item.checklist.projectId))) return { error: 'notAllowed' }
  const data: { assigneeId?: string | null; dueDate?: Date | null } = {}
  if (plan.assigneeId !== undefined) {
    if (plan.assigneeId && !(await db.employee.count({ where: { id: plan.assigneeId } }))) return { error: 'saveFailed' }
    data.assigneeId = plan.assigneeId || null
  }
  if (plan.dueDate !== undefined) {
    if (plan.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(plan.dueDate)) return { error: 'saveFailed' }
    data.dueDate = plan.dueDate ? new Date(`${plan.dueDate}T00:00:00.000Z`) : null
  }
  await db.projectChecklistItem.update({ where: { id: itemId }, data })
  if (data.assigneeId && data.assigneeId !== item.assigneeId)
    await notifyCard(item.checklist.projectId, user.id, 'checkItem', { text: item.text.slice(0, 160), onlyEmployeeId: data.assigneeId })
  revalidatePath(`/projects/${item.checklist.projectId}`)
  revalidatePath('/projects')
  revalidatePath('/my')
  return {}
}
