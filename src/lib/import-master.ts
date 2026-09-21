/**
 * Master data from a spreadsheet: customers, employees, vehicles — what the
 * office already keeps in a list somewhere, brought in once instead of typed
 * in again. Only what the app works with: a name and how to reach somebody,
 * not a personnel file.
 *
 * A row that fits a record already there does not make a second one: a
 * customer is found by its number, else by its name; an employee by first and
 * last name; a vehicle by its plate, else by its name. What is found is filled
 * where it is empty — what the office typed in stays — unless the import is
 * told to overwrite.
 *
 * Pure: no database, no file reading — the rules are tested as they are.
 */

export const MASTER_KINDS = ['customers', 'employees', 'vehicles'] as const
export type MasterKind = (typeof MASTER_KINDS)[number]

export const isMasterKind = (value: unknown): value is MasterKind => (MASTER_KINDS as readonly unknown[]).includes(value)

/** The fields of each kind a column can be mapped onto; the first of `required` groups must be there. */
export const MASTER_FIELDS = {
  customers: ['name', 'number', 'company', 'contactPerson', 'phone', 'email', 'street', 'postalCode', 'city', 'notes'],
  employees: ['fullName', 'firstName', 'lastName', 'phone', 'email', 'notes'],
  vehicles: ['name', 'licensePlate', 'type', 'notes'],
} as const satisfies Record<MasterKind, readonly string[]>

export type MasterField<K extends MasterKind = MasterKind> = (typeof MASTER_FIELDS)[K][number]

/** header text (as in the file) per target field; missing = not imported. */
export type MasterMapping = Partial<Record<string, string>>

/**
 * What a header is usually called, per field — German first, the way the
 * exports of German office software name their columns. Compared without
 * case, spaces, dots, dashes and underscores: "Kd.-Nr." is "kdnr".
 */
const SYNONYMS: Record<MasterKind, Record<string, string[]>> = {
  customers: {
    name: ['name', 'kunde', 'kundenname', 'auftraggeber', 'customer', 'bezeichnung', 'name1'],
    number: ['kundennummer', 'kundennr', 'kdnr', 'kundenno', 'debitor', 'debitorennummer', 'customernumber', 'nummer', 'nr'],
    company: ['firma', 'firmenname', 'company', 'name2', 'zusatz'],
    contactPerson: ['ansprechpartner', 'kontakt', 'kontaktperson', 'contact', 'contactperson'],
    phone: ['telefon', 'tel', 'telefonnummer', 'phone', 'mobil', 'handy', 'mobiltelefon'],
    email: ['email', 'mail', 'emailadresse'],
    street: ['strasse', 'straße', 'strassehausnummer', 'straßehausnummer', 'adresse', 'anschrift', 'street', 'address'],
    postalCode: ['plz', 'postleitzahl', 'zip', 'postalcode'],
    city: ['ort', 'stadt', 'wohnort', 'city', 'town'],
    notes: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'notes', 'kommentar'],
  },
  employees: {
    fullName: ['name', 'mitarbeiter', 'mitarbeitername', 'vollername', 'employee', 'fullname'],
    firstName: ['vorname', 'firstname', 'rufname'],
    lastName: ['nachname', 'familienname', 'lastname', 'surname', 'zuname'],
    phone: ['telefon', 'tel', 'telefonnummer', 'phone', 'mobil', 'handy', 'mobiltelefon'],
    email: ['email', 'mail', 'emailadresse'],
    notes: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'notes'],
  },
  vehicles: {
    name: ['name', 'fahrzeug', 'bezeichnung', 'fahrzeugname', 'vehicle', 'modell'],
    licensePlate: ['kennzeichen', 'kfzkennzeichen', 'nummernschild', 'plate', 'licenseplate'],
    type: ['typ', 'art', 'fahrzeugtyp', 'fahrzeugart', 'type'],
    notes: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'notes'],
  },
}

const squash = (text: string) => text.toLowerCase().replace(/[\s._\-/]+/g, '')

