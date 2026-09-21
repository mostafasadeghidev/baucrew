import 'server-only'
import { createHash, randomUUID } from 'crypto'
import { db } from './db'
import { audit } from './audit'
import { getBranding } from './branding'
import { iso, todayUtc } from './dates'
import { safeFileName, storageKeyFor } from './files'
import { deleteStoredFile, saveStoredFile } from './file-storage'
import {
  cleanValues,
  formStatus,
  missingRequired,
  parseFields,
  parseSigners,
  prefillValues,
  signedContent,
  type FormField,
  type FormValues,
  type PrefillContext,
} from './forms'
import { renderFormPdf } from './forms-pdf'

export type FormError = 'notFound' | 'locked' | 'incomplete' | 'alreadySigned' | 'badSlot' | 'nameRequired' | 'badSignature'

/** SHA-256 of what a signature signs. */
export function formDigest(title: string, fields: FormField[], values: FormValues, signers: string[]): string {
  return createHash('sha256').update(signedContent(title, fields, values, signers), 'utf8').digest('hex')
}

/** What the project knows, in words, for the fields that ask for it. */
async function prefillContext(projectId: string): Promise<PrefillContext | null> {
  const [project, branding] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        number: true,
        name: true,
        street: true,
        postalCode: true,
        city: true,
        customer: { select: { name: true, number: true } },
        manager: { select: { firstName: true, lastName: true } },
        workCategories: { select: { workCategory: { select: { nameDe: true } } }, orderBy: { workCategory: { sortOrder: 'asc' } } },
        defects: { where: { resolvedAt: null }, orderBy: { createdAt: 'asc' }, select: { title: true, location: true } },
      },
    }),
    getBranding(),
  ])
  if (!project) return null
  const town = [project.postalCode, project.city].filter(Boolean).join(' ')
  return {
    projectNumber: project.number,
    projectName: project.name,
    customerName: project.customer.name,
    customerNumber: project.customer.number ?? '',
    siteAddress: [project.street, town].filter(Boolean).join(', '),
    manager: project.manager ? `${project.manager.firstName} ${project.manager.lastName}`.trim() : '',
    workTypes: project.workCategories.map((wc) => wc.workCategory.nameDe).join(', '),
    today: iso(todayUtc()),
    openDefects: project.defects.map((d) => `– ${d.title}${d.location ? ` (${d.location})` : ''}`).join('\n'),
    companyName: branding.companyName,
  }
}

/** A new form on a project, from a template, with what the project knows put in. */
export async function createFilledForm(input: {
  projectId: string
  templateId: string
  userId: string
}): Promise<{ id: string } | { error: 'notFound' }> {
  const template = await db.formTemplate.findFirst({ where: { id: input.templateId, active: true } })
  const context = await prefillContext(input.projectId)
  if (!template || !context) return { error: 'notFound' }
  const fields = parseFields(template.fields)
  const form = await db.filledForm.create({
    data: {
      projectId: input.projectId,
      templateId: template.id,
      title: template.name,
      fields,
      signers: parseSigners(template.signers),
      values: prefillValues(fields, context),
      createdById: input.userId,
    },
    select: { id: true },
  })
  await audit({ userId: input.userId, action: 'project.form.create', entity: 'Project', entityId: input.projectId, newValue: template.name })
  return { id: form.id }
}

const formSelect = {
  id: true,
  projectId: true,
  title: true,
  fields: true,
  signers: true,
  values: true,
  documentId: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { number: true, name: true } },
  signatures: { orderBy: { slot: 'asc' }, select: { slot: true, role: true, name: true, image: true, digest: true, signedAt: true } },
} as const

/** A form as the pages and the PDF read it: its JSON put through the rules, and whether it still fits its signatures. */
export async function loadFilledForm(id: string) {
  const row = await db.filledForm.findUnique({ where: { id }, select: formSelect })
  if (!row) return null
  const fields = parseFields(row.fields)
  const signers = parseSigners(row.signers)
  const values = cleanValues(fields, row.values)
  const digest = formDigest(row.title, fields, values, signers)
  return {
    ...row,
    fields,
    signers,
    values,
    digest,
    status: formStatus(signers, row.signatures.map((s) => s.slot)),
    /** False when the content was changed behind a signature's back — it cannot be through the app. */
    intact: row.signatures.every((s) => s.digest === digest),
  }
}

export type LoadedForm = NonNullable<Awaited<ReturnType<typeof loadFilledForm>>>

/** The fields' values, saved. Not once somebody has signed: a signature stands for what was on the sheet. */
export async function saveFormValues(input: { id: string; values: unknown; userId: string }): Promise<{ projectId: string } | { error: FormError }> {
  const form = await loadFilledForm(input.id)
  if (!form) return { error: 'notFound' }
  if (form.signatures.length > 0) return { error: 'locked' }
  await db.filledForm.update({ where: { id: form.id }, data: { values: cleanValues(form.fields, input.values) } })
  return { projectId: form.projectId }
}

/**
 * One signature. The form has to be complete, the place free, the name typed
 * and the drawing a PNG. With the last one the sheet is drawn and kept on the
 * project as a PDF.
 */
