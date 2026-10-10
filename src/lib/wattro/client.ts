import 'server-only'

import { z } from 'zod'
import {
  ASSET_PAGE_SIZE,
  type AssetPage,
  type WattroAsset,
} from './assets'

/**
 * The server-side Wattro client. Everything authenticated stays here, on the
 * server: the API key is read from the environment at call time, is sent only
 * in the Authorization header, and is never logged, returned, or put in an
 * error message.
 *
 * Wattro's contract (api-docs at /api/v1/docs, OpenAPI under
 * /api/v1/openapi.json): bearer token on every call, list endpoints answer
 * `{ items: [...], count: n }`, the asset list paginates with limit/offset and
 * filters with `active` (default true — inactive assets must be asked for
 * explicitly). Errors: 401 `{"detail": "Unauthorized"}` for a rejected key.
 */

/**
 * The API root — the environment lives entirely in this URL, not in the paths
 * below. The default is Wattro's development host and is for development
 * only: in production an unset WATTRO_BASE_URL means "not configured", so a
 * production key can never be sent to the dev environment by accident.
 */
export const WATTRO_DEFAULT_BASE_URL = 'https://api-dev.wattro.io/api/v1'

const TIMEOUT_MS = 15_000
/** Retries only what is safe to repeat: reading a list is idempotent. */
const RETRY_DELAYS_MS = [500, 1500]

export type WattroConfig = {
  baseUrl: string
  /** Null = not configured; the sync stays off until a key is set. */
  apiKey: string | null
}

let warnedAboutMissingBaseUrl = false

export function wattroConfig(): WattroConfig {
  const explicitBaseUrl = process.env.WATTRO_BASE_URL?.trim() || null
  const apiKey = process.env.WATTRO_API_KEY?.trim() || null
  if (!explicitBaseUrl && process.env.NODE_ENV === 'production') {
    // No dev-host fallback in production: a key without a confirmed API root
    // leaves the sync off, and the operator is told once why.
    if (apiKey && !warnedAboutMissingBaseUrl) {
      warnedAboutMissingBaseUrl = true
      console.warn('wattro: WATTRO_API_KEY is set but WATTRO_BASE_URL is not — the sync stays off until the production API root is configured')
    }
    return { baseUrl: WATTRO_DEFAULT_BASE_URL, apiKey: null }
  }
  const baseUrl = (explicitBaseUrl ?? WATTRO_DEFAULT_BASE_URL).replace(/\/+$/, '')
  return { baseUrl, apiKey }
}

export function isWattroConfigured(): boolean {
  return wattroConfig().apiKey !== null
}

export type WattroRequestError =
  | 'auth'
  | 'rateLimit'
  | 'network'
  | 'upstream'
  | 'response'

export class WattroApiError extends Error {
  readonly kind: WattroRequestError
  readonly status?: number

  constructor(kind: WattroRequestError, message: string, status?: number) {
    super(message)
    this.name = 'WattroApiError'
    this.kind = kind
    this.status = status
  }
}

// What Wattro's answer must look like for us to go on. The envelope is
// strict — a different shape means the contract moved and the run stops. A
// single asset inside may be incomplete; it is skipped and counted instead,
// so one broken record does not hold the whole list hostage.
const pageSchema = z.object({
  items: z.array(z.unknown()),
  count: z.number(),
})

// Wattro's spec requires only name, tags and updated_at on an asset (id we
// insist on — it is the link); the optional fields may be sent as null or
// left out, and both mean "none". A missing `active` is Wattro's own
// default: true.
const assetSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  human_id: z.string().nullish(),
  storage_location: z.string().nullish(),
  active: z.boolean().nullish(),
  updated_at: z.string(),
  current_assignment: z
    .object({ assignee_id: z.number(), assignee_type: z.string() })
    .nullish(),
})

// The rest of the record is only shown, never owned: a field in a shape we do
// not expect reads as "none" instead of throwing the whole machine away.
const text = z.string().nullish().catch(null)
const id = z.number().int().nullish().catch(null)
const ref = z
  .object({ id: z.number().int(), name: z.string() })
  .nullish()
  .catch(null)
const extraSchema = z.object({
  created_at: text,
  brand: text,
  model: text,
  serial_number: text,
  notes: text,
  price: text,
  purchased_at: text,
  tags: z
    .array(z.object({ name: z.string() }).nullable().catch(null))
    .nullish()
    .catch(null),
  home_employee: ref,
  home_store: ref,
  last_assign_ts: text,
  inspection_ts: text,
  reservation_end_ts: text,
  nameplate_image: text,
  last_seen_ts: text,
  last_seen_trigger: text,
  last_seen_by_employee: id,
  last_seen_by_terminal: id,
  last_position_ts: text,
  last_position_latitude: text,
  last_position_longitude: text,
  gps_mode: text,
})

