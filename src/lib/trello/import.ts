import 'server-only'

/**
 * The Trello import itself — a board's cards into the projects, what hangs
 * on them along — apart from any page: Settings → Import aus Trello hands a
 * file to it, the automatic sync (./auto-sync.ts) a board pulled from the
 * API. What a second run keeps and what it overwrites is in
 * docs/TRELLO-RESYNC.md §3.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { COMMENT_MAX } from '@/lib/comments'
import { geocodeCity } from '@/lib/geocode'
import { hasFields, matchTrades, type TrelloCardFields } from '@/lib/trello-fields'
import { cardCreatedAt, checklistTemplatesOf, splitCardTitle, type TrelloBoard } from '@/lib/trello'
import { TRELLO_RULE_PREFIX } from '@/lib/board-rules'
import { ProjectStatus } from '@/generated/prisma/enums'
import { isUniqueClash, nextProjectNumber } from '@/lib/project-numbers'

/** A town's place on the map, looked up once per import; null where the lookup found nothing. */
type Places = Map<string, { latitude: number; longitude: number } | null>

/**
 * What a card's power-up fields put into its project. A new project takes all
 * of it; a project that is there already only where it is still empty — what
 * the office has typed in since stays. The trades are added, never taken
 * away. A town is looked up for the map once per import.
 */
async function fieldData(
  fields: TrelloCardFields,
  tradeIds: string[],
  existing: {
    street: string | null
    postalCode: string | null
    city: string | null
    price: unknown
    executionWish: string | null
    inspectionDate: Date | null
    trades: string[]
  } | null,
  places: Places
): Promise<{ data: Record<string, unknown>; tradeIds: string[] }> {
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
  return { data, tradeIds: tradeIds.filter((id) => !existing?.trades.includes(id)) }
}

export type TrelloImportWant = { fields: boolean; checklists: boolean; comments: boolean; templates: boolean }

export type TrelloImportOptions = {
  /** Trello list id → the status its cards get, or SKIP. */
  mapping: Map<string, ProjectStatus | 'SKIP'>
  includeArchived: boolean
  makeBoard: boolean
  /** A board of price lists or tasks holds no customer jobs: every card under one customer named after the board. */
  oneCustomer: boolean
  want: TrelloImportWant
}

export type TrelloImportResult = {
  created: number
  updated: number
  customersCreated: number
  ignored: number
  /** Cards whose title gave no dependable customer. */
  flagged: number
  comments: number
  checklists: number
  links: number
  /** Checklist templates made of the cards' checklists. */
  templates: number
  /** Cards whose power-up fields filled something in. */
  fields: number
  /** Lists that became columns of the board of this name. */
  columns: number
  /** People on cards that no employee here answers to by name. */
  unknownMembers: string[]
}

/** The result as one line for the audit log and the sync's last-run note. */
export function importSummary(boardName: string, r: TrelloImportResult): string {
  return `${boardName}: ${r.created} neu, ${r.updated} aktualisiert, ${r.customersCreated} Kunden, ${r.fields} mit Feldern, ${r.checklists} Checklisten, ${r.comments} Kommentare, ${r.templates} Vorlagen`
}

/**
 * One board into the projects: the wizard (a file the office uploaded) and
 * the automatic sync (the board pulled from Trello's API) both end here.
 * `userId` is who pressed the button, null for the timer.
 */
