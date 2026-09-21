import 'server-only'
import { db } from './db'
import { changesFor, mapMasterRow, matchKey, nameKey, type MasterKind, type MasterMapping, type MasterRecord } from './import-master'
import type { ParsedSheet } from './import-excel-server'

export type MasterImportResult = { created: number; updated: number; unchanged: number; skipped: number }

type Existing = { id: string } & Record<string, unknown>

/**
 * Brings a sheet of customers, employees or vehicles in. Every row finds the
 * record it belongs to or makes a new one (see `./import-master` for the
 * rules); a row that names the same record twice in one file fills the record
 * the first one made, it does not make a second.
 */
export async function runMasterImport(
  kind: MasterKind,
  sheet: ParsedSheet,
  mapping: MasterMapping,
  overwrite: boolean
): Promise<MasterImportResult> {
  const existing: Existing[] =
    kind === 'customers'
      ? await db.customer.findMany()
      : kind === 'employees'
        ? await db.employee.findMany()
        : await db.vehicle.findMany()

  // Found by number or plate first, by name otherwise — a customer whose
  // number the file knows and the app does not yet is still the same customer.
  const byKey = new Map<string, Existing>()
  const byName = new Map<string, Existing>()
  const remember = (row: Existing) => {
    const record = row as unknown as MasterRecord
    const strong = matchKey(kind, record)
    if (strong.by !== 'name') byKey.set(strong.key, row)
    const name = kind === 'employees' ? `${nameKey(record.firstName)}|${nameKey(record.lastName)}` : nameKey(record.name)
    if (!byName.has(name)) byName.set(name, row)
  }
  existing.forEach(remember)

  const result: MasterImportResult = { created: 0, updated: 0, unchanged: 0, skipped: 0 }
  for (const row of sheet.rows) {
    const record = mapMasterRow(kind, sheet.headers, row, mapping)
    if (!record) {
      result.skipped++
      continue
    }
    const strong = matchKey(kind, record)
    const name = kind === 'employees' ? `${nameKey(record.firstName)}|${nameKey(record.lastName)}` : nameKey(record.name)
    const found = (strong.by !== 'name' ? byKey.get(strong.key) : undefined) ?? byName.get(name)

    if (found) {
      const changes = changesFor(found, record, overwrite)
      if (Object.keys(changes).length === 0) {
        result.unchanged++
        continue
      }
      const updated = (await (kind === 'customers'
        ? db.customer.update({ where: { id: found.id }, data: changes })
        : kind === 'employees'
          ? db.employee.update({ where: { id: found.id }, data: changes })
          : db.vehicle.update({ where: { id: found.id }, data: changes }))) as Existing
      Object.assign(found, updated)
      remember(found)
      result.updated++
      continue
    }

    const data = Object.fromEntries(Object.entries(record).filter(([, value]) => value != null)) as Record<string, string>
    const created = (await (kind === 'customers'
      ? db.customer.create({ data: data as { name: string } })
      : kind === 'employees'
        ? db.employee.create({ data: { ...data, firstName: data.firstName ?? '', lastName: data.lastName } as { firstName: string; lastName: string } })
        : db.vehicle.create({ data: data as { name: string } }))) as Existing
    remember(created)
    result.created++
  }
  return result
}
