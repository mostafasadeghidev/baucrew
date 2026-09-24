/**
 * Boards that can be made with one click, the way the client had them in
 * Trello: the sites board with its ten lists, from the orders to "Erledigt",
 * three of them by a rule (src/lib/board-rules.ts). The names are the lists'
 * own; the office renames them on the board afterwards if it likes.
 *
 * Pure, so the shape is tested without a database.
 */
import { COLUMN_TITLE_MAX } from './boards'
import { RULE_STATUS, type ColumnRule } from './board-rules'
import type { ProjectStatusKey } from './prep-tab'

export type PresetColumn = { status: ProjectStatusKey; rule: ColumnRule | null; title: string | null }
export type BoardPreset = { key: string; name: string; background: string; columns: PresetColumn[] }

/**
 * The client's Trello board, list for list. "Aufträge für <year>" names next
 * year as the client's list did; the rule keeps it right whatever the title says.
 */
export function sitesPreset(currentYear: number): BoardPreset {
  const columns: PresetColumn[] = [
    { status: 'APPROVED', rule: null, title: 'Aufträge' },
    { status: 'APPROVED', rule: 'nextYear', title: `Aufträge für ${currentYear + 1}` },
    { status: 'APPROVED', rule: 'lowPriority', title: 'Warteliste Kleinaufträge' },
    { status: 'PLANNED', rule: null, title: 'Baustellenbeginn' },
    { status: 'IN_PROGRESS', rule: null, title: 'Baustelle läuft' },
    { status: 'IN_PROGRESS', rule: 'paused', title: 'Baustellenunterbrechung / Pause' },
    { status: 'IN_PROGRESS', rule: 'invoice1', title: 'Abschlagszahlungen' },
    { status: 'COMPLETED', rule: null, title: 'Fertigstellung' },
    { status: 'INVOICED', rule: null, title: 'Rechnungsstellung' },
    { status: 'PAID', rule: null, title: 'Erledigt' },
  ]
  return { key: 'sites', name: 'Aktuell laufende Baustellen', background: 'blue', columns }
}

/** The presets on offer, by key. */
export function boardPreset(key: string, currentYear: number): BoardPreset | null {
  return key === 'sites' ? sitesPreset(currentYear) : null
}

/** Whether a preset is well formed: a rule's column has the rule's status, and every title fits. */
export function presetIsSound(preset: BoardPreset): boolean {
  return preset.columns.every(
    (c) => (c.rule === null || RULE_STATUS[c.rule] === c.status) && (c.title === null || (c.title.length > 0 && c.title.length <= COLUMN_TITLE_MAX))
  )
}
