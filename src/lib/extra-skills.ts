/**
 * Skills nobody has yet.
 *
 * A skill is free text on an employee, so the list of skills is really the set
 * of words that appear on at least one of them — which means a new one cannot
 * be written down until somebody has it. That is the wrong way round when a
 * company is setting the app up, or has just started offering something.
 *
 * So a skill can also be kept on its own, under the AppSetting key
 * `extraSkills`, and the list is the two put together: the ones people have,
 * and the ones written down for later. The moment somebody is given one, it is
 * in both places and counted once.
 *
 * Pure — the database lives in `extra-skills-db.ts`.
 */

export const EXTRA_SKILLS_KEY = 'extraSkills'

/** Same limit as the field on the employee form. */
export const MAX_SKILL_LENGTH = 100

export function parseExtraSkills(raw: string | null | undefined): string[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  return dedupe(value.filter((v): v is string => typeof v === 'string').map(cleanSkill).filter(Boolean))
}

export function serializeExtraSkills(names: string[]): string {
  return JSON.stringify(dedupe(names.map(cleanSkill).filter(Boolean)))
}

/** Trimmed, squeezed and cut to the length the employee field allows. */
export function cleanSkill(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_LENGTH)
}

/**
 * Without repeats, keeping the first spelling of each: two skills that differ
 * only in case are one skill, and the one already written down wins.
 */
function dedupe(names: string[]): string[] {
  const seen = new Map<string, string>()
  for (const name of names) {
    const key = name.toLocaleLowerCase('de')
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()]
}

/**
 * The list as the page shows it: everything anybody has, plus everything
 * written down for later at a count of nothing, in alphabetical order.
 */
export function mergeSkills(
  used: Array<{ name: string; count: number }>,
  extra: string[]
): Array<{ name: string; count: number }> {
  const have = new Set(used.map((s) => s.name.toLocaleLowerCase('de')))
  const spare = extra
    .filter((name) => !have.has(name.toLocaleLowerCase('de')))
    .map((name) => ({ name, count: 0 }))
  return [...used, ...spare].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Adds one, or says why it cannot be added. */
export function addExtraSkill(
  current: string[],
  used: string[],
  raw: string
): { names?: string[]; error?: 'nameRequired' | 'skillExists' } {
  const name = cleanSkill(raw)
  if (!name) return { error: 'nameRequired' }
  const key = name.toLocaleLowerCase('de')
  const known = [...current, ...used].some((s) => s.toLocaleLowerCase('de') === key)
  if (known) return { error: 'skillExists' }
  return { names: [...current, name] }
}
