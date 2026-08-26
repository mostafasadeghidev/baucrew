'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { IMPORT_FIELDS, type ImportMapping, type ImportProfile } from '@/lib/import-excel'

const KEY = 'importProfiles'

/** Saved column mappings, so the same file imports again without re-mapping. */
export async function getImportProfiles(): Promise<ImportProfile[]> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: KEY } })
    if (!row) return []
    const parsed: unknown = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is ImportProfile =>
          typeof p === 'object' && p !== null &&
          typeof (p as ImportProfile).name === 'string' &&
          typeof (p as ImportProfile).mapping === 'object'
      )
      .slice(0, 20)
  } catch {
    return []
  }
}

function cleanMapping(raw: unknown): ImportMapping {
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([k, v]) => (IMPORT_FIELDS as readonly string[]).includes(k) && typeof v === 'string' && v
    )
  ) as ImportMapping
}

export async function saveImportProfile(name: string, mappingJson: string): Promise<void> {
  const user = await requireManagement()
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return
  let mapping: ImportMapping
  try {
    mapping = cleanMapping(JSON.parse(mappingJson))
  } catch {
    return
  }
  const profiles = (await getImportProfiles()).filter((p) => p.name !== trimmed)
  profiles.unshift({ name: trimmed, mapping })
  const value = JSON.stringify(profiles.slice(0, 20))
  await db.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
  await audit({
    userId: user.id,
    action: 'import.profile.save',
    entity: 'System',
    entityId: KEY,
    newValue: trimmed,
  })
  revalidatePath('/projects/import')
}

export async function deleteImportProfile(name: string): Promise<void> {
  const user = await requireManagement()
  const profiles = (await getImportProfiles()).filter((p) => p.name !== name)
  const value = JSON.stringify(profiles)
  await db.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
  await audit({
    userId: user.id,
    action: 'import.profile.delete',
    entity: 'System',
    entityId: KEY,
    oldValue: name,
  })
  revalidatePath('/projects/import')
}
