import 'server-only'

import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import {
  createWattroProject,
  fetchProjectByHumanId,
  fetchProjectById,
  isProjectPushEnabled,
  patchWattroProject,
  WattroApiError,
  type WattroProjectRecord,
} from './client'
import {
  projectPatch,
  PUSH_STATUSES,
  shouldCreateInWattro,
  toWattroProject,
  type PushableProject,
} from './projects'

/**
 * Sends one project to Wattro: creates it there under its number, or brings
 * the one that is there up to date. The only code that writes to Wattro.
 *
 * Rules that keep it harmless:
 * - Off unless WATTRO_PROJECT_PUSH=1 (see client.ts).
 * - It never throws. A project is saved whether or not Wattro answers; a
 *   failure lands in the audit log and the project is tried again later.
 * - The number is the identity: the client's Projektnummer when the project
 *   has one, the app's own otherwise. A project Wattro already holds under it
 *   is adopted, not created twice; names are never used to match. A project
 *   whose number changed is renamed in Wattro (found by the id kept in its
 *   link), not made again.
 * - Only name, number, address, contact, phone and finished travel. Prices,
 *   offers, internal notes and customer data stay here. The name only once,
 *   when the project is made there: Wattro keeps it (projects.ts).
 * - Nothing is ever deleted in Wattro.
 */

export type PushFailure = WattroApiError['kind'] | 'database'
export type PushOutcome =
  | { ok: true; result: 'created' | 'adopted' | 'updated' | 'renamed' | 'unchanged' | 'skipped' | 'off' }
  | { ok: false; error: PushFailure }

const projectSelect = {
  id: true,
  number: true,
  jobNumber: true,
  name: true,
  status: true,
  archivedAt: true,
  street: true,
  postalCode: true,
  city: true,
  phone: true,
  contact: true,
  links: { where: { system: 'wattro' }, select: { id: true, externalId: true } },
} as const

// Two events for one project can arrive back to back (made, then edited): they
// run one after the other, so the second finds what the first created.
const queues = new Map<string, Promise<unknown>>()

function inOrder<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(job)
  queues.set(key, run)
  // Cleanup that cannot itself reject: the caller handles the job's own failure.
  const done = () => {
    if (queues.get(key) === run) queues.delete(key)
  }
  run.then(done, done)
  return run
}

/** Saves the link between a project and its Wattro record. */
async function remember(projectId: string, record: WattroProjectRecord) {
  const externalId = String(record.id)
  await db.projectLink.upsert({
    where: { projectId_system: { projectId, system: 'wattro' } },
    update: { externalId },
    create: { projectId, system: 'wattro', externalId },
  })
}

async function pushOnce(projectId: string, trigger: string, mayCreate: boolean): Promise<PushOutcome> {
  if (!isProjectPushEnabled()) return { ok: true, result: 'off' }
  const project = await db.project.findUnique({ where: { id: projectId }, select: projectSelect })
  if (!project) return { ok: true, result: 'skipped' }

  const linked = project.links.length > 0
  // A plain edit only keeps a project Wattro already has up to date; making it
  // there is for a new project or a new status.
  if (!linked && !(mayCreate && shouldCreateInWattro(project))) return { ok: true, result: 'skipped' }

  const body = toWattroProject(project as PushableProject)
  let result: 'created' | 'adopted' | 'updated' | 'renamed' | 'unchanged'

  let existing = await fetchProjectByHumanId(body.human_id)
  // Linked, but no longer under this number: the number was changed here.
  // Wattro holds it under the old one, found by the id the link keeps.
  let renamedFrom: string | null = null
  if (!existing && linked) {
    const byId = await fetchProjectById(Number(project.links[0].externalId))
    if (byId?.humanId && byId.humanId !== body.human_id) {
      existing = byId
      renamedFrom = byId.humanId
    }
  }
  if (!existing) {
    // Linked before but gone in Wattro, or never sent: it is made again only
    // when it is a project Wattro should have.
    if (!shouldCreateInWattro(project)) return { ok: true, result: 'skipped' }
    let record: WattroProjectRecord
    try {
      record = await createWattroProject(body)
      result = 'created'
    } catch (e) {
      // Lost a race with another server or a repeat: it is there now.
      const now = e instanceof WattroApiError && e.kind === 'upstream' ? await fetchProjectByHumanId(body.human_id) : null
      if (!now) throw e
      record = now
      result = 'adopted'
    }
    await remember(project.id, record)
  } else {
    const patch = projectPatch(body, {
      human_id: existing.humanId,
      name: existing.name,
      contact: existing.contact,
      address: existing.address,
      phone: existing.phone,
      finished: existing.finished,
    })
    const record = Object.keys(patch).length > 0 ? await patchWattroProject(renamedFrom ?? body.human_id, patch) : existing
    result = !linked ? 'adopted' : renamedFrom ? 'renamed' : Object.keys(patch).length > 0 ? 'updated' : 'unchanged'
    if (!linked || project.links[0].externalId !== String(record.id)) await remember(project.id, record)
  }

  if (result !== 'unchanged') {
    await audit({
      userId: null,
      action: 'project.wattroPush',
      entity: 'Project',
      entityId: project.id,
      newValue: `${trigger} ${result} ${renamedFrom ? `${renamedFrom} → ` : ''}${body.human_id}`,
    })
  }
  return { ok: true, result }
}