export async function runTrelloImport(board: TrelloBoard, options: TrelloImportOptions, userId: string | null): Promise<TrelloImportResult> {
  const { mapping, includeArchived, makeBoard, oneCustomer, want } = options
  const places: Places = new Map()

  let created = 0
  let updated = 0
  let ignored = 0
  let customersCreated = 0
  let flagged = 0
  let comments = 0
  let checklists = 0
  let links = 0
  let fieldsTaken = 0
  /** The cards that were taken, for the templates made from their checklists afterwards. */
  const takenCardIds = new Set<string>()
  const customerCache = new Map<string, string>()
  // The card itself as a link, so an automation that sends the same card later
  // finds this project, with the card's list — what a mirror rule's column on
  // the board reads. A card linked to another project already keeps that link.
  // This import tells automations nothing: what it brings comes from the board
  // they would tell, and a board of old cards would set off a flood of events.
  const linkCard = (projectId: string, cardId: string, url: string | undefined, listId: string) =>
    db.projectLink
      .upsert({
        where: { projectId_system: { projectId, system: 'trello' } },
        create: { projectId, system: 'trello', externalId: cardId, url: url || null, externalListId: listId },
        update: { externalId: cardId, url: url || null, externalListId: listId },
      })
      // The card is linked to another project already (the same board run
      // twice at once, say): that project keeps it, and this is said, not hidden.
      .catch((e: unknown) => console.warn('trello import: card link not written', { cardId, projectId, code: (e as { code?: string })?.code }))

  // Who is who: a Trello member is the employee of the same name, and through
  // the employee the user who wrote a comment.
  const employees = await db.employee.findMany({ select: { id: true, firstName: true, lastName: true, userId: true } })
  const byName = new Map(employees.map((e) => [`${e.firstName} ${e.lastName}`.trim().toLowerCase(), e]))
  const memberEmployee = new Map<string, (typeof employees)[number]>()
  const unknownMembers = new Set<string>()
  for (const member of board.members) {
    const employee = byName.get(member.name.toLowerCase())
    if (employee) memberEmployee.set(member.id, employee)
  }
  const memberName = new Map(board.members.map((m) => [m.id, m.name]))

  // Trello's labels are the trades here; one that is missing is added. The
  // fields' type of work is matched against the same trades by either name.
  const categories = await db.workCategory.findMany({ select: { id: true, nameDe: true, nameEn: true } })
  const categoryId = new Map(categories.map((c) => [c.nameDe.trim().toLowerCase(), c.id]))
  const trades: Array<{ id: string; names: string[] }> = categories.map((c) => ({ id: c.id, names: [c.nameDe, c.nameEn] }))
  const categoryFor = async (label: string): Promise<string> => {
    const key = label.trim().toLowerCase()
    let id = categoryId.get(key)
    if (!id) {
      id = (await db.workCategory.create({ data: { nameDe: label.trim(), nameEn: label.trim(), sortOrder: categoryId.size } })).id
      categoryId.set(key, id)
      trades.push({ id, names: [label.trim()] })
    }
    return id
  }

  /** The customer a card belongs to: by number, then by name, made where there is none. */
  const customerFor = async (name: string, number: string | null): Promise<string> => {
    const key = `${number ?? ''}|${name.toLowerCase()}`
    const cached = customerCache.get(key)
    if (cached) return cached
    const found =
      (number ? await db.customer.findFirst({ where: { number }, select: { id: true, number: true } }) : null) ??
      (await db.customer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true, number: true } }))
    let id: string
    if (found) {
      id = found.id
      // A customer without a number takes the one the card names.
      if (number && !found.number) await db.customer.update({ where: { id }, data: { number } })
    } else {
      id = (await db.customer.create({ data: { name: name.slice(0, 200), number } })).id
      customersCreated++
    }
    customerCache.set(key, id)
    return id
  }

  const checklistsByCard = new Map<string, typeof board.checklists>()
  for (const checklist of board.checklists) {
    checklistsByCard.set(checklist.idCard, [...(checklistsByCard.get(checklist.idCard) ?? []), checklist])
  }
  const commentsByCard = new Map<string, typeof board.comments>()
  for (const comment of board.comments) {
    commentsByCard.set(comment.idCard, [...(commentsByCard.get(comment.idCard) ?? []), comment])
  }

  /** Everything a card carries beside its own line: people, labels, checklists, what was said, what is attached. */
  const fillCard = async (projectId: string, card: (typeof board.cards)[number]) => {
    for (const idMember of card.members) {
      const employee = memberEmployee.get(idMember)
      if (!employee) {
        unknownMembers.add(memberName.get(idMember) ?? idMember)
        continue
      }
      await db.projectEmployee.upsert({
        where: { projectId_employeeId: { projectId, employeeId: employee.id } },
        create: { projectId, employeeId: employee.id },
        update: {},
      })
    }
    for (const label of card.labels) {
      const workCategoryId = await categoryFor(label)
      await db.projectWorkCategory.upsert({
        where: { projectId_workCategoryId: { projectId, workCategoryId } },
        create: { projectId, workCategoryId },
        update: {},
      })
    }
    // A checklist of the same name is the one from an earlier import; it has
    // been worked on here since and is left as it stands.
    const lists = want.checklists ? (checklistsByCard.get(card.id) ?? []) : []
    if (lists.length > 0) {
      const have = new Set((await db.projectChecklist.findMany({ where: { projectId }, select: { name: true } })).map((c) => c.name.toLowerCase()))
      for (const checklist of lists) {
        if (have.has(checklist.name.toLowerCase())) continue
        have.add(checklist.name.toLowerCase())
        await db.projectChecklist.create({
          data: {
            projectId,
            name: checklist.name.slice(0, 200),
            items: {
              create: checklist.items.slice(0, 200).map((item, sortOrder) => ({
                text: item.text.slice(0, 500),
                sortOrder,
                ok: item.done ? true : null,
                // Ticked in Trello; when, Trello does not say.
                checkedAt: item.done ? new Date() : null,
                dueDate: item.due ? new Date(item.due) : null,
                assigneeId: item.idMember ? (memberEmployee.get(item.idMember)?.id ?? null) : null,
              })),
            },
          },
        })
        checklists++
      }
    }
    // A comment is told from one already here by its moment: Trello's to the
    // millisecond, and no two on one card share it.
    const said = want.comments ? (commentsByCard.get(card.id) ?? []) : []
    if (said.length > 0) {
      const have = new Set((await db.note.findMany({ where: { projectId }, select: { createdAt: true } })).map((n) => n.createdAt.getTime()))
      for (const comment of said) {
        const createdAt = new Date(comment.date)
        if (Number.isNaN(createdAt.getTime()) || have.has(createdAt.getTime())) continue
        have.add(createdAt.getTime())
        const authorId = comment.idMember ? (memberEmployee.get(comment.idMember)?.userId ?? null) : null
        await db.note.create({
          data: {
            projectId,
            authorId,
            // Sales talk and prices: for the office, as it was in Trello.
            visibility: 'MANAGEMENT',
            // Nobody here to put the name to — it stays in the words.
            body: (authorId || !comment.author ? comment.text : `**${comment.author}:** ${comment.text}`).slice(0, COMMENT_MAX),
            createdAt,
          },
        })
        comments++
      }
    }
    // What is attached: a web address as the link it is; a file as a link to
    // Trello for now — fetching turns it into a file here (src/lib/trello-files.ts).
    if (card.attachments.length > 0) {
      const [haveLinks, haveFiles] = await Promise.all([
        db.cardLink.findMany({ where: { projectId }, select: { url: true } }),
        db.document.findMany({ where: { projectId, source: 'trello' }, select: { filename: true } }),
      ])
      const urls = new Set(haveLinks.map((l) => l.url))
      const files = new Set(haveFiles.map((f) => f.filename))
      for (const attachment of card.attachments) {
        if (urls.has(attachment.url) || (attachment.isUpload && files.has(attachment.name))) continue
        await db.cardLink.create({
          data: {
            projectId,
            url: attachment.url,
            title: attachment.name || null,
            createdById: userId,
            createdAt: attachment.date ? new Date(attachment.date) : undefined,
          },
        })
        urls.add(attachment.url)
        links++
      }
    }
  }

  let boardCustomerId: string | null = null
  for (const card of board.cards) {
    const status = mapping.get(card.idList)
    if (!status || status === 'SKIP' || (card.closed && !includeArchived)) {
      ignored++
      continue
    }
    takenCardIds.add(card.id)
    const { customer: titleCustomer, project: projectName, number, confident } = splitCardTitle(card.name)
    // The power-up's customer name is the office's own word for it; the title is only a guess.
    const fields: TrelloCardFields = want.fields ? card.fields : {}
    if (!oneCustomer && !fields.customerName && !confident) flagged++

    // The job number in the title is what the office's other systems use, so it
    // is the identity across imports. A card without one falls back to the
    // Trello card id, which is just as stable.
    const externalId = number ?? card.id
    // The day the office wrote on the card, else the card's own creation time:
    // the year a job belongs to, which the reconciliation with the planning
    // sheet relies on.
    const sourceCreatedAt = (fields.createdDate ? validDate(`${fields.createdDate}T00:00:00Z`) : null) ?? cardCreatedAt(card.id) ?? undefined
    // The type of work, among the trades here; a word the app has no trade for stays readable on the card.
    const matched = fields.workTypes ? matchTrades(fields.workTypes, trades) : { ids: [], unknown: [] }
    const description =
      [card.desc, matched.unknown.length ? `Art der Arbeit: ${matched.unknown.join(', ')}` : ''].filter(Boolean).join('\n\n') || null

    const due = card.due ? validDate(card.due) : null
    /** What the card says, the same for a new project and one met again: the card's own line follows Trello. */
    const cardData = {
      status,
      name: projectName.slice(0, 200),
      description,
      externalUrl: card.shortUrl || undefined,
      sourceCreatedAt,
      ...(due ? { dueDate: utcDay(due) } : {}),
      plannedStart: card.start && validDate(card.start) ? utcDay(validDate(card.start)!) : undefined,
      boardPosition: card.pos || undefined,
      ...(card.closed ? { archivedAt: (card.dateClosed ? validDate(card.dateClosed) : null) ?? new Date() } : {}),
    }
    const customerId = async () => {
      if (oneCustomer) return (boardCustomerId ??= await customerFor(board.name, null))
      return customerFor(fields.customerName ?? titleCustomer, fields.customerNumber ?? null)
    }
    /** What the fields put into a project that is there already: only where it is still empty. */
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
      const fill = await fieldData(fields, matched.ids, { ...row, trades: row.workCategories.map((w) => w.workCategoryId) }, places)
      if (Object.keys(fill.data).length === 0 && fill.tradeIds.length === 0) return
      await db.project.update({
        where: { id: projectId },
        data: { ...fill.data, ...(fill.tradeIds.length ? { workCategories: { create: fill.tradeIds.map((workCategoryId) => ({ workCategoryId })) } } : {}) },
      })
      fieldsTaken++
    }
    const afterWrite = async (projectId: string) => {
      await linkCard(projectId, card.id, card.shortUrl, card.idList)
      await fillCard(projectId, card)
    }

    // A second import must move the project on, not double it: the card it is
    // linked to first; else the job number, where it names a project that no
    // card is linked to yet (an import of before the links, or a project the
    // office numbered by hand). A project already linked to another card of
    // the same number is that card's — this one is a card of its own, as it
    // is in Trello (an offer archived and a job made anew, say), and gets a
    // project of its own. Nothing else: a project of the same name that no
    // import made is somebody's own, never the card's.
    const select = { id: true, customerId: true, doneAt: true, plannedStart: true, plannedEnd: true, dueDate: true, jobNumber: true }
    // The title's number becomes the project's Projektnummer — where no other project has it already.
    const titleJobNumber = number && !(await db.project.findUnique({ where: { jobNumber: number }, select: { id: true } })) ? number : null
    const existing =
      (await db.projectLink.findUnique({
        where: { system_externalId: { system: 'trello', externalId: card.id } },
        select: { project: { select } },
      }))?.project ??
      (await db.project.findFirst({
        where: { externalSystem: 'trello', externalId, links: { none: { system: 'trello' } } },
        orderBy: { createdAt: 'asc' },
        select,
      }))
    if (existing) {
      // The customer the card names — where it names one. A project filed
      // under a guess from the title moves to the customer the office wrote.
      const named = oneCustomer || fields.customerName ? await customerId() : existing.customerId
      // Earlier imports kept Trello's due day as the planned end; it is the due day.
      const wasDue = due && !existing.plannedStart && !existing.dueDate && existing.plannedEnd?.getTime() === utcDay(due).getTime()
      await db.project.update({
        where: { id: existing.id },
        data: {
          ...cardData,
          customerId: named,
          ...(wasDue ? { plannedEnd: null } : {}),
          // Only filled in, never overwritten: a number corrected in the app stays.
          ...(!existing.jobNumber && titleJobNumber ? { jobNumber: titleJobNumber } : {}),
          ...(card.dueComplete && !existing.doneAt ? { doneAt: new Date() } : {}),
        },
      })
      if (named !== existing.customerId) await dropGuessedCustomer(existing.customerId)
      await fillExisting(existing.id)
      await afterWrite(existing.id)
      updated++
      continue
    }

    const fill = hasFields(fields) ? await fieldData(fields, matched.ids, null, places) : { data: {}, tradeIds: [] as string[] }
    if (Object.keys(fill.data).length > 0 || fill.tradeIds.length > 0) fieldsTaken++
    const data = {
      ...cardData,
      customerId: await customerId(),
      externalSystem: 'trello',
      externalId,
      jobNumber: titleJobNumber,
      doneAt: card.dueComplete ? new Date() : undefined,
      ...fill.data,
      ...(fill.tradeIds.length ? { workCategories: { create: fill.tradeIds.map((workCategoryId) => ({ workCategoryId })) } } : {}),
    }
    // The next number, drawn afresh when a card made elsewhere took it this
    // very moment — the same once-more the API and the forms allow themselves.
    const createdProject = await db.project
      .create({ data: { ...data, number: await nextProjectNumber() }, select: { id: true } })
      .catch(async (e: unknown) => {
        if (!isUniqueClash(e)) throw e
        return db.project.create({ data: { ...data, number: await nextProjectNumber() }, select: { id: true } })
      })
    await afterWrite(createdProject.id)
    created++
  }

  const columns = makeBoard ? await mirrorBoard(board, mapping) : 0

  // The board's checklists as templates to reuse — one per name, the items
  // that name ever had; a template of that name already there is left alone.
  let templates = 0
  if (want.templates) {
    const last = await db.checklistTemplate.aggregate({ _max: { sortOrder: true } })
    let sortOrder = (last._max.sortOrder ?? -1) + 1
    for (const template of checklistTemplatesOf(board.checklists.filter((cl) => takenCardIds.has(cl.idCard)))) {
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

  const result: TrelloImportResult = {
    created,
    updated,
    customersCreated,
    ignored,
    flagged,
    comments,
    checklists,
    links,
    templates,
    fields: fieldsTaken,
    columns,
    unknownMembers: [...unknownMembers].sort(),
  }
  await audit({
    userId,
    action: 'import.trello',
    entity: 'System',
    entityId: 'trello',
    newValue: importSummary(board.name, result),
  })
  return result
}

const validDate = (iso: string): Date | null => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The calendar day in Germany a Trello moment falls on, as the UTC-midnight date the schedule keeps. */
function utcDay(moment: Date): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(moment)
  return new Date(`${day}T00:00:00.000Z`)
}

