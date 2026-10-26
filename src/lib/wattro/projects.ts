import { wattroKeyOf } from '@/lib/job-number'

/**
 * Which of this app's projects Wattro gets, and what it is told about them.
 * Pure: no HTTP, no database, so every rule is tested without either.
 *
 * Wattro's project is the place a machine is booked to ("Baustelle"): the
 * crews pick it in the Wattro app when they take a tool out. So it needs a
 * name, a number to recognise it by and where it is — nothing about money,
 * offers or the office's own notes. Those never travel.
 */

/** Wattro's own limits (OpenAPI 1.10.0, `ProjectIn`). */
export const WATTRO_LIMITS = { name: 100, humanId: 50, contact: 100, address: 200, phone: 20 } as const

/**
 * A project reaches Wattro once the job is certain enough to have machines
 * booked to it. Leads and offers stay out — the app holds hundreds of them and
 * the crews would have to scroll past every one in Wattro's project list.
 */
export const PUSH_STATUSES: readonly string[] = ['APPROVED', 'PLANNED', 'IN_PROGRESS']

/** Statuses that close the site in Wattro (`finished`) when the project was sent before. */
const FINISHED_STATUSES: readonly string[] = ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']

export type PushableProject = {
  number: string
  /** The client's own project number; Wattro's ID for the project when set. */
  jobNumber: string | null
  name: string
  status: string
  archivedAt: Date | null
  street: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  contact: string | null
}

/** The body Wattro takes to create a project; `patch` sends the same without the number. */
export type WattroProjectBody = {
  name: string
  human_id: string
  contact: string | null
  address: string | null
  phone: string | null
  finished: boolean
}

const clip = (value: string, max: number) => value.trim().slice(0, max)
const orNull = (value: string | null | undefined, max: number) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text ? clip(text, max) : null
}

/** "Musterstraße 1, 12345 Musterstadt" — whatever part of it is known. */
export function addressLine(p: Pick<PushableProject, 'street' | 'postalCode' | 'city'>): string | null {
  const town = [p.postalCode?.trim(), p.city?.trim()].filter(Boolean).join(' ')
  const line = [p.street?.trim(), town].filter(Boolean).join(', ')
  return line ? clip(line, WATTRO_LIMITS.address) : null
}

/**
 * Wattro takes at most 20 characters for a phone number, and a longer one is
 * refused with the whole request. A number that does not fit is left out
 * rather than cut — half a number is worse than none.
 */
export function wattroPhone(phone: string | null): string | null {
  const text = (phone ?? '').replace(/\s+/g, ' ').trim()
  return text && text.length <= WATTRO_LIMITS.phone ? text : null
}

/** Is this project one Wattro should have *created*? Linked projects are updated whatever their status. */
export function shouldCreateInWattro(p: Pick<PushableProject, 'status' | 'archivedAt'>): boolean {
  return PUSH_STATUSES.includes(p.status) && p.archivedAt === null
}

/** Done, lost or put away: Wattro hides the site from the crews' pick list. */
export function isFinishedForWattro(p: Pick<PushableProject, 'status' | 'archivedAt'>): boolean {
  return FINISHED_STATUSES.includes(p.status) || p.archivedAt !== null
}

export function toWattroProject(p: PushableProject): WattroProjectBody {
  return {
    name: clip(p.name, WATTRO_LIMITS.name) || p.number,
    human_id: clip(wattroKeyOf(p), WATTRO_LIMITS.humanId),
    contact: orNull(p.contact, WATTRO_LIMITS.contact),
    address: addressLine(p),
    phone: wattroPhone(p.phone),
    finished: isFinishedForWattro(p),
  }
}

/** What Wattro keeps of a project, as read back — the part we compare. */
export type WattroProjectState = Partial<Omit<WattroProjectBody, 'human_id'>> & { human_id?: string | null }

/**
 * The fields that differ from what Wattro holds — an empty object means
 * nothing to send. A field Wattro filled in by hand and we leave empty is not
 * emptied: only a value of ours replaces it, except `finished`, which is
 * always ours to say.
 */
export function projectPatch(body: WattroProjectBody, current: WattroProjectState): Partial<WattroProjectBody> {
  const patch: Partial<WattroProjectBody> = {}
  if (body.name !== (current.name ?? '').trim()) patch.name = body.name
  // A project Wattro holds under another number is renamed (project-push.ts).
  if (current.human_id != null && body.human_id !== current.human_id) patch.human_id = body.human_id
  for (const key of ['contact', 'address', 'phone'] as const) {
    const ours = body[key]
    if (ours !== null && ours !== (current[key] ?? null)) patch[key] = ours
  }
  if (body.finished !== Boolean(current.finished)) patch.finished = body.finished
  return patch
}
