// DB-backed: runs against the dev database (npm run test:db).
// A form made from a template, filled in, signed twice — and the sheet that
// then lies on the project as a PDF.
import 'dotenv/config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-forms-${Date.now()}`
// The smallest PNG there is: one transparent pixel.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
let userId = ''
let projectId = ''
let templateId = ''
const storedPaths: string[] = []

beforeAll(async () => {
  const user = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'ADMIN' } })
  userId = user.id
  const customer = await prisma.customer.create({ data: { name: `${TAG} Muster GmbH`, number: 'K-4711' } })
  const project = await prisma.project.create({
    data: { number: `${TAG}-1`, name: `${TAG} Musterhaus Fassade`, customerId: customer.id, street: 'Musterstraße 1', postalCode: '12345', city: 'Musterstadt' },
  })
  projectId = project.id
  await prisma.defect.create({ data: { projectId, title: 'Riss in der Decke', location: 'Bad OG', reportedById: userId } })
  const template = await prisma.formTemplate.create({
    data: {
      name: `${TAG} Abnahme`,
      fields: [
        { id: 'name', type: 'text', label: 'Bauvorhaben', prefill: 'projectName', required: true },
        { id: 'site', type: 'text', label: 'Baustelle', prefill: 'siteAddress' },
        { id: 'customerNo', type: 'text', label: 'Kundennummer', prefill: 'customerNumber' },
        { id: 'defects', type: 'longtext', label: 'Mängel', prefill: 'openDefects' },
        { id: 'result', type: 'choice', label: 'Ergebnis', options: ['ohne Mängel', 'mit Mängeln'], required: true },
      ],
      signers: ['Auftraggeber', 'Auftragnehmer'],
    },
  })
  templateId = template.id
})

afterAll(async () => {
  const { deleteStoredFile } = await import('@/lib/file-storage')
  for (const key of storedPaths) await deleteStoredFile(key).catch(() => {})
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.formTemplate.deleteMany({ where: { id: templateId } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('a form on a project', () => {
  it('starts with what the project knows, locks with the first signature and is filed with the last', async () => {
    const { createFilledForm, filledFormPdf, loadFilledForm, removeFormSignature, saveFormValues, signFilledForm } = await import('@/lib/forms-db')

    const made = await createFilledForm({ projectId, templateId, userId })
    if ('error' in made) throw new Error(made.error)
    const fresh = await loadFilledForm(made.id)
    expect(fresh?.values).toEqual({
      name: `${TAG} Musterhaus Fassade`,
      site: 'Musterstraße 1, 12345 Musterstadt',
      customerNo: 'K-4711',
      defects: '– Riss in der Decke (Bad OG)',
      result: '',
    })
    expect(fresh?.status).toBe('draft')

    // Not signed while something required is missing.
    const early = await signFilledForm({ id: made.id, slot: 0, name: 'Max Muster', image: PIXEL, userId, userAgent: 'vitest' })
    expect(early).toMatchObject({ error: 'incomplete', missing: ['Ergebnis'] })

    expect(await saveFormValues({ id: made.id, values: { ...fresh!.values, result: 'mit Mängeln', stranger: 'x' }, userId })).toEqual({ projectId })
    // A draft is a sheet too.
    const draft = await filledFormPdf(made.id, 'de')
    expect(Buffer.from(draft!.data).subarray(0, 5).toString()).toBe('%PDF-')

    const first = await signFilledForm({ id: made.id, slot: 0, name: ' Max Muster ', image: PIXEL, userId, userAgent: 'vitest' })
    expect(first).toEqual({ projectId, complete: false })
    expect(await signFilledForm({ id: made.id, slot: 0, name: 'Noch einer', image: PIXEL, userId, userAgent: null })).toMatchObject({ error: 'alreadySigned' })
    expect(await signFilledForm({ id: made.id, slot: 5, name: 'Niemand', image: PIXEL, userId, userAgent: null })).toMatchObject({ error: 'badSlot' })
    // A signature stands for what was on the sheet.
    expect(await saveFormValues({ id: made.id, values: { result: 'ohne Mängel' }, userId })).toEqual({ error: 'locked' })

    const second = await signFilledForm({ id: made.id, slot: 1, name: 'Erika Beispiel', image: PIXEL, userId, userAgent: 'vitest' })
    expect(second).toEqual({ projectId, complete: true })

    const signed = await loadFilledForm(made.id)
    expect(signed?.status).toBe('signed')
    expect(signed?.intact).toBe(true)
    expect(signed?.signatures.map((s) => [s.slot, s.role, s.name])).toEqual([
      [0, 'Auftraggeber', 'Max Muster'],
      [1, 'Auftragnehmer', 'Erika Beispiel'],
    ])
    const filed = await prisma.document.findUnique({ where: { id: signed!.documentId! } })
    expect(filed).toMatchObject({ projectId, mimeType: 'application/pdf', source: 'form', visibleToCrew: false })
    storedPaths.push(filed!.path)
    expect(existsSync(path.join(process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage'), filed!.path))).toBe(true)

    // Content changed behind the signatures' back shows.
    await prisma.filledForm.update({ where: { id: made.id }, data: { values: { ...signed!.values, result: 'ohne Mängel' } } })
    expect((await loadFilledForm(made.id))?.intact).toBe(false)

    // The office takes a signature away: the form opens again, the filed sheet goes.
    expect(await removeFormSignature({ id: made.id, slot: 1, userId })).toEqual({ projectId })
    const reopened = await loadFilledForm(made.id)
    expect(reopened?.status).toBe('partly')
    expect(reopened?.documentId).toBeNull()
    expect(await prisma.document.count({ where: { id: filed!.id } })).toBe(0)
  })
})