/** The mapping a file's headers suggest — each header used once, the first field that knows it wins. */
export function guessMapping(kind: MasterKind, headers: string[]): MasterMapping {
  const mapping: MasterMapping = {}
  const taken = new Set<string>()
  for (const field of MASTER_FIELDS[kind]) {
    const names = SYNONYMS[kind][field] ?? []
    const hit = headers.find((h) => !taken.has(h) && (squash(h) === squash(field) || names.includes(squash(h))))
    if (hit) {
      mapping[field] = hit
      taken.add(hit)
    }
  }
  // A sheet with first and last name needs no "Name" as the whole name.
  if (kind === 'employees' && mapping.firstName && mapping.lastName) delete mapping.fullName
  return mapping
}

/** Whether a mapping can be imported: the name a record cannot do without is mapped. */
export function mappingComplete(kind: MasterKind, mapping: MasterMapping): boolean {
  if (kind === 'employees') return Boolean(mapping.fullName || (mapping.firstName && mapping.lastName))
  return Boolean(mapping.name)
}

export function cleanMasterMapping(kind: MasterKind, raw: unknown): MasterMapping {
  if (typeof raw !== 'object' || raw === null) return {}
  const fields = MASTER_FIELDS[kind] as readonly string[]
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([k, v]) => fields.includes(k) && typeof v === 'string' && v)
  ) as MasterMapping
}

const LIMITS: Record<string, number> = { notes: 5000, phone: 60, postalCode: 20, number: 60, licensePlate: 20 }

const cellText = (value: unknown, field: string): string | null => {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
  return text ? text.slice(0, LIMITS[field] ?? 200) : null
}

/** "Muster, Max" or "Max Muster" → first and last name; one word is a last name. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const text = full.trim().replace(/\s+/g, ' ')
  const comma = text.indexOf(',')
  if (comma !== -1) return { firstName: text.slice(comma + 1).trim(), lastName: text.slice(0, comma).trim() }
  const at = text.lastIndexOf(' ')
  return at === -1 ? { firstName: '', lastName: text } : { firstName: text.slice(0, at), lastName: text.slice(at + 1) }
}

export type MasterRecord = Record<string, string | null>

/** One row as a record of its kind, or null when it has no name to go by. */
export function mapMasterRow(kind: MasterKind, headers: string[], row: unknown[], mapping: MasterMapping): MasterRecord | null {
  const record: MasterRecord = {}
  for (const field of MASTER_FIELDS[kind]) {
    const header = mapping[field]
    const index = header ? headers.indexOf(header) : -1
    record[field] = index === -1 ? null : cellText(row[index], field)
  }
  if (kind === 'employees') {
    if (!(record.firstName && record.lastName) && record.fullName) {
      const split = splitFullName(record.fullName)
      record.firstName = record.firstName ?? (split.firstName || null)
      record.lastName = record.lastName ?? (split.lastName || null)
    }
    delete record.fullName
    // One name only is a last name; the first stays empty rather than the row being lost.
    if (!record.lastName && record.firstName) {
      record.lastName = record.firstName
      record.firstName = null
    }
    return record.lastName ? record : null
  }
  return record.name ? record : null
}

/** How two names are held against each other: case, and spaces at the ends and doubled, do not count. */
export const nameKey = (text: string | null | undefined) => (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** The key a record is found by among the ones already there. */
export function matchKey(kind: MasterKind, record: MasterRecord): { by: 'number' | 'plate' | 'name'; key: string } {
  if (kind === 'customers' && record.number) return { by: 'number', key: nameKey(record.number) }
  if (kind === 'vehicles' && record.licensePlate) return { by: 'plate', key: squash(record.licensePlate) }
  if (kind === 'employees') return { by: 'name', key: `${nameKey(record.firstName)}|${nameKey(record.lastName)}` }
  return { by: 'name', key: nameKey(record.name) }
}

/**
 * What an import changes on a record already there: the fields the file has a
 * value for that the record lacks — or, told to overwrite, that differ. The
 * key it was found by is never among them.
 */
export function changesFor(existing: Record<string, unknown>, incoming: MasterRecord, overwrite: boolean): Record<string, string> {
  const changes: Record<string, string> = {}
  for (const [field, value] of Object.entries(incoming)) {
    if (value == null) continue
    const current = existing[field]
    const empty = current == null || (typeof current === 'string' && current.trim() === '')
    if (empty || (overwrite && current !== value)) changes[field] = value
  }
  return changes
}
