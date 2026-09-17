import 'server-only'
import { db } from './db'
import { orderValue } from './reports'
import { emitEvent } from './webhooks'
import { projectChanges, statusSinceOf, type ProjectSnapshot } from './webhook-events'
import { INVOICE_KIND, type InvoicePart } from './invoices'

/**
 * A project's life told to automations: made, moved to another status,
 * changed, deleted, an invoice ready. Every place that does one of these takes
 * a snapshot before and announces after; what changed is worked out here, once.
 *
 * The body carries the whole project — customer contact, manager, dates,
 * money, links to other systems — so an automation rarely has to ask again.
 * Money goes too: endpoints are set up by an administrator.
 */

/** Who did it, so an automation can tell its own changes coming back from the office's. */
export type EventActor =
  | { type: 'user'; userId: string | null }
  | { type: 'api'; userId: string; key: string | null }
  | { type: 'system'; reason: string }

const eventSelect = {
  id: true,
  number: true,
  name: true,
  status: true,
  isSub: true,
  customerId: true,
  managerId: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  price: true,
  street: true,
  postalCode: true,
  city: true,
  description: true,
  sourceCreatedAt: true,
  createdAt: true,
  customer: { select: { id: true, name: true, company: true, contactPerson: true, email: true, phone: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  addOns: { select: { amount: true } },
  links: { select: { system: true, externalId: true, url: true }, orderBy: { system: 'asc' as const } },
  invoices: { select: { part: true, number: true, amount: true, readyAt: true }, orderBy: { part: 'asc' as const } },
} as const

type EventRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

function loadRow(id: string) {
  return db.project.findUnique({ where: { id }, select: eventSelect })
}

function snapshotOf(row: EventRow): ProjectSnapshot {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    customerId: row.customerId,
    managerId: row.managerId,
    plannedStart: day(row.plannedStart),
    plannedEnd: day(row.plannedEnd),
    actualStart: day(row.actualStart),
    actualEnd: day(row.actualEnd),
    price: row.price === null ? null : Number(row.price),
    orderValue: orderValue(row.price, row.addOns),
    isSub: row.isSub,
    street: row.street,
    postalCode: row.postalCode,
    city: row.city,
    description: row.description,
  }
}

async function lastStatusChange(projectId: string): Promise<Date | null> {
  const row = await db.auditLog.findFirst({
    where: { entity: 'Project', entityId: projectId, field: 'status' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row?.createdAt ?? null
}

/** The project as an event carries it. */
function projectBody(row: EventRow, statusSince: Date) {
  const snapshot = snapshotOf(row)
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    status: row.status,
    statusSince: statusSince.toISOString(),
    isSub: row.isSub,
    customer: row.customer,
    manager: row.manager ? { id: row.manager.id, name: `${row.manager.firstName} ${row.manager.lastName}`.trim() } : null,
    address: { street: row.street, postalCode: row.postalCode, city: row.city },
    plannedStart: snapshot.plannedStart,
    plannedEnd: snapshot.plannedEnd,
    actualStart: snapshot.actualStart,
    actualEnd: snapshot.actualEnd,
    price: snapshot.price,
    orderValue: snapshot.orderValue,
    description: row.description,
    links: row.links,
    /** The invoices marked ready so far. */
    invoices: row.invoices.map(invoiceBody),
  }
}

function invoiceBody(invoice: EventRow['invoices'][number]) {
  return {
    part: invoice.part,
    kind: INVOICE_KIND[invoice.part as InvoicePart],
    number: invoice.number,
    amount: invoice.amount === null ? null : Number(invoice.amount),
    readyAt: invoice.readyAt.toISOString(),
  }
}

/** What a project was before a change — to hand to `announceProjectChanges` after it. */
export type ProjectBefore = { snapshot: ProjectSnapshot; body: ReturnType<typeof projectBody> } | null

export async function projectBefore(id: string): Promise<ProjectBefore> {
  try {
    const row = await loadRow(id)
    if (!row) return null
    const since = statusSinceOf(await lastStatusChange(id), row.sourceCreatedAt, row.createdAt)
    return { snapshot: snapshotOf(row), body: projectBody(row, since) }
  } catch (e) {
    console.error('project snapshot failed', e)
    return null
  }
}

export async function announceProjectCreated(id: string, actor: EventActor): Promise<void> {
  try {
    const row = await loadRow(id)
    if (!row) return
    const since = statusSinceOf(await lastStatusChange(id), row.sourceCreatedAt, row.createdAt)
    await emitEvent('project.created', { project: projectBody(row, since), actor })
  } catch (e) {
    console.error('project event failed', e)
  }
}

/**
 * Compares the project now with what it was and tells what changed: a new
 * status as `project.status_changed`, anything else as `project.updated`.
 * Nothing changed, nothing is told — which is also what ends a round trip of
 * an automation writing back what it was just told.
 */
export async function announceProjectChanges(before: ProjectBefore, actor: EventActor): Promise<void> {
  if (!before) return
  try {
    const row = await loadRow(before.snapshot.id)
    if (!row) return
    const { status, fields } = projectChanges(before.snapshot, snapshotOf(row))
    if (!status && Object.keys(fields).length === 0) return
    // A status that changed just now stands since now.
    const since = status ? new Date() : statusSinceOf(await lastStatusChange(row.id), row.sourceCreatedAt, row.createdAt)
    const project = projectBody(row, since)
    if (status) await emitEvent('project.status_changed', { project, from: status.from, to: status.to, actor })
    if (Object.keys(fields).length > 0) await emitEvent('project.updated', { project, changes: fields, actor })
  } catch (e) {
    console.error('project event failed', e)
  }
}

/** A status set without a snapshot before it — the automatic moves done in one SQL statement. */
export async function announceStatusChange(id: string, from: string, actor: EventActor): Promise<void> {
  try {
    const row = await loadRow(id)
    if (!row || row.status === from) return
    await emitEvent('project.status_changed', { project: projectBody(row, new Date()), from, to: row.status, actor })
  } catch (e) {
    console.error('project event failed', e)
  }
}

export async function announceProjectDeleted(
  before: ProjectBefore,
  actor: EventActor,
  mergedInto?: { id: string; number: string }
): Promise<void> {
  if (!before) return
  await emitEvent('project.deleted', { project: before.body, ...(mergedInto ? { mergedInto } : {}), actor })
}

/**
 * The office marked one of the two invoices ready: the automation prepares the
 * e-mail. The body carries the invoice and the whole project around it.
 */
export async function announceInvoiceReady(projectId: string, part: InvoicePart, actor: EventActor): Promise<void> {
  try {
    const row = await loadRow(projectId)
    const invoice = row?.invoices.find((i) => i.part === part)
    if (!row || !invoice) return
    const since = statusSinceOf(await lastStatusChange(projectId), row.sourceCreatedAt, row.createdAt)
    await emitEvent('invoice.ready', { invoice: invoiceBody(invoice), project: projectBody(row, since), actor })
  } catch (e) {
    console.error('invoice event failed', e)
  }
}

/** Somebody as an event names them: the account, and the person behind it. */
function personBody(user: { id: string; username: string; employee: { firstName: string; lastName: string } | null }) {
  return {
    id: user.id,
    username: user.username,
    name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}`.trim() : user.username,
  }
}

const personSelect = { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } as const

/**
 * Somebody wrote on the project. The body carries the comment with the people
 * it names, so an automation can reach them, and the whole project around it.
 */
export async function announceCommentCreated(noteId: string, actor: EventActor): Promise<void> {
  try {
    const note = await db.note.findUnique({
      where: { id: noteId },
      select: { id: true, projectId: true, body: true, visibility: true, mentions: true, createdAt: true, author: { select: personSelect } },
    })
    if (!note) return
    const row = await loadRow(note.projectId)
    if (!row) return
    const named = note.mentions.length
      ? await db.user.findMany({ where: { id: { in: note.mentions } }, select: personSelect })
      : []
    const since = statusSinceOf(await lastStatusChange(row.id), row.sourceCreatedAt, row.createdAt)
    await emitEvent('comment.created', {
      comment: {
        id: note.id,
        body: note.body,
        office: note.visibility === 'MANAGEMENT',
        createdAt: note.createdAt.toISOString(),
        author: note.author ? personBody(note.author) : null,
        mentions: named.map(personBody),
      },
      project: projectBody(row, since),
      actor,
    })
  } catch (e) {
    console.error('comment event failed', e)
  }
}

/** Since when each project has stood in its status, for many at once. */
export async function statusSinceFor(
  rows: Array<{ id: string; sourceCreatedAt: Date | null; createdAt: Date }>
): Promise<Map<string, Date>> {
  const changes = rows.length
    ? await db.auditLog.groupBy({
        by: ['entityId'],
        where: { entity: 'Project', field: 'status', entityId: { in: rows.map((r) => r.id) } },
        _max: { createdAt: true },
      })
    : []
  const last = new Map(changes.map((c) => [c.entityId, c._max.createdAt]))
  return new Map(rows.map((r) => [r.id, statusSinceOf(last.get(r.id) ?? null, r.sourceCreatedAt, r.createdAt)]))
}
