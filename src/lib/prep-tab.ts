/**
 * Configurable "Zur Vorbereitung" tab on the project list.
 * Stored as one JSON value under AppSetting key `prepTab`; pure parsing here so
 * it stays testable, DB access at the bottom.
 */
import { PREPARATION_STATUSES } from './project-lifecycle-rules'

export const PREP_TAB_KEY = 'prepTab'

export const ALL_PROJECT_STATUSES = [
  'LEAD',
  'QUOTED',
  'APPROVED',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
  'CANCELLED',
] as const
export type ProjectStatusKey = (typeof ALL_PROJECT_STATUSES)[number]

export type PrepTabConfig = {
  enabled: boolean
  /** Custom tab label; empty = translated default. */
  label: string
  statuses: ProjectStatusKey[]
  /** Only projects without any schedule entry. */
  unscheduledOnly: boolean
}

export const DEFAULT_PREP_TAB: PrepTabConfig = {
  enabled: true,
  label: '',
  statuses: [...PREPARATION_STATUSES] as ProjectStatusKey[],
  unscheduledOnly: false,
}

function isStatus(v: unknown): v is ProjectStatusKey {
  return typeof v === 'string' && (ALL_PROJECT_STATUSES as readonly string[]).includes(v)
}

/** Parses the stored JSON; anything invalid falls back to the defaults field by field. */
export function parsePrepTabConfig(raw: string | null | undefined): PrepTabConfig {
  if (!raw) return { ...DEFAULT_PREP_TAB, statuses: [...DEFAULT_PREP_TAB.statuses] }
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_PREP_TAB, statuses: [...DEFAULT_PREP_TAB.statuses] }
  }
  if (typeof obj !== 'object' || obj === null) return { ...DEFAULT_PREP_TAB, statuses: [...DEFAULT_PREP_TAB.statuses] }
  const o = obj as Record<string, unknown>
  const statuses = Array.isArray(o.statuses) ? o.statuses.filter(isStatus) : []
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_PREP_TAB.enabled,
    label: typeof o.label === 'string' ? o.label.trim().slice(0, 40) : '',
    statuses: statuses.length > 0 ? Array.from(new Set(statuses)) : [...DEFAULT_PREP_TAB.statuses],
    unscheduledOnly: typeof o.unscheduledOnly === 'boolean' ? o.unscheduledOnly : DEFAULT_PREP_TAB.unscheduledOnly,
  }
}

/** Builds the config from the settings form (checkbox names `status_<KEY>`). */
export function prepTabConfigFromForm(get: (name: string) => FormDataEntryValue | null): PrepTabConfig {
  const statuses = ALL_PROJECT_STATUSES.filter((s) => get(`status_${s}`) === 'on')
  return {
    enabled: get('enabled') === 'on',
    label: String(get('label') ?? '').trim().slice(0, 40),
    statuses: statuses.length > 0 ? [...statuses] : [...DEFAULT_PREP_TAB.statuses],
    unscheduledOnly: get('unscheduledOnly') === 'on',
  }
}

export function serializePrepTabConfig(c: PrepTabConfig): string {
  return JSON.stringify(c)
}
