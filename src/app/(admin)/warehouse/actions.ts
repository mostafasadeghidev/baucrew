'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { ItemKind } from '@/generated/prisma/enums'

const optional = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v ? v : null))

const optionalNumber = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    const num = Number(v.replace(',', '.'))
    if (!Number.isFinite(num) || num < 0 || num > 999_999_999) {
      ctx.addIssue({ code: 'custom' })
      return z.NEVER
    }
    return num
  })

const itemSchema = z.object({
  kind: z.enum(ItemKind),
  name: z.string().trim().min(1).max(200),
  category: optional,
  unit: optional,
  stockQuantity: optionalNumber,
  minStock: optionalNumber,
  location: optional,
  active: z.string().transform((v) => v === 'on'),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v ? v : null)),
})

export type ItemFormState = { error?: 'nameRequired' | 'saveFailed' }

function parseItemForm(formData: FormData) {
  return itemSchema.safeParse({
    kind: formData.get('kind') ?? 'TOOL',
    name: formData.get('name') ?? '',
    category: formData.get('category') ?? '',
    unit: formData.get('unit') ?? '',
    stockQuantity: formData.get('stockQuantity') ?? '',
    minStock: formData.get('minStock') ?? '',
    location: formData.get('location') ?? '',
    active: formData.get('active') ?? '',
    notes: formData.get('notes') ?? '',
  })
}

function errorKey(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>
): NonNullable<ItemFormState['error']> {
  return issues.some((i) => i.path[0] === 'name') ? 'nameRequired' : 'saveFailed'
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const user = await requireManagement()
  const parsed = parseItemForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const item = await db.catalogItem.create({ data: parsed.data })
  await audit({
    userId: user.id,
    action: 'catalogItem.create',
    entity: 'CatalogItem',
    entityId: item.id,
    newValue: item.name,
  })
  revalidatePath('/warehouse')
  redirect('/warehouse')
}

export async function updateItem(
  id: string,
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const user = await requireManagement()
  const parsed = parseItemForm(formData)
  if (!parsed.success) return { error: errorKey(parsed.error.issues) }
  const before = await db.catalogItem.findUnique({ where: { id } })
  if (!before) return { error: 'saveFailed' }
  await db.catalogItem.update({ where: { id }, data: parsed.data })
  await audit({
    userId: user.id,
    action: 'catalogItem.update',
    entity: 'CatalogItem',
    entityId: id,
    oldValue: before.name,
    newValue: parsed.data.name,
  })
  revalidatePath('/warehouse')
  redirect('/warehouse')
}

export type DeleteState = { error?: string }

export async function deleteItem(
  id: string,
  _prev: DeleteState,
  _formData: FormData
): Promise<DeleteState> {
  const user = await requireManagement()
  const [projectUse, templateUse] = await Promise.all([
    db.projectItem.count({ where: { catalogItemId: id } }),
    db.templateItem.count({ where: { catalogItemId: id } }),
  ])
  if (projectUse > 0 || templateUse > 0) return { error: 'cannotDeleteInUse' }
  const item = await db.catalogItem.delete({ where: { id } })
  await audit({
    userId: user.id,
    action: 'catalogItem.delete',
    entity: 'CatalogItem',
    entityId: id,
    oldValue: item.name,
  })
  revalidatePath('/warehouse')
  redirect('/warehouse')
}

// ── Categories (free text on items; managed as a set of distinct values) ──

export type CategoryState = { error?: 'nameRequired' | 'saveFailed'; savedAt?: number }

/** Distinct, non-empty categories currently used by catalog items (sorted). */
export async function listCategories(): Promise<Array<{ name: string; count: number }>> {
  const rows = await db.catalogItem.groupBy({
    by: ['category'],
    where: { category: { not: null } },
    _count: { _all: true },
  })
  return rows
    .filter((r): r is typeof r & { category: string } => !!r.category && r.category.trim().length > 0)
    .map((r) => ({ name: r.category, count: r._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function renameCategory(
  from: string,
  _prev: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  const user = await requireManagement()
  const to = String(formData.get('name') ?? '').trim().slice(0, 100)
  if (!to) return { error: 'nameRequired' }
  if (to === from) return { savedAt: Date.now() }
  const res = await db.catalogItem.updateMany({ where: { category: from }, data: { category: to } })
  await audit({
    userId: user.id,
    action: 'catalogCategory.rename',
    entity: 'CatalogItem',
    entityId: from,
    oldValue: from,
    newValue: `${to} (${res.count})`,
  })
  revalidatePath('/warehouse')
  return { savedAt: Date.now() }
}

export async function removeCategory(name: string, _prev: { error?: string }, _formData: FormData): Promise<{ error?: string }> {
  const user = await requireManagement()
  const res = await db.catalogItem.updateMany({ where: { category: name }, data: { category: null } })
  await audit({
    userId: user.id,
    action: 'catalogCategory.remove',
    entity: 'CatalogItem',
    entityId: name,
    oldValue: `${name} (${res.count})`,
  })
  revalidatePath('/warehouse')
  return {}
}

// ── Quick create from a project/assignment item picker ───────

export type QuickItemResult = { id?: string; label?: string; error?: 'nameRequired' | 'saveFailed' }

/**
 * Creates a catalog entry straight from an item picker (project page,
 * assignment dialog, new project/template) so the user does not have to leave
 * the form. Only name, kind and unit — the rest is filled in the warehouse.
 */
export async function quickCreateCatalogItem(input: {
  name: string
  kind: string
  unit?: string
}): Promise<QuickItemResult> {
  const user = await requireManagement()
  const name = input.name.trim().slice(0, 200)
  const unit = (input.unit ?? '').trim().slice(0, 300) || null
  if (!name) return { error: 'nameRequired' }
  const kind = input.kind === 'TOOL' ? ItemKind.TOOL : ItemKind.MATERIAL
  try {
    const item = await db.catalogItem.create({ data: { name, kind, unit } })
    await audit({
      userId: user.id,
      action: 'catalogItem.create',
      entity: 'CatalogItem',
      entityId: item.id,
      newValue: `${item.name} (${kind})`,
    })
    revalidatePath('/warehouse')
    return { id: item.id, label: unit ? `${name} (${unit})` : name }
  } catch {
    return { error: 'saveFailed' }
  }
}
