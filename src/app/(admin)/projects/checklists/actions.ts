'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import type { SaveState } from '@/components/saved-form'

/** One point per line, empty lines dropped. */
function itemsFrom(formData: FormData): string[] {
  return String(formData.get('items') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200)
}

function nameFrom(formData: FormData): string {
  return String(formData.get('name') ?? '')
    .trim()
    .slice(0, 200)
}

export async function createChecklist(formData: FormData): Promise<SaveState> {
  const user = await requireManagement()
  const name = nameFrom(formData)
  const lines = itemsFrom(formData)
  if (!name) return { error: 'saveFailed' }

  const template = await db.checklistTemplate.create({
    data: {
      name,
      description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
      active: formData.get('active') === 'on',
      items: { create: lines.map((text, sortOrder) => ({ text, sortOrder })) },
    },
  })
  await audit({
    userId: user.id,
    action: 'checklistTemplate.create',
    entity: 'System',
    entityId: template.id,
    newValue: `${name} (${lines.length})`,
  })
  revalidatePath('/projects/checklists')
  revalidatePath('/projects')
  redirect('/projects/checklists')
}

export async function updateChecklist(id: string, formData: FormData): Promise<SaveState> {
  const user = await requireManagement()
  const name = nameFrom(formData)
  const lines = itemsFrom(formData)
  if (!name) return { error: 'saveFailed' }

  await db.checklistTemplate.update({
    where: { id },
    data: {
      name,
      description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
      active: formData.get('active') === 'on',
      items: {
        deleteMany: {},
        create: lines.map((text, sortOrder) => ({ text, sortOrder })),
      },
    },
  })
  await audit({
    userId: user.id,
    action: 'checklistTemplate.update',
    entity: 'System',
    entityId: id,
    newValue: `${name} (${lines.length})`,
  })
  revalidatePath('/projects/checklists')
  revalidatePath('/projects')
  return { savedAt: Date.now() }
}

export async function deleteChecklist(
  id: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireManagement()
  const template = await db.checklistTemplate.findUnique({
    where: { id },
    select: { name: true },
  })
  if (!template) return { error: 'saveFailed' }
  // Lists already copied onto a project stay — they are independent copies.
  await db.checklistTemplate.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'checklistTemplate.delete',
    entity: 'System',
    entityId: id,
    oldValue: template.name,
  })
  revalidatePath('/projects/checklists')
  redirect('/projects/checklists')
}
