'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { COMMENT_MAX } from '@/lib/comments'
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
  }

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
    const { customer: customerName, project: projectName, number, confident } = splitCardTitle(card.name)
    if (!confident) flagged++

    // The job number in the title is what the office's other systems use, so it
    // is the identity across imports. A card without one falls back to the
    // Trello card id, which is just as stable.
    const externalId = number ?? card.id
    // The card's own creation time: the year a job belongs to, which the
    // reconciliation with the planning sheet relies on.
    const sourceCreatedAt = cardCreatedAt(card.id) ?? undefined

    const listName = board.lists.find((l) => l.id === card.idList)?.name ?? ''
    const attachmentLines = card.attachments.slice(0, 20).map((a) => `- ${a.name || 'Anhang'}: ${a.url}`)
    const description = [
      card.desc,
      card.labels.length ? `Labels: ${card.labels.join(', ')}` : '',
      attachmentLines.length ? `Anhänge in Trello:\n${attachmentLines.join('\n')}` : '',
      `Trello: ${board.name} / ${listName}`,
    ]
      .filter(Boolean)
      .join('\n\n')

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
        const createdCustomer = await db.customer.create({ data: { name: customerName } })
        customerId = createdCustomer.id
        customersCreated++
      }
      customerCache.set(customerName.toLowerCase(), customerId)
    }

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
    newValue: `${board.name}: ${created} neu, ${updated} aktualisiert, ${customersCreated} Kunden, ${extras.checklists} Checklisten, ${extras.comments} Kommentare, ${templates} Vorlagen`,
  })
  revalidatePath('/projects')
  revalidatePath('/customers')
  return { step: 'done', created, updated, skipped, customersCreated, ignored, flagged, checklists: extras.checklists, comments: extras.comments, templates }
}
