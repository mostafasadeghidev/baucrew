/**
 * Form templates as a file: what one installation exports and another — or
 * the same one, rebuilt — imports. The office's own forms, its contracts with
 * their conditions among them, travel this way instead of living in the code.
 *
 * A file is JSON: `{ kind, version, templates: [{ name, description, fields,
 * signers, financial }] }` — `financial` when the form holds prices. Every template is put through the same rules as one saved in
 * the editor (src/lib/forms.ts), so a file can never hold more than the editor
 * could.
 *
 * Pure: no database, no React.
 */

import { FORM_NAME_MAX, parseFields, parseSigners, type FormField } from './forms'

export const TEMPLATE_FILE_KIND = 'baucrew-form-templates'
export const TEMPLATE_FILE_VERSION = 1
/** A file larger than this is no file of templates. */
export const TEMPLATE_FILE_MAX_BYTES = 2_000_000

export type TemplateEntry = { name: string; description: string | null; fields: FormField[]; signers: string[]; financial: boolean }

/** The file for these templates. */
export function templateFile(templates: Array<{ name: string; description: string | null; fields: unknown; signers: unknown; financial: boolean }>) {
  return {
    kind: TEMPLATE_FILE_KIND,
    version: TEMPLATE_FILE_VERSION,
    templates: templates.map((t) => ({
      name: t.name,
      description: t.description,
      fields: parseFields(t.fields),
      signers: parseSigners(t.signers),
      financial: t.financial,
    })),
  }
}

export type ReadResult =
  | { templates: TemplateEntry[]; skipped: string[] }
  | { error: 'notAFile' | 'newerVersion' }

/**
 * The templates a file holds. A template without a name or without a usable
 * field is skipped — by name, or by its place in the file — and the rest come
 * in.
 */
export function readTemplateFile(raw: unknown): ReadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'notAFile' }
  const file = raw as Record<string, unknown>
  if (file.kind !== TEMPLATE_FILE_KIND || !Array.isArray(file.templates)) return { error: 'notAFile' }
  if (typeof file.version !== 'number' || file.version > TEMPLATE_FILE_VERSION) return { error: 'newerVersion' }
  const templates: TemplateEntry[] = []
  const skipped: string[] = []
  file.templates.forEach((item, n) => {
    const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    const name = typeof source.name === 'string' ? source.name.trim().slice(0, FORM_NAME_MAX) : ''
    const fields = parseFields(source.fields)
    if (!name || fields.length === 0) {
      skipped.push(name || `#${n + 1}`)
      return
    }
    const description = typeof source.description === 'string' ? source.description.trim().slice(0, 500) || null : null
    templates.push({ name, description, fields, signers: parseSigners(source.signers), financial: source.financial === true })
  })
  return { templates, skipped }
}