export async function signFilledForm(input: {
  id: string
  slot: number
  name: string
  /** The drawing: a PNG, base64. */
  image: string
  userId: string
  userAgent: string | null
}): Promise<{ projectId: string; complete: boolean } | { error: FormError; missing?: string[] }> {
  const form = await loadFilledForm(input.id)
  if (!form) return { error: 'notFound' }
  if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot >= form.signers.length) return { error: 'badSlot' }
  if (form.signatures.some((s) => s.slot === input.slot)) return { error: 'alreadySigned' }
  const name = input.name.trim().slice(0, 120)
  if (!name) return { error: 'nameRequired' }
  if (!input.image) return { error: 'badSignature' }
  const missing = missingRequired(form.fields, form.values)
  if (missing.length > 0) return { error: 'incomplete', missing: missing.map((f) => f.label) }

  await db.formSignature.create({
    data: {
      formId: form.id,
      slot: input.slot,
      role: form.signers[input.slot],
      name,
      image: input.image,
      digest: form.digest,
      takenById: input.userId,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  })
  await audit({
    userId: input.userId,
    action: 'project.form.sign',
    entity: 'Project',
    entityId: form.projectId,
    newValue: `${form.title} — ${form.signers[input.slot]}: ${name}`,
  })
  const complete = form.signatures.length + 1 >= form.signers.length
  if (complete) await storeSignedPdf(form.id, input.userId)
  return { projectId: form.projectId, complete }
}

/** Takes a signature away — the form can be corrected and signed again. The PDF that showed it goes with it. */
export async function removeFormSignature(input: { id: string; slot: number; userId: string }): Promise<{ projectId: string } | { error: FormError }> {
  const form = await loadFilledForm(input.id)
  if (!form) return { error: 'notFound' }
  const signature = form.signatures.find((s) => s.slot === input.slot)
  if (!signature) return { error: 'badSlot' }
  await db.formSignature.delete({ where: { formId_slot: { formId: form.id, slot: input.slot } } })
  await dropStoredPdf(form.id)
  await audit({
    userId: input.userId,
    action: 'project.form.unsign',
    entity: 'Project',
    entityId: form.projectId,
    oldValue: `${form.title} — ${signature.role}: ${signature.name}`,
  })
  return { projectId: form.projectId }
}

export async function deleteFilledForm(id: string, userId: string): Promise<{ projectId: string } | { error: FormError }> {
  const form = await db.filledForm.findUnique({ where: { id }, select: { id: true, projectId: true, title: true } })
  if (!form) return { error: 'notFound' }
  // The signed sheet is a file of the project by now; it stays there.
  await db.filledForm.delete({ where: { id } })
  await audit({ userId, action: 'project.form.delete', entity: 'Project', entityId: form.projectId, oldValue: form.title })
  return { projectId: form.projectId }
}

/** The sheet of a form, as it stands — a draft as much as a signed one. */
export async function filledFormPdf(id: string, locale: string): Promise<{ filename: string; data: Uint8Array } | null> {
  const form = await loadFilledForm(id)
  if (!form) return null
  const [branding, logo] = await Promise.all([getBranding(), db.appSetting.findUnique({ where: { key: 'logo' } })])
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const dayFmt = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
  const stampFmt = new Intl.DateTimeFormat(intl, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' })
  const en = locale === 'en'
  const data = await renderFormPdf({
    title: form.title,
    projectLine: `${form.project.number} — ${form.project.name}`,
    companyName: branding.companyName,
    logo: logo?.value ?? null,
    fields: form.fields,
    values: form.values,
    signers: form.signers,
    signatures: form.signatures,
    digest: form.digest,
    words: en
      ? { yes: 'Yes', no: 'No', signedOn: 'signed', notSigned: 'not signed yet', checksum: 'Document checksum (SHA-256)', page: 'Page', draft: 'DRAFT — not signed' }
      : { yes: 'Ja', no: 'Nein', signedOn: 'unterschrieben am', notSigned: 'noch nicht unterschrieben', checksum: 'Dokument-Prüfsumme (SHA-256)', page: 'Seite', draft: 'ENTWURF — nicht unterschrieben' },
    formatDay: (day) => dayFmt.format(new Date(`${day}T00:00:00Z`)),
    formatStamp: (date) => stampFmt.format(date),
  })
  return { filename: safeFileName(`${form.title} ${form.project.number}.pdf`), data }
}

/** The signed sheet, kept on the project as a file the office can see, send and print. */
async function storeSignedPdf(formId: string, userId: string): Promise<void> {
  const sheet = await filledFormPdf(formId, 'de')
  const form = await db.filledForm.findUnique({ where: { id: formId }, select: { projectId: true } })
  if (!sheet || !form) return
  await dropStoredPdf(formId)
  const key = storageKeyFor(form.projectId, randomUUID(), sheet.filename)
  await saveStoredFile(key, Buffer.from(sheet.data))
  const doc = await db.document.create({
    data: {
      projectId: form.projectId,
      filename: sheet.filename,
      mimeType: 'application/pdf',
      size: sheet.data.byteLength,
      path: key,
      source: 'form',
      uploadedById: userId,
    },
    select: { id: true },
  })
  await db.filledForm.update({ where: { id: formId }, data: { documentId: doc.id } })
}

async function dropStoredPdf(formId: string): Promise<void> {
  const form = await db.filledForm.findUnique({ where: { id: formId }, select: { document: { select: { id: true, path: true } } } })
  if (!form?.document) return
  await db.document.delete({ where: { id: form.document.id } })
  await deleteStoredFile(form.document.path).catch(() => {})
}
