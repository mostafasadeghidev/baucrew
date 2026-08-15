'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { parseTrelloExport, splitCardTitle, type TrelloBoard } from '@/lib/trello'
import { ProjectStatus } from '@/generated/prisma/enums'

export type PreviewState =
  | { step: 'upload'; error?: 'invalidFile' }
  | { step: 'preview'; board: TrelloBoard; suggested: Record<string, string> }
  | {
      step: 'done'
      created: number
      skipped: number
      customersCreated: number
      ignored: number
    }

const STATUS_VALUES = Object.keys(ProjectStatus) as ProjectStatus[]

/** Heuristic default status per Trello list name (German column names). */
function suggestStatus(listName: string): string {
  const n = listName.toLowerCase()
  if (/(erledigt|fertig|abgeschlossen|done|complete)/.test(n)) return 'COMPLETED'
  if (/(rechnung|abgerechnet|invoic)/.test(n)) return 'INVOICED'
  if (/(bezahlt|paid)/.test(n)) return 'PAID'
  if (/(läuft|laufend|in arbeit|progress|aktiv|baustelle)/.test(n)) return 'IN_PROGRESS'
  if (/(geplant|termin|planned|planung)/.test(n)) return 'PLANNED'
  if (/(angebot|quote|kalkul)/.test(n)) return 'QUOTED'
  if (/(beauftragt|auftrag|approved|zusage)/.test(n)) return 'APPROVED'
  if (/(anfrage|lead|neu|eingang|todo|to do|offen)/.test(n)) return 'LEAD'
  if (/(storn|abgesagt|cancel|verloren)/.test(n)) return 'CANCELLED'
  return 'LEAD'
}

export async function previewTrello(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > 50 * 1024 * 1024) {
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
  let skipped = 0
  let ignored = 0
  let customersCreated = 0
  const customerCache = new Map<string, string>()

  for (const card of board.cards) {
    const status = mapping.get(card.idList)
    if (!status || status === 'SKIP' || (card.closed && !includeArchived)) {
      ignored++
      continue
    }
    const { customer: customerName, project: projectName } = splitCardTitle(card.name)

    // Idempotent: skip when a project with the same name already exists.
    const existing = await db.project.findFirst({ where: { name: projectName }, select: { id: true } })
    if (existing) {
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

    const listName = board.lists.find((l) => l.id === card.idList)?.name ?? ''
    const descriptionParts = [
      card.desc,
      card.labels.length ? `Labels: ${card.labels.join(', ')}` : '',
      `Trello: ${board.name} / ${listName}`,
    ].filter(Boolean)

    await db.project.create({
      data: {
        number: await nextProjectNumber(),
        name: projectName,
        customerId,
        status,
        plannedEnd: card.due ? new Date(card.due) : undefined,
        description: descriptionParts.join('\n\n'),
      },
    })
    created++
  }

  await audit({
    userId: admin.id,
    action: 'import.trello',
    entity: 'System',
    entityId: 'trello',
    newValue: `${board.name}: ${created} Projekte, ${customersCreated} Kunden`,
  })
  revalidatePath('/projects')
  revalidatePath('/customers')
  return { step: 'done', created, skipped, customersCreated, ignored }
}
