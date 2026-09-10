import { permanentRedirect } from 'next/navigation'

/**
 * The Excel import used to live here, and now sits in Einstellungen → Daten
 * with the other two importers. Anyone holding the old address — a bookmark,
 * a link in an e-mail to the office — lands on it instead of a 404.
 */
export default function MovedImportPage(): never {
  permanentRedirect('/settings/import-excel')
}
