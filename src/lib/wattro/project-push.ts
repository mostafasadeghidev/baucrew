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
 *   offers, internal notes and customer data stay here.
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
  trigger: 'created' | 'status' | 'updated' | 'timer' = 'updated'
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

// ── Catching up ──────────────────────────────────────────────────────────
// A push that failed (Wattro down, key rejected) is tried again by the timer.
// Only projects created after the switch was first turned on are caught up:
// the 200-odd running jobs that existed before are a deliberate backfill, not
// something that happens by itself.

const FROM_KEY = 'wattro.projectPushFrom'

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
  const pending = await db.project.findMany({
    where: {
      createdAt: { gte: since },
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
