'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { isOffice, requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { signatureBase64 } from '@/lib/forms'
import { createFilledForm, deleteFilledForm, removeFormSignature, saveFormValues, signFilledForm, type FormError } from '@/lib/forms-db'

/**
 * Forms on a project, from the office and from the site alike: a protocol is
 * filled in and signed where the customer is, on whatever device is there.
 *
 * - Make, fill in, sign: the office on any project; the crew on the projects
 *   it works on — the site manager holds the tablet.
 * - Take a signature away, delete a form: the office only. A signed sheet is
 *   not something the site — crew or site manager — corrects by itself.
 */

export type FormActionResult = { error?: FormError | 'notAllowed'; id?: string; missing?: string[]; complete?: boolean }

async function projectOf(formId: string): Promise<string | null> {
  return (await db.filledForm.findUnique({ where: { id: formId }, select: { projectId: true } }))?.projectId ?? null
}

function refresh(projectId: string, formId?: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my')
  if (formId) revalidatePath(`/forms/${formId}`)
}

export async function addForm(projectId: string, templateId: string): Promise<FormActionResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const result = await createFilledForm({ projectId, templateId, userId: user.id })
  if ('error' in result) return { error: result.error }
  refresh(projectId)
  return { id: result.id }
}

export async function saveForm(formId: string, values: Record<string, string | boolean>): Promise<FormActionResult> {
  const user = await requireUser()
  const projectId = await projectOf(formId)
  if (!projectId) return { error: 'notFound' }
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const result = await saveFormValues({ id: formId, values, userId: user.id })
  if ('error' in result) return { error: result.error }
  refresh(projectId, formId)
  return {}
}

export async function signForm(formId: string, slot: number, name: string, dataUrl: string): Promise<FormActionResult> {
  const user = await requireUser()
  const projectId = await projectOf(formId)
  if (!projectId) return { error: 'notFound' }
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
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
  if (!isOffice(user)) return { error: 'notAllowed' }
  const result = await removeFormSignature({ id: formId, slot, userId: user.id })
  if ('error' in result) return { error: result.error }
  refresh(result.projectId, formId)
  return {}
}

export async function deleteForm(formId: string): Promise<FormActionResult> {
  const user = await requireUser()
  if (!isOffice(user)) return { error: 'notAllowed' }
  const result = await deleteFilledForm(formId, user.id)
  if ('error' in result) return { error: result.error }
  refresh(result.projectId)
  return {}
}