function toAsset(raw: unknown): WattroAsset | null {
  const parsed = assetSchema.safeParse(raw)
  if (!parsed.success) return null
  const d = parsed.data
  const x = extraSchema.parse(raw)
  return {
    id: d.id,
    name: d.name,
    humanId: d.human_id ?? null,
    storageLocation: d.storage_location ?? null,
    active: d.active ?? true,
    updatedAt: d.updated_at,
    currentAssignment: d.current_assignment
      ? { assigneeId: d.current_assignment.assignee_id, assigneeType: d.current_assignment.assignee_type }
      : null,
    extra: {
      createdAt: x.created_at ?? null,
      brand: x.brand ?? null,
      model: x.model ?? null,
      serialNumber: x.serial_number ?? null,
      notes: x.notes ?? null,
      price: x.price ?? null,
      purchasedAt: x.purchased_at ?? null,
      tags: (x.tags ?? []).flatMap((t) => (t ? [t.name] : [])),
      homeEmployee: x.home_employee ?? null,
      homeStore: x.home_store ?? null,
      lastAssignAt: x.last_assign_ts ?? null,
      inspectionAt: x.inspection_ts ?? null,
      reservationEndAt: x.reservation_end_ts ?? null,
      nameplateImage: x.nameplate_image ?? null,
      lastSeenAt: x.last_seen_ts ?? null,
      lastSeenTrigger: x.last_seen_trigger ?? null,
      lastSeenByEmployeeId: x.last_seen_by_employee ?? null,
      lastSeenByTerminalId: x.last_seen_by_terminal ?? null,
      positionAt: x.last_position_ts ?? null,
      latitude: x.last_position_latitude ?? null,
      longitude: x.last_position_longitude ?? null,
      gpsMode: x.gps_mode ?? null,
    },
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wattro's Retry-After, in seconds (its throttle guard sends one with a 429).
 * Null when the header is missing or not a plain number — then our own
 * backoff applies. An absent header must not read as "retry at once":
 * Number(null) is 0.
 */
export function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after')?.trim()
  if (!raw) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}

/** The longest Wattro may ask us to wait before a click gives up instead. */
const MAX_RETRY_WAIT_MS = 30_000

/**
 * One authenticated GET, answered as parsed JSON. Retries cover network
 * hiccups, timeouts, 429 and 5xx — reading is safe to repeat; 401/403 means
 * the key is wrong and a retry would only repeat the rejection.
 */
async function getJson(path: string, query: Record<string, string> = {}): Promise<unknown> {
  const config = wattroConfig()
  if (!config.apiKey) throw new WattroApiError('auth', 'Wattro API key is not configured')

  const url = new URL(`${config.baseUrl}${path}`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      })
    } catch (e) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw new WattroApiError('network', `Wattro request failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }

    if (res.ok) {
      try {
        return await res.json()
      } catch {
        throw new WattroApiError('response', 'Wattro answered something that is not JSON', res.status)
      }
    }

    if (res.status === 401 || res.status === 403) {
      console.warn('wattro: the API key was rejected', { status: res.status })
      throw new WattroApiError('auth', 'Wattro rejected the API key', res.status)
    }

    const retryable = res.status === 429 || res.status >= 500
    const wait = retryAfterMs(res) ?? RETRY_DELAYS_MS[attempt]
    // A longer wait than a person watches a spinner for ends the run instead;
    // retrying early would only be throttled again.
    if (retryable && attempt < RETRY_DELAYS_MS.length && wait <= MAX_RETRY_WAIT_MS) {
      await sleep(wait)
      continue
    }
    if (res.status === 429) {
      throw new WattroApiError('rateLimit', 'Wattro is rate-limiting requests', res.status)
    }
    throw new WattroApiError('upstream', `Wattro responded with ${res.status}`, res.status)
  }
}

/**
 * One page of the asset list. A page size of ASSET_PAGE_SIZE is asked for
 * explicitly rather than trusting the server default.
 */
export const fetchAssetPage = async ({
  active,
  offset,
  limit = ASSET_PAGE_SIZE,
}: {
  active: boolean
  offset: number
  limit?: number
}): Promise<AssetPage> => {
  const body = await getJson('/asset/', {
    active: String(active),
    limit: String(limit),
    offset: String(offset),
  })
  const parsed = pageSchema.safeParse(body)
  if (!parsed.success) {
    throw new WattroApiError('response', 'Wattro answered in an unexpected shape')
  }
  const items: WattroAsset[] = []
  let invalid = 0
  for (const raw of parsed.data.items) {
    const asset = toAsset(raw)
    if (asset) items.push(asset)
    else invalid++
  }
  return { items, invalid, count: parsed.data.count }
}

// Wattro's employee and project lists come whole, as plain arrays. Only what
// names a machine's place is read — no phone numbers, e-mails or NFC ids.
const listSchema = z.array(z.unknown())
const employeeSchema = z.object({ id: z.number().int(), name: z.string() })
const projectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  human_id: z.string().nullish().catch(null),
  address: z.string().nullish().catch(null),
  finished: z.boolean().nullish().catch(null),
})

async function getList<T>(path: string, item: z.ZodType<T>): Promise<T[]> {
  const parsed = listSchema.safeParse(await getJson(path))
  if (!parsed.success) {
    throw new WattroApiError('response', 'Wattro answered in an unexpected shape')
  }
  return parsed.data.flatMap((raw) => {
    const one = item.safeParse(raw)
    return one.success ? [one.data] : []
  })
}

/** Wattro's people by id — to name who holds a machine and who scanned it last. */
export async function fetchEmployees(): Promise<Map<number, string>> {
  const rows = await getList('/employee/', employeeSchema)
  return new Map(rows.map((e) => [e.id, e.name.trim()]))
}

/** Wattro's projects (finished ones too — a machine may still stand on one) by id. */
export async function fetchProjects(): Promise<
  Map<number, { name: string; projectNo: string | null; address: string | null; finished: boolean }>
> {
  const rows = await getList('/project/', projectSchema)
  return new Map(
    rows.map((p) => [
      p.id,
      {
        name: p.name.trim(),
        projectNo: p.human_id?.trim() || null,
        address: p.address?.trim() || null,
        finished: p.finished ?? false,
      },
    ])
  )
}
