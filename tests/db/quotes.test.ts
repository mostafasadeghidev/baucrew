// DB-backed: runs against the database in DATABASE_URL (npm run test:db) — a
// throwaway one, never real data. Quotes read from a project's PDFs
// (src/lib/quotes-db.ts): the price and the Projektnummer filled only while
// empty, never over what somebody typed, the same file twice counted once,
// a second run changing nothing — and the amounts and the quote files kept
// from those who may not see money. The PDFs are made here, with invented
// "Muster" texts.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const who = vi.hoisted(() => ({ user: null as unknown }))
const files = vi.hoisted(() => new Map<string, Uint8Array>())
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => who.user }))
vi.mock('@/lib/file-storage', () => ({
  readStoredFile: async (key: string) => Buffer.from(files.get(key) ?? new Uint8Array()),
  saveStoredFile: async () => {},
  deleteStoredFile: async () => {},
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`)
  },
}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const TAG = `vitest-quotes-${Date.now()}`
const users: Record<'admin' | 'manager' | 'site' | 'crew', { id: string; role: string; canViewFinancials: boolean }> = {} as never
let customerId = ''

/** A one-page PDF of the accounting program's quote, with the gaps the reader looks for. */
async function quotePdf(o: { type?: string; no: string; job: string; net: string; vat: string; gross: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  const row = (y: number, ...cells: [number, string][]) => cells.forEach(([x, text]) => page.drawText(text, { x, y, size: 10, font }))
  row(800, [50, 'Muster Malerbetrieb GmbH, Beispielweg 1, 12345 Musterstadt'])
  row(700, [50, o.type ?? 'Angebot'], [200, o.no], [300, 'Datum'], [380, '24.03.2026'])
  row(685, [50, 'Baustellennr.'], [200, o.job])
  row(600, [50, 'Fassade streichen, Musterhaus'])
  row(300, [200, 'Netto/EUR'], [280, 'Steuer/EUR'], [420, 'Brutto/EUR'])
  row(285, [50, 'Gesamtbetrag'], [200, o.net], [280, o.vat], [360, '19,00%'], [420, o.gross])
  return pdf.save()
}

async function project(extra: Record<string, unknown> = {}) {
  return (
    await prisma.project.create({
      data: { number: `${TAG}-${Math.random().toString(36).slice(2, 8)}`, name: `${TAG} Musterhaus`, customerId, ...extra },
      select: { id: true },
    })
  ).id
}

async function document(projectId: string, data: Uint8Array, extra: Record<string, unknown> = {}) {
  const path = `${projectId}/${Math.random().toString(36).slice(2)}-angebot.pdf`
  files.set(path, data)
  return (
    await prisma.document.create({
      data: { projectId, filename: 'Muster-Angebot.pdf', mimeType: 'application/octet-stream', size: data.length, path, source: 'trello', ...extra },
      select: { id: true },
    })
  ).id
}

async function read(documentId: string) {
  const { readDocumentQuote } = await import('@/lib/quotes-db')
  return readDocumentQuote(documentId, { db: prisma as never, readFile: async (key) => files.get(key)!, userId: users.admin.id })
}

const job = (n: number) => `9${String(Date.now()).slice(-6)}${n}`

beforeAll(async () => {
  for (const [key, role, money] of [
    ['admin', 'ADMIN', true],
    ['manager', 'MANAGER', false],
    ['site', 'SITE_MANAGER', false],
    ['crew', 'EMPLOYEE', false],
  ] as const) {
    const u = await prisma.user.create({ data: { username: `${TAG}-${key}`, passwordHash: 'x', role, canViewFinancials: money } })
    users[key] = { id: u.id, role, canViewFinancials: money }
  }
  customerId = (await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })).id
})

afterAll(async () => {
  const projects = await prisma.project.findMany({ where: { customerId }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { entityId: { in: projects.map((p) => p.id) } } })
  await prisma.project.deleteMany({ where: { customerId } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } })
  await prisma.$disconnect()
})

describe('a quote read from a project’s PDF', () => {
  it('fills an empty price with its net and an empty Projektnummer with its Vorgangsnummer, marked as recognised', async () => {
    const id = await project()
    const number = job(1)
    const doc = await document(id, await quotePdf({ no: '1269001', job: number, net: '2.700,00', vat: '513,00', gross: '3.213,00' }), { visibleToCrew: true })
    const result = await read(doc)
    expect(result).toMatchObject({ kind: 'QUOTE', read: true, applied: { priceChanged: true, jobNumberFilled: true } })

    const row = await prisma.documentQuote.findUniqueOrThrow({ where: { documentId: doc } })
    expect(row).toMatchObject({ kind: 'QUOTE', quoteNumber: '1269001', jobNumber: number, inTotal: true })
    expect(Number(row.net)).toBe(2700)
    expect(Number(row.gross)).toBe(3213)
    const p = await prisma.project.findUniqueOrThrow({ where: { id } })
    expect(Number(p.price)).toBe(2700)
    expect(Number(p.priceFromQuote)).toBe(2700)
    expect(p.jobNumber).toBe(number)
    expect(p.jobNumberFromQuote).toBe(number)
    // A quote is never on the crew's screens, whatever was ticked.
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc } })).visibleToCrew).toBe(false)
    const actions = (await prisma.auditLog.findMany({ where: { entityId: id } })).map((a) => a.action).sort()
    expect(actions).toEqual(['project.jobNumber', 'project.quote.price', 'project.quote.read'])

    // A second quote: the price follows the total while it is still the quotes' figure.
    await read(await document(id, await quotePdf({ no: '1269002', job: number, net: '1.000,00', vat: '190,00', gross: '1.190,00' })))
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(3700)

    // The same quote again (the file twice): out of the total, the price as it was.
    await read(await document(id, await quotePdf({ no: '1269002', job: number, net: '1.000,00', vat: '190,00', gross: '1.190,00' })))
    const twin = await prisma.documentQuote.findMany({ where: { quoteNumber: '1269002', document: { projectId: id } }, orderBy: { createdAt: 'asc' } })
    expect(twin.map((t) => [t.inTotal, t.excludedReason])).toEqual([
      [true, null],
      [false, 'duplicate'],
    ])
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(3700)
  })

  it('changes nothing when it runs again', async () => {
    const id = await project()
    const doc = await document(id, await quotePdf({ no: '1269010', job: job(2), net: '500,00', vat: '95,00', gross: '595,00' }))
    await read(doc)
    const audits = await prisma.auditLog.count({ where: { entityId: id } })
    const again = await read(doc)
    expect(again).toMatchObject({ kind: 'QUOTE', read: false })
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(audits)
    expect(await prisma.documentQuote.count({ where: { documentId: doc } })).toBe(1)
  })

  it('never overwrites a price or a Projektnummer somebody typed — and says where the numbers differ', async () => {
    const own = job(3)
    const id = await project({ price: 5000, jobNumber: own })
    await read(await document(id, await quotePdf({ no: '1269020', job: job(4), net: '2.700,00', vat: '513,00', gross: '3.213,00' })))
    const p = await prisma.project.findUniqueOrThrow({ where: { id } })
    expect(Number(p.price)).toBe(5000)
    expect(p.priceFromQuote).toBeNull()
    expect(p.jobNumber).toBe(own)
    expect(p.jobNumberFromQuote).toBeNull()
    const { jobNumberDiffers } = await import('@/lib/quotes')
    const row = await prisma.documentQuote.findFirstOrThrow({ where: { document: { projectId: id } } })
    expect(jobNumberDiffers(p.jobNumber, row.jobNumber)).toBe(true)
  })

  it('stops following the quotes once the price is typed or confirmed', async () => {
    const id = await project()
    const number = job(5)
    await read(await document(id, await quotePdf({ no: '1269030', job: number, net: '1.000,00', vat: '190,00', gross: '1.190,00' })))
    await prisma.project.update({ where: { id }, data: { price: 1234 } })
    await read(await document(id, await quotePdf({ no: '1269031', job: number, net: '2.000,00', vat: '380,00', gross: '2.380,00' })))
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(1234)

    const confirmed = await project()
    await read(await document(confirmed, await quotePdf({ no: '1269032', job: job(6), net: '1.000,00', vat: '190,00', gross: '1.190,00' })))
    who.user = users.admin
    const { confirmQuotePrice } = await import('@/app/(admin)/projects/[id]/quote-actions')
    expect(await confirmQuotePrice(confirmed)).toEqual({})
    expect((await prisma.project.findUniqueOrThrow({ where: { id: confirmed } })).priceFromQuote).toBeNull()
  })

  it('keeps the uniqueness of the Projektnummer: a number another project holds is not taken', async () => {
    const number = job(7)
    await project({ jobNumber: number })
    const id = await project()
    const result = await read(await document(id, await quotePdf({ no: '1269040', job: number, net: '100,00', vat: '19,00', gross: '119,00' })))
    expect(result?.applied).toMatchObject({ jobNumberFilled: false, jobNumberTaken: true })
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).jobNumber).toBeNull()
  })

  it('gives a project whose quotes carry different Vorgangsnummern none, read in any order (the backfill)', async () => {
    const id = await project()
    const { readDocumentQuote, applyQuotesToProject } = await import('@/lib/quotes-db')
    for (const [no, n] of [['1269070', 10], ['1269071', 11]] as const) {
      const doc = await document(id, await quotePdf({ no, job: job(n), net: '100,00', vat: '19,00', gross: '119,00' }))
      await readDocumentQuote(doc, { db: prisma as never, readFile: async (key) => files.get(key)!, userId: null, deferProject: true })
    }
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).price).toBeNull()
    const applied = await applyQuotesToProject(prisma as never, id, null)
    expect(applied).toMatchObject({ priceChanged: true, jobNumberFilled: false })
    const p = await prisma.project.findUniqueOrThrow({ where: { id } })
    expect(Number(p.price)).toBe(200)
    expect(p.jobNumber).toBeNull()
  })

  it('lets the office leave a quote out of the total, and the price follows', async () => {
    const id = await project()
    const number = job(8)
    await read(await document(id, await quotePdf({ no: '1269050', job: number, net: '1.000,00', vat: '190,00', gross: '1.190,00' })))
    const alt = await document(id, await quotePdf({ no: '1269051', job: number, net: '3.000,00', vat: '570,00', gross: '3.570,00' }))
    await read(alt)
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(4000)
    who.user = users.admin
    const { setQuoteInTotal } = await import('@/app/(admin)/projects/[id]/quote-actions')
    const row = await prisma.documentQuote.findUniqueOrThrow({ where: { documentId: alt } })
    expect(await setQuoteInTotal(row.id, false)).toEqual({})
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(1000)
  })

  it('leaves a supplement out of the total and the price until the office ticks it in', async () => {
    const id = await project()
    const number = job(12)
    await read(await document(id, await quotePdf({ no: '1269070', job: number, net: '2.700,00', vat: '513,00', gross: '3.213,00' })))
    const supplement = await document(id, await quotePdf({ type: 'Angebot Nachtrag NA 1', no: '1269071', job: number, net: '1.000,00', vat: '190,00', gross: '1.190,00' }))
    await read(supplement)
    const row = await prisma.documentQuote.findUniqueOrThrow({ where: { documentId: supplement } })
    expect(row).toMatchObject({ kind: 'QUOTE', docType: 'Angebot Nachtrag NA 1', inTotal: false, excludedReason: 'supplement' })
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(2700)

    who.user = users.admin
    const { setQuoteInTotal } = await import('@/app/(admin)/projects/[id]/quote-actions')
    expect(await setQuoteInTotal(row.id, true)).toEqual({})
    expect(Number((await prisma.project.findUniqueOrThrow({ where: { id } })).price)).toBe(3700)
    // Read again (as a newer reader would), it keeps what the office decided.
    const { readDocumentQuote } = await import('@/lib/quotes-db')
    expect(await readDocumentQuote(supplement, { db: prisma as never, readFile: async (key) => files.get(key)!, userId: users.admin.id, force: true })).toMatchObject({ read: true })
    expect((await prisma.documentQuote.findUniqueOrThrow({ where: { documentId: supplement } })).inTotal).toBe(true)
  })
})

describe('who sees quotes', () => {
  let projectId = ''
  let doc = ''
  let quoteId = ''

  beforeAll(async () => {
    projectId = await project()
    doc = await document(projectId, await quotePdf({ no: '1269060', job: job(9), net: '2.700,00', vat: '513,00', gross: '3.213,00' }))
    await read(doc)
    quoteId = (await prisma.documentQuote.findUniqueOrThrow({ where: { documentId: doc } })).id
    // Even when somebody ticked it for the crew afterwards.
    await prisma.document.update({ where: { id: doc }, data: { visibleToCrew: true } })
  })

  async function download(as: keyof typeof users) {
    who.user = users[as]
    const { GET } = await import('@/app/api/files/[id]/route')
    return (await GET({} as never, { params: Promise.resolve({ id: doc }) })).status
  }

  it('gives the quote file to the office only', async () => {
    expect(await download('admin')).toBe(200)
    expect(await download('manager')).toBe(200)
    expect(await download('site')).toBe(403)
    expect(await download('crew')).toBe(403)
  })

  it('shows the amounts only to those who may see money', async () => {
    const { ProjectQuotes } = await import('@/app/(admin)/projects/[id]/quotes-card')
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    const card = async (as: keyof typeof users) =>
      (await ProjectQuotes({ user: users[as] as never, project: p, locale: 'de', hidePrices: false })) as { props: Record<string, unknown> } | null

    const admin = await card('admin')
    const adminRows = admin!.props.rows as { netLabel: string | null; net: string }[]
    expect(adminRows[0].netLabel).toContain('2.700,00')
    expect(admin!.props.total).not.toBeNull()

    const manager = await card('manager')
    const managerRows = manager!.props.rows as { netLabel: string | null; grossLabel: string | null; net: string }[]
    expect(managerRows[0]).toMatchObject({ netLabel: null, grossLabel: null, net: '' })
    expect(manager!.props.total).toBeNull()
    expect(manager!.props.priceRecognized).toBeNull()

    expect(await card('site')).toBeNull()
    expect(await card('crew')).toBeNull()
  })

  it('refuses the money actions to a manager without financial rights', async () => {
    who.user = users.manager
    const { setQuoteInTotal, correctQuote, markNotQuote, confirmQuotePrice } = await import('@/app/(admin)/projects/[id]/quote-actions')
    expect(await setQuoteInTotal(quoteId, false)).toEqual({ error: 'forbidden' })
    expect(await correctQuote(doc, new FormData())).toEqual({ error: 'forbidden' })
    expect(await markNotQuote(quoteId)).toEqual({ error: 'forbidden' })
    expect(await confirmQuotePrice(projectId)).toEqual({ error: 'forbidden' })
    expect((await prisma.documentQuote.findUniqueOrThrow({ where: { id: quoteId } })).inTotal).toBe(true)
  })

  it('keeps quote files off the site manager’s and the crew’s lists', async () => {
    const officeOnly = { NOT: { quote: { is: { kind: 'QUOTE' as const } } } }
    expect(await prisma.document.count({ where: { projectId, ...officeOnly } })).toBe(0)
    expect(await prisma.document.count({ where: { projectId, visibleToCrew: true, ...officeOnly } })).toBe(0)
    who.user = users.admin
    const { toggleFileVisibility } = await import('@/app/(admin)/projects/[id]/file-actions')
    await prisma.document.update({ where: { id: doc }, data: { visibleToCrew: false } })
    await toggleFileVisibility(doc)
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc } })).visibleToCrew).toBe(false)
  })
})
