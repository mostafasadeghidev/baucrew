'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { cardCreatedAt, parseTrelloExport, splitCardTitle, suggestStatus, type TrelloBoard } from '@/lib/trello'
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

  let created = 0
  let updated = 0
  let skipped = 0
  let ignored = 0
  let customersCreated = 0
  let flagged = 0
  const customerCache = new Map<string, string>()

  for (const card of board.cards) {
    const status = mapping.get(card.idList)
    if (!status || status === 'SKIP' || (card.closed && !includeArchived)) {
      ignored++
      continue
    }
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
        },
      })
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

    await db.project.create({
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
      },
    })
    created++
  }

  await audit({
    userId: admin.id,
    action: 'import.trello',
    entity: 'System',
    entityId: 'trello',
    newValue: `${board.name}: ${created} neu, ${updated} aktualisiert, ${customersCreated} Kunden`,
  })
  revalidatePath('/projects')
  revalidatePath('/customers')
  return { step: 'done', created, updated, skipped, customersCreated, ignored, flagged }
}
