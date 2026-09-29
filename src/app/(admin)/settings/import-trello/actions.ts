'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { COMMENT_MAX } from '@/lib/comments'
import { geocodeCity } from '@/lib/geocode'
import { hasFields, matchTrades, type TrelloCardFields } from '@/lib/trello-fields'
import {
  cardCreatedAt,
  checklistTemplatesOf,
  parseTrelloExport,
  splitCardTitle,
  suggestStatus,
  trelloCommentBody,
  type TrelloBoard,
  type TrelloCard,
} from '@/lib/trello'
import { ProjectStatus } from '@/generated/prisma/enums'

export type PreviewState =
  | { step: 'upload'; error?: 'invalidFile' }
  | { step: 'preview'; board: TrelloBoard; suggested: Record<string, string> }
  | {
      step: 'done'
      created: number
      updated: number
      skipped: number
      customersCreated: number
      ignored: number
      /** Cards whose title gave no dependable customer. */
      flagged: number
      /** What came along with the cards. */
      checklists: number
      comments: number
      templates: number
      /** Cards whose power-up fields filled something in. */
      fields: number
    }

const STATUS_VALUES = Object.keys(ProjectStatus) as ProjectStatus[]

export async function previewTrello(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireAdmin()
  const file = formData.get('file')
  // Keep in step with serverActions.bodySizeLimit in next.config.ts.
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) {
    return { step: 'upload', error: 'invalidFile' }
  }
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    return { step: 'upload', error: 'invalidFile' }
  }
  const board = parseTrelloExport(json)
  if (!board || board.cards.length === 0) return { step: 'upload', error: 'invalidFile' }

  const suggested: Record<string, string> = {}
  for (const list of board.lists) suggested[list.id] = suggestStatus(list.name)
  return { step: 'preview', board, suggested }
}

