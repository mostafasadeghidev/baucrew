'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { FORM_NAME_MAX, parseFields, parseSigners } from '@/lib/forms'
import { TEMPLATE_FILE_MAX_BYTES, readTemplateFile } from '@/lib/form-template-file'
import type { SaveState } from '@/components/saved-form'

/** What the editor sends: a name, the fields as JSON, the signers one per line. */
function templateFrom(formData: FormData) {
  let sent: unknown = []
  try {
    sent = JSON.parse(String(formData.get('fields') ?? '[]'))
  } catch {
    sent = []
  }
  return {
    name: String(formData.get('name') ?? '').trim().slice(0, FORM_NAME_MAX),
    description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
    active: formData.get('active') === 'on',
    financial: formData.get('financial') === 'on',
    fields: parseFields(sent),
    signers: parseSigners(String(formData.get('signers') ?? '').split('\n')),
  }
}

export async function createFormTemplate(formData: FormData): Promise<SaveState> {
  const user = await requireManagement()
  const data = templateFrom(formData)
  if (!data.name) return { error: 'nameRequired' }
  if (data.fields.length === 0) return { error: 'fieldsRequired' }
  const template = await db.formTemplate.create({ data })
  await audit({ userId: user.id, action: 'formTemplate.create', entity: 'System', entityId: template.id, newValue: `${data.name} (${data.fields.length})` })
  revalidatePath('/projects/forms')
  redirect('/projects/forms')
}

/**
 * Changes the template. Forms already made from it keep the fields they were
 * made with — each carries its own copy.
 */
export async function updateFormTemplate(id: string, formData: FormData): Promise<SaveState> {
  const user = await requireManagement()
  const data = templateFrom(formData)
  if (!data.name) return { error: 'nameRequired' }
  if (data.fields.length === 0) return { error: 'fieldsRequired' }
  const before = await db.formTemplate.findUnique({ where: { id }, select: { name: true } })
  if (!before) return { error: 'saveFailed' }
  await db.formTemplate.update({ where: { id }, data })
  await audit({ userId: user.id, action: 'formTemplate.update', entity: 'System', entityId: id, oldValue: before.name, newValue: `${data.name} (${data.fields.length})` })
  revalidatePath('/projects/forms')
  revalidatePath(`/projects/forms/${id}`)
  return { savedAt: Date.now() }
}

/** Takes the template away. The forms made from it stay as they are. */
export async function deleteFormTemplate(id: string, _prev: { error?: string }, _formData: FormData): Promise<{ error?: string }> {
  const user = await requireManagement()
  const template = await db.formTemplate.findUnique({ where: { id }, select: { name: true } })
  if (!template) return { error: 'saveFailed' }
  await db.formTemplate.delete({ where: { id } })
  await audit({ userId: user.id, action: 'formTemplate.delete', entity: 'System', entityId: id, oldValue: template.name })
  revalidatePath('/projects/forms')
  redirect('/projects/forms')
}

export type ImportState = { error?: string; created?: number; updated?: number; skipped?: string[] }

/**
 * Templates from a file (src/lib/form-template-file.ts). A template whose name
 * is already taken is left as it is, unless the office says to replace it —
 * then its fields, signers and description are the file's. Forms already made
 * from it keep their own copy either way.
 */
export async function importFormTemplates(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireManagement()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'noFile' }
  if (file.size > TEMPLATE_FILE_MAX_BYTES) return { error: 'notAFile' }
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    return { error: 'notAFile' }
  }
  const read = readTemplateFile(raw)
  if ('error' in read) return { error: read.error }
  const replace = formData.get('replace') === 'on'
  const skipped = [...read.skipped]
  let created = 0
  let updated = 0
  const last = await db.formTemplate.aggregate({ _max: { sortOrder: true } })
  let sortOrder = (last._max.sortOrder ?? 0) + 1
  for (const entry of read.templates) {
    const existing = await db.formTemplate.findFirst({ where: { name: entry.name }, select: { id: true } })
    const data = { name: entry.name, description: entry.description, fields: entry.fields, signers: entry.signers, financial: entry.financial }
    if (existing && !replace) {
      skipped.push(entry.name)
      continue
    }
    if (existing) {
      await db.formTemplate.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await db.formTemplate.create({ data: { ...data, sortOrder: sortOrder++ } })
      created++
    }
  }
  await audit({
    userId: user.id,
    action: 'formTemplate.import',
    entity: 'System',
    entityId: 'formTemplates',
    newValue: `${file.name}: created ${created}, replaced ${updated}, skipped ${skipped.length}`,
  })
  revalidatePath('/projects/forms')
  return { created, updated, skipped }
}