/**
 * A customer an earlier import guessed from a card title, once its last
 * project has moved to the customer the card names: gone, if nobody has
 * written anything on it since.
 */
async function dropGuessedCustomer(id: string): Promise<void> {
  const customer = await db.customer.findUnique({ where: { id }, include: { _count: { select: { projects: true } } } })
  if (!customer || customer._count.projects > 0) return
  const { number, company, contactPerson, phone, email, street, city, postalCode, notes } = customer
  if ([number, company, contactPerson, phone, email, street, city, postalCode, notes].some(Boolean)) return
  await db.customer.delete({ where: { id } }).catch(() => {})
}

/**
 * The Trello board as a board here: a column per open list, in Trello's
 * order, each mirroring its list (docs/CHANGE-trello-list-columns.md). A list
 * some board mirrors already is left where it is; the rest go to the board
 * that mirrors its neighbours, else to one of the Trello board's name.
 * Returns how many columns were added.
 */
async function mirrorBoard(board: TrelloBoard, mapping: Map<string, ProjectStatus | 'SKIP'>): Promise<number> {
  const lists = board.lists.filter((l) => !l.closed && mapping.get(l.id) !== 'SKIP' && mapping.has(l.id))
  if (lists.length === 0) return 0
  const mirrored = await db.boardColumn.findMany({
    where: { rule: { in: lists.map((l) => `${TRELLO_RULE_PREFIX}${l.id}`) } },
    select: { rule: true, boardId: true },
  })
  const have = new Set(mirrored.map((c) => c.rule))
  const missing = lists.filter((l) => !have.has(`${TRELLO_RULE_PREFIX}${l.id}`))
  if (missing.length === 0) return 0

  let boardId = mirrored[0]?.boardId ?? (await db.board.findFirst({ where: { name: board.name }, select: { id: true } }))?.id
  if (!boardId) {
    const last = await db.board.aggregate({ _max: { sortOrder: true } })
    boardId = (await db.board.create({ data: { name: board.name, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select: { id: true } })).id
  }
  const tail = await db.boardColumn.aggregate({ where: { boardId }, _max: { sortOrder: true } })
  let sortOrder = (tail._max.sortOrder ?? -1) + 1
  for (const list of missing) {
    await db.boardColumn.create({
      data: { boardId, status: mapping.get(list.id) as ProjectStatus, title: list.name, rule: `${TRELLO_RULE_PREFIX}${list.id}`, sortOrder: sortOrder++ },
    })
  }
  return missing.length
}