async function nextProjectNumber(): Promise<string> {
  const year = new Date().getUTCFullYear()
  const prefix = `${year}-`
  const last = await db.project.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const lastSeq = last ? Number(last.number.slice(prefix.length)) : 0
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`
}

/** Single reducer for the wizard: upload → preview → done. */
export async function trelloWizard(prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const phase = String(formData.get('_phase') ?? 'preview')
  if (phase === 'import' && prev.step === 'preview') return importTrello(prev, formData)
  return previewTrello(prev, formData)
}

const dayFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })

/**
 * A card's checklists and comments onto its project — once. A second import
 * finds them there: a checklist by its name, a comment by its text and time,
 * and does not double them. The ticks come along; who ticked in Trello does
 * not, and the comments have no account of their own here, so their author
 * and day stand under the text.
 */
async function takeOverCardExtras(
  projectId: string,
  card: TrelloCard,
  want: { checklists: boolean; comments: boolean },
  counts: { checklists: number; comments: number }
) {
  if (want.checklists && card.checklists.length > 0) {
    const have = new Set((await db.projectChecklist.findMany({ where: { projectId }, select: { name: true } })).map((c) => c.name.toLowerCase()))
    for (const list of card.checklists) {
      if (have.has(list.name.toLowerCase())) continue
      have.add(list.name.toLowerCase())
      await db.projectChecklist.create({
        data: {
          projectId,
          name: list.name.slice(0, 200),
          items: {
            create: list.items.slice(0, 200).map((item, sortOrder) => ({
              text: item.name.slice(0, 500),
              sortOrder,
              ok: item.complete ? true : null,
              checkedAt: item.complete ? new Date() : null,
            })),
          },
        },
      })
      counts.checklists++
    }
  }
  if (want.comments && card.comments.length > 0) {
    const have = await db.note.findMany({ where: { projectId }, select: { body: true, createdAt: true } })
    const seen = new Set(have.map((n) => `${n.createdAt.toISOString()}|${n.body}`))
    for (const comment of card.comments) {
      const body = trelloCommentBody(comment, (d) => dayFmt.format(d)).slice(0, COMMENT_MAX)
      const createdAt = new Date(comment.date)
      const key = `${createdAt.toISOString()}|${body}`
      if (seen.has(key)) continue
      seen.add(key)
      await db.note.create({ data: { projectId, body, createdAt } })
      counts.comments++
    }
  }
}

/** Trades as the fields' type of work is matched against them: by the German and the English name. */
type TradeNames = Array<{ id: string; names: string[] }>

/**
 * What a card's power-up fields put into its project. A new project takes all
 * of it; a project that is there already only where it is still empty — what
 * the office has typed in since stays. The trades are added, never taken
 * away. A town is looked up for the map once per import.
 */
async function fieldData(
  fields: TrelloCardFields,
  trades: TradeNames,
  existing: {
    street: string | null
    postalCode: string | null
    city: string | null
    price: unknown
    executionWish: string | null
    inspectionDate: Date | null
    trades: string[]
  } | null,
  places: Map<string, { latitude: number; longitude: number } | null>
): Promise<{ data: Record<string, unknown>; tradeIds: string[]; unknownTrades: string[] }> {
  const data: Record<string, unknown> = {}
  const empty = (v: unknown) => existing === null || v === null || v === undefined || v === ''
  const address = fields.siteAddress
  if (address && empty(existing?.street) && empty(existing?.city) && empty(existing?.postalCode)) {
    if (address.street) data.street = address.street.slice(0, 300)
    if (address.postalCode) data.postalCode = address.postalCode
    if (address.city) {
      data.city = address.city.slice(0, 300)
      // The postal code tells a town from another of the same name.
      const key = `${address.city.toLowerCase()}|${address.postalCode ?? ''}`
      if (!places.has(key)) places.set(key, await geocodeCity(address.city, address.postalCode).catch(() => null))
      const place = places.get(key)
      if (place) {
        data.latitude = place.latitude
        data.longitude = place.longitude
      }
    }
  }
  if (fields.orderValue !== undefined && empty(existing?.price)) data.price = fields.orderValue
  if (fields.executionWish && empty(existing?.executionWish)) data.executionWish = fields.executionWish
  if (fields.inspectionDate && empty(existing?.inspectionDate)) data.inspectionDate = new Date(`${fields.inspectionDate}T00:00:00Z`)
  const matched = fields.workTypes ? matchTrades(fields.workTypes, trades) : { ids: [], unknown: [] }
  const tradeIds = matched.ids.filter((id) => !existing?.trades.includes(id))
  return { data, tradeIds, unknownTrades: matched.unknown }
}

export async function importTrello(prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const admin = await requireAdmin()
  if (prev.step !== 'preview') return { step: 'upload', error: 'invalidFile' }
  const { board } = prev

  // Mapping from the confirmation form: list_<id> → status or "SKIP"
  const mapping = new Map<string, ProjectStatus | 'SKIP'>()
  for (const list of board.lists) {
    const value = String(formData.get(`list_${list.id}`) ?? 'SKIP')
    mapping.set(list.id, STATUS_VALUES.includes(value as ProjectStatus) ? (value as ProjectStatus) : 'SKIP')
  }
  const includeArchived = formData.get('includeArchived') === 'on'
  const want = {
    checklists: formData.get('includeChecklists') === 'on',
    comments: formData.get('includeComments') === 'on',
    templates: formData.get('checklistsAsTemplates') === 'on',
    fields: formData.get('includeFields') === 'on',
  }
  const trades: TradeNames = want.fields
    ? (await db.workCategory.findMany({ select: { id: true, nameDe: true, nameEn: true } })).map((t) => ({ id: t.id, names: [t.nameDe, t.nameEn] }))
    : []
  /** Towns looked up for the map in this import, so each is asked for once. */
  const places = new Map<string, { latitude: number; longitude: number } | null>()
  let fieldsTaken = 0

  let created = 0
  let updated = 0
  let skipped = 0
  let ignored = 0
  let customersCreated = 0
  let flagged = 0
  const extras = { checklists: 0, comments: 0 }
  /** The cards that were taken, for the templates made from their checklists afterwards. */
  const taken: TrelloCard[] = []
  const customerCache = new Map<string, string>()
  // The card itself as a link, so an automation that sends the same card later
  // finds this project. A card linked to another project already keeps that link.
  // This import tells automations nothing: what it brings comes from the board
  // they would tell, and a board of old cards would set off a flood of events.
  const linkCard = (projectId: string, cardId: string, url: string | undefined) =>
    db.projectLink
      .upsert({
        where: { projectId_system: { projectId, system: 'trello' } },
        create: { projectId, system: 'trello', externalId: cardId, url: url || null },
        update: { externalId: cardId, url: url || null },
      })
      .catch(() => {})

  for (const card of board.cards) {
    const status = mapping.get(card.idList)
    if (!status || status === 'SKIP' || (card.closed && !includeArchived)) {
      ignored++
      continue
    }
    taken.push(card)
    const { customer: titleCustomer, project: projectName, number, confident } = splitCardTitle(card.name)
    // The power-up's customer name is the office's own word for it; the title is only a guess.
    const fields: TrelloCardFields = want.fields ? card.fields : {}
    const customerName = fields.customerName ?? titleCustomer
    if (!confident && !fields.customerName) flagged++

    // The job number in the title is what the office's other systems use, so it
    // is the identity across imports. A card without one falls back to the
    // Trello card id, which is just as stable.
    const externalId = number ?? card.id
    // The card's own creation time: the year a job belongs to, which the
    // reconciliation with the planning sheet relies on.
    const sourceCreatedAt = cardCreatedAt(card.id) ?? undefined

    const listName = board.lists.find((l) => l.id === card.idList)?.name ?? ''
    const attachmentLines = card.attachments.slice(0, 20).map((a) => `- ${a.name || 'Anhang'}: ${a.url}`)
    // A type of work the app has no trade for is kept in words.
    const unknownTrades = fields.workTypes ? matchTrades(fields.workTypes, trades).unknown : []
    const description = [
      card.desc,
      card.labels.length ? `Labels: ${card.labels.join(', ')}` : '',
      unknownTrades.length ? `Art der Arbeit: ${unknownTrades.join(', ')}` : '',
      attachmentLines.length ? `Anhänge in Trello:\n${attachmentLines.join('\n')}` : '',
      `Trello: ${board.name} / ${listName}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    /** What the fields put into a project that is there already, only where it is empty. */
    const fillExisting = async (projectId: string) => {
      if (!hasFields(fields)) return
      const row = await db.project.findUnique({
        where: { id: projectId },
        select: {
          customerId: true,
          street: true,
          postalCode: true,
          city: true,
          price: true,
          executionWish: true,
          inspectionDate: true,
          workCategories: { select: { workCategoryId: true } },
        },
      })
      if (!row) return
      // The project's customer without a number takes the one the card names, as on a first import.
      if (fields.customerNumber) {
        await db.customer.updateMany({ where: { id: row.customerId, number: null }, data: { number: fields.customerNumber } })
      }
      const fill = await fieldData(fields, trades, { ...row, trades: row.workCategories.map((w) => w.workCategoryId) }, places)
      if (Object.keys(fill.data).length === 0 && fill.tradeIds.length === 0) return
      await db.project.update({
        where: { id: projectId },
        data: { ...fill.data, ...(fill.tradeIds.length ? { workCategories: { create: fill.tradeIds.map((workCategoryId) => ({ workCategoryId })) } } : {}) },
      })
      fieldsTaken++
    }

    // A second import must move the project on, not double it.
    const existing = await db.project.findFirst({
      where: { externalSystem: 'trello', externalId },
      select: { id: true },
    })
    if (existing) {
      await db.project.update({
        where: { id: existing.id },
        data: {
          status,
          name: projectName,
          description,
          externalUrl: card.shortUrl || undefined,
          sourceCreatedAt,
          plannedEnd: card.due ? new Date(card.due) : undefined,
          ...(card.dueComplete ? { doneAt: new Date() } : {}),
        },
      })
      await linkCard(existing.id, card.id, card.shortUrl)
      await takeOverCardExtras(existing.id, card, want, extras)
      await fillExisting(existing.id)
      updated++
      continue
    }

    // An earlier import stored no external id. Match those by name once and
    // adopt them, so the board and the projects line up from now on.
    const byName = await db.project.findFirst({
      where: { name: projectName, externalId: null },
      select: { id: true },
    })
    if (byName) {
      await db.project.update({
        where: { id: byName.id },
        data: {
          status,
          externalSystem: 'trello',
          externalId,
          externalUrl: card.shortUrl || undefined,
          sourceCreatedAt,
        },
      })
      await linkCard(byName.id, card.id, card.shortUrl)
      await takeOverCardExtras(byName.id, card, want, extras)
      await fillExisting(byName.id)
      skipped++
      continue
    }

    let customerId = customerCache.get(customerName.toLowerCase())
    if (!customerId) {
      const found = await db.customer.findFirst({
        where: { name: { equals: customerName, mode: 'insensitive' } },
        select: { id: true },
      })
      if (found) customerId = found.id
      else {
        const createdCustomer = await db.customer.create({ data: { name: customerName.slice(0, 200), number: fields.customerNumber ?? null } })
        customerId = createdCustomer.id
        customersCreated++
      }
      customerCache.set(customerName.toLowerCase(), customerId)
    }
    // A customer without a number takes the one the card names.
    if (fields.customerNumber) {
      await db.customer.updateMany({ where: { id: customerId, number: null }, data: { number: fields.customerNumber } })
    }
    const fill = hasFields(fields) ? await fieldData(fields, trades, null, places) : { data: {}, tradeIds: [] as string[] }
    if (Object.keys(fill.data).length > 0 || fill.tradeIds.length > 0) fieldsTaken++

    const createdProject = await db.project.create({
      data: {
        number: await nextProjectNumber(),
        name: projectName,
        customerId,
        status,
        plannedEnd: card.due ? new Date(card.due) : undefined,
        description,
        externalSystem: 'trello',
        externalId,
        externalUrl: card.shortUrl || undefined,
        sourceCreatedAt,
        doneAt: card.dueComplete ? new Date() : undefined,
        ...fill.data,
        ...(fill.tradeIds.length ? { workCategories: { create: fill.tradeIds.map((workCategoryId) => ({ workCategoryId })) } } : {}),
      },
      select: { id: true },
    })
    await linkCard(createdProject.id, card.id, card.shortUrl)
    await takeOverCardExtras(createdProject.id, card, want, extras)
    created++
  }

  // The board's checklists as templates to reuse — one per name, the items
  // that name ever had; a template of that name already there is left alone.
  let templates = 0
  if (want.templates) {
    const last = await db.checklistTemplate.aggregate({ _max: { sortOrder: true } })
    let sortOrder = (last._max.sortOrder ?? -1) + 1
    for (const template of checklistTemplatesOf(taken)) {
      const exists = await db.checklistTemplate.findFirst({ where: { name: { equals: template.name, mode: 'insensitive' } }, select: { id: true } })
      if (exists) continue
      await db.checklistTemplate.create({
        data: {
          name: template.name.slice(0, 200),
          description: `Aus Trello: ${board.name}`.slice(0, 500),
          sortOrder: sortOrder++,
          items: { create: template.items.slice(0, 200).map((text, i) => ({ text: text.slice(0, 500), sortOrder: i })) },
        },
      })
      templates++
    }
  }

  await audit({
    userId: admin.id,
    action: 'import.trello',
    entity: 'System',
    entityId: 'trello',
    newValue: `${board.name}: ${created} neu, ${updated} aktualisiert, ${customersCreated} Kunden, ${fieldsTaken} mit Feldern, ${extras.checklists} Checklisten, ${extras.comments} Kommentare, ${templates} Vorlagen`,
  })
  revalidatePath('/projects')
  revalidatePath('/customers')
  return { step: 'done', created, updated, skipped, customersCreated, ignored, flagged, checklists: extras.checklists, comments: extras.comments, templates, fields: fieldsTaken }
}