export async function pushProjectToWattro(
  projectId: string,
  trigger: 'created' | 'status' | 'updated' | 'timer' | 'import' = 'updated'
): Promise<PushOutcome> {
  if (!isProjectPushEnabled()) return { ok: true, result: 'off' }
  try {
    return await inOrder(projectId, () => pushOnce(projectId, trigger, trigger !== 'updated'))
  } catch (e) {
    const error: PushFailure = e instanceof WattroApiError ? e.kind : 'database'
    await audit({
      userId: null,
      action: 'project.wattroPushFailed',
      entity: 'Project',
      entityId: projectId,
      newValue: `${trigger} ${error}${e instanceof WattroApiError && e.status ? ` ${e.status}` : ''}`,
    })
    console.warn('wattro: project push failed', { projectId, error })
    return { ok: false, error }
  }
}

// ── After an import ──────────────────────────────────────────────────────
// The Trello sync writes a card's list straight into the project, past the
// forms and their events. While the office still works in Trello that is how
// nearly every job becomes "In Ausführung" — so the sync hands what it moved
// to this, or Wattro never hears of it.

/** A project an import changed in a way Wattro should hear of (`wattroChangeOf`). */
export type ImportedChange = { id: string; change: 'status' | 'updated'; linked: boolean }

/**
 * More new sites than this out of one run is not somebody moving cards: a list
 * given another status, a board read anew. Those are held back and noted in
 * the audit log, like the stock from before the push — sending them is a
 * person's decision, not something that happens by itself.
 */
export const MAX_CREATED_PER_IMPORT = 20

/** Sends what one import run changed, one project after the other. Never throws. */
export async function pushImportedProjects(changes: ImportedChange[], source: string): Promise<{ sent: number; held: number }> {
  if (!isProjectPushEnabled() || changes.length === 0) return { sent: 0, held: 0 }
  const creating = changes.filter((c) => !c.linked)
  const hold = creating.length > MAX_CREATED_PER_IMPORT
  if (hold) {
    console.warn('wattro: too many projects moved at once, none of them created', { source, count: creating.length })
    await audit({
      userId: null,
      action: 'project.wattroPushHeld',
      entity: 'System',
      entityId: 'wattro',
      newValue: `${source}: ${creating.length} projects moved at once, not created`,
    })
  }
  let sent = 0
  for (const c of hold ? changes.filter((c) => c.linked) : changes) {
    // A failure is in the audit log and the timer tries it again: go on with the rest.
    const outcome = await pushProjectToWattro(c.id, c.change === 'status' ? 'import' : 'updated')
    if (outcome.ok && !['skipped', 'unchanged', 'off'].includes(outcome.result)) sent++
  }
  return { sent, held: hold ? creating.length : 0 }
}

// ── Catching up ──────────────────────────────────────────────────────────
// A push that failed (Wattro down, key rejected) is tried again by the timer:
// for a project created after the switch was first turned on, and for an older
// one whose push failed within the last days. Nothing else — the 200-odd
// running jobs that existed before are a deliberate backfill, not something
// that happens by itself.

const FROM_KEY = 'wattro.projectPushFrom'
const RETRY_FAILED_DAYS = 7

async function pushFrom(): Promise<Date> {
  const row = await db.appSetting.findUnique({ where: { key: FROM_KEY } })
  if (row) return new Date(row.value)
  const now = new Date()
  await db.appSetting.upsert({ where: { key: FROM_KEY }, update: {}, create: { key: FROM_KEY, value: now.toISOString() } })
  return now
}

/** Sends a project without holding the caller up: a save never waits for Wattro. */
export function pushProjectInBackground(projectId: string, trigger: 'created' | 'status' | 'updated') {
  if (!isProjectPushEnabled()) return
  void pushProjectToWattro(projectId, trigger)
}

/** Retries the projects an event could not send. A few per look, so a slow Wattro is not hammered. */
export async function pushPendingProjects(limit = 10): Promise<number> {
  if (!isProjectPushEnabled()) return 0
  const since = await pushFrom()
  // An older project is tried again only where a push of it failed lately — a
  // card moved in Trello while Wattro did not answer. Once it is linked it
  // drops out of the query below by itself.
  const retryFrom = new Date(Math.max(since.getTime(), Date.now() - RETRY_FAILED_DAYS * 86_400_000))
  const failed = await db.auditLog.findMany({
    where: { action: 'project.wattroPushFailed', entity: 'Project', createdAt: { gte: retryFrom } },
    distinct: ['entityId'],
    select: { entityId: true },
    take: 200,
  })
  const pending = await db.project.findMany({
    where: {
      OR: [{ createdAt: { gte: since } }, { id: { in: failed.map((f) => f.entityId) } }],
      status: { in: [...PUSH_STATUSES] as never },
      archivedAt: null,
      links: { none: { system: 'wattro' } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })
  let sent = 0
  for (const { id } of pending) {
    const outcome = await pushProjectToWattro(id, 'timer')
    // Wattro not answering or the key refused: stop, the next look tries again.
    // One project Wattro refuses (a 400) must not hold the others back.
    if (!outcome.ok && ['network', 'auth', 'rateLimit'].includes(outcome.error)) break
    if (outcome.ok) sent++
  }
  return sent
}
