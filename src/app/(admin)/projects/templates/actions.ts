'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'

export type TemplateFormState = { error?: 'nameRequired' | 'saveFailed'; savedAt?: number }

const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  workCategoryId: z.string().transform((v) => (v ? v : null)),
  description: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v ? v : null)),
  active: z.string().transform((v) => v === 'on'),
})

function parseTemplateForm(formData: FormData) {
  return templateSchema.safeParse({
    name: formData.get('name') ?? '',
    workCategoryId: formData.get('workCategoryId') ?? '',
    description: formData.get('description') ?? '',
    active: formData.get('active') ?? '',
  })
}

function errorKey(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>
): NonNullable<TemplateFormState['error']> {
  return issues.some((i) => i.path[0] === 'name') ? 'nameRequired' : 'saveFailed'
}

export async function createTemplate(
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const user = await requireManagement()
  const parsed = parseTemplateForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const template = await db.projectTemplate.create({ data: parsed.data })
  await audit({
    userId: user.id,
    action: 'template.create',
    entity: 'ProjectTemplate',
    entityId: template.id,
    newValue: template.name,
  })
  revalidatePath('/projects/templates')
  redirect(`/projects/templates/${template.id}`)
}

export async function updateTemplate(
  id: string,
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const user = await requireManagement()
  const parsed = parseTemplateForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const before = await db.projectTemplate.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  await db.projectTemplate.update({ where: { id }, data: parsed.data })
  await audit({
    userId: user.id,
    action: 'template.update',
    entity: 'ProjectTemplate',
    entityId: id,
    oldValue: before.name,
    newValue: parsed.data.name,
  })
  revalidatePath('/projects/templates')
  revalidatePath(`/projects/templates/${id}`)
  return { savedAt: Date.now() }
}

export type DeleteState = { error?: string }

export async function deleteTemplate(
  id: string,
  _prev: DeleteState,
  _formData: FormData
): Promise<DeleteState> {
  const user = await requireManagement()
  const template = await db.projectTemplate.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'template.delete',
    entity: 'ProjectTemplate',
    entityId: id,
    oldValue: template.name,
  })
  revalidatePath('/projects/templates')
  redirect('/projects/templates')
}

// ── Template items ───────────────────────────────────────────

export async function addTemplateItem(
  templateId: string,
  catalogItemId: string,
  quantity: number | null
): Promise<{ error?: 'itemAlreadyAdded' | 'saveFailed' }> {
  const user = await requireManagement()
  if (!catalogItemId) return { error: 'saveFailed' }
  const qty =
    quantity != null && Number.isFinite(quantity) && quantity >= 0 && quantity <= 999_999_999
      ? quantity
      : null
  try {
    const item = await db.templateItem.create({
      data: { templateId, catalogItemId, quantity: qty },
      include: { catalogItem: { select: { name: true } } },
    })
    await audit({
      userId: user.id,
      action: 'templateItem.add',
      entity: 'ProjectTemplate',
      entityId: templateId,
      newValue: item.catalogItem.name,
    })
  } catch (e: unknown) {
    const isUnique =
      typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
    return { error: isUnique ? 'itemAlreadyAdded' : 'saveFailed' }
  }
  revalidatePath(`/projects/templates/${templateId}`)
  return {}
}

export async function removeTemplateItem(templateId: string, itemId: string): Promise<void> {
  const user = await requireManagement()
  const item = await db.templateItem.findUnique({
    where: { id: itemId },
    include: { catalogItem: { select: { name: true } } },
  })
  if (!item || item.templateId !== templateId) return
  await db.templateItem.delete({ where: { id: itemId } })
  await audit({
    userId: user.id,
    action: 'templateItem.remove',
    entity: 'ProjectTemplate',
    entityId: templateId,
    oldValue: item.catalogItem.name,
  })
  revalidatePath(`/projects/templates/${templateId}`)
}
