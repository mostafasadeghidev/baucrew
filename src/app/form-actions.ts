'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { CurrentUser } from '@/lib/auth'
import { canViewFinancials, isOffice, requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { signatureBase64, type FormValues } from '@/lib/forms'
import { createFilledForm, deleteFilledForm, removeFormSignature, saveFormValues, signFilledForm, type FormError } from '@/lib/forms-db'

/**
 * Forms on a project, from the office and from the site alike: a protocol is
 * filled in and signed where the customer is, on whatever device is there.
 *
 * - Make, fill in, sign: the office on any project; the crew on the projects
 *   it works on — the site manager holds the tablet.
 * - Take a signature away, delete a form: the office only. A signed sheet is
 *   not something the site — crew or site manager — corrects by itself.
 * - A form that holds prices (a contract) only for those who may see money.
 */

export type FormActionResult = { error?: FormError | 'notAllowed'; id?: string; missing?: string[]; complete?: boolean }

/** The project a form is on — when this user may touch it at all: a form with prices only for those who may see money. */
async function projectOf(formId: string, user: CurrentUser): Promise<string | null | 'hidden'> {
  const form = await db.filledForm.findUnique({ where: { id: formId }, select: { projectId: true, financial: true } })
  if (!form) return null
  return form.financial && !canViewFinancials(user) ? 'hidden' : form.projectId
}

function refresh(projectId: string, formId?: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my')
  if (formId) revalidatePath(`/forms/${formId}`)
}

export async function addForm(projectId: string, templateId: string): Promise<FormActionResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const template = await db.formTemplate.findUnique({ where: { id: templateId }, select: { financial: true } })
  if (template?.financial && !canViewFinancials(user)) return { error: 'notAllowed' }
  const result = await createFilledForm({ projectId, templateId, userId: user.id })
  if ('error' in result) return { error: result.error }
  refresh(projectId)
  return { id: result.id }
}

export async function saveForm(formId: string, values: FormValues): Promise<FormActionResult> {
  const user = await requireUser()
  const projectId = await projectOf(formId, user)
  if (!projectId) return { error: 'notFound' }
  if (projectId === 'hidden' || !(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const result = await saveFormValues({ id: formId, values, userId: user.id })
  if ('error' in result) return { error: result.error, missing: result.missing }
  refresh(projectId, formId)
  return {}
}

export async function signForm(formId: string, slot: number, name: string, dataUrl: string): Promise<FormActionResult> {
  const user = await requireUser()
  const projectId = await projectOf(formId, user)
  if (!projectId) return { error: 'notFound' }
  if (projectId === 'hidden' || !(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const image = signatureBase64(dataUrl)
  if (!image) return { error: 'badSignature' }
  const result = await signFilledForm({
    id: formId,
    slot,
    name,
    image,
    userId: user.id,
    userAgent: (await headers()).get('user-agent'),
  })
  if ('error' in result) return { error: result.error, missing: result.missing }
  refresh(projectId, formId)
  return { complete: result.complete }
}

export async function unsignForm(formId: string, slot: number): Promise<FormActionResult> {
  const user = await requireUser()
  if (!isOffice(user) || (await projectOf(formId, user)) === 'hidden') return { error: 'notAllowed' }
  const result = await removeFormSignature({ id: formId, slot, userId: user.id })
  if ('error' in result) return { error: result.error }
  refresh(result.projectId, formId)
  return {}
}

export async function deleteForm(formId: string): Promise<FormActionResult> {
  const user = await requireUser()
  if (!isOffice(user) || (await projectOf(formId, user)) === 'hidden') return { error: 'notAllowed' }
  const result = await deleteFilledForm(formId, user.id)
  if ('error' in result) return { error: result.error }
  refresh(result.projectId)
  return {}
}
