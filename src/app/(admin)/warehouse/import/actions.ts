'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { getOptionList } from '@/lib/option-lists-db'
import { parseSpreadsheet } from '@/lib/import-excel-server'
import {
  planCatalogImport,
  readCatalogTable,
  splitTable,
  summarizePlan,
  type CatalogIssue,
  type CatalogPlanEntry,
  type CatalogPlanSummary,
} from '@/lib/project-needs'

export type CatalogPreview = {
  plan: CatalogPlanEntry[]
  issues: CatalogIssue[]
  summary: CatalogPlanSummary
  hasHeader: boolean
}

export type CatalogImportResult = { created: number; filled: number; unchanged: number }

const cellText = (value: unknown) =>
  value == null ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim()

/**
 * The list as a table: the pasted text, or the first sheet of an Excel or CSV
 * file (its first row kept, so a header is found the same way as in a paste).
 */
async function tableOf(formData: FormData): Promise<string[][] | null> {
  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return null
    try {
      const sheet = await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
      return [sheet.headers, ...sheet.rows.map((row) => row.map(cellText))].filter((row) => row.some((c) => c !== ''))
    } catch {
      return null
    }
  }
  const text = String(formData.get('text') ?? '')
  return text.length > 500_000 ? null : splitTable(text)
}

async function planOf(formData: FormData): Promise<CatalogPreview | null> {
  const table = await tableOf(formData)
  if (!table) return null
  const kinds = await getOptionList('itemKinds')
  const asked = String(formData.get('defaultKind') ?? '')
  const defaultKind = kinds.some((k) => k.value === asked) ? asked : (kinds[0]?.value ?? 'MATERIAL')
  const { rows, issues, hasHeader } = readCatalogTable(table, kinds, defaultKind)
  const existing = await db.catalogItem.findMany({
    select: { id: true, kind: true, name: true, category: true, unit: true, location: true, notes: true },
  })
  const plan = planCatalogImport(rows, existing)
  return { plan, issues, summary: summarizePlan(plan), hasHeader }
}

/** What the list would do — nothing is written. */
export async function previewCatalogList(formData: FormData): Promise<{ preview?: CatalogPreview; error?: 'parseFailed' | 'empty' }> {
  await requireManagement()
  const preview = await planOf(formData)
  if (!preview) return { error: 'parseFailed' }
  if (preview.plan.length === 0 && preview.issues.length === 0) return { error: 'empty' }
  return { preview }
}

/**
 * Brings the list in: new entries made, entries already there only filled
 * where they are empty. The plan is made again from the same input, against
 * the catalogue as it is now — not trusted from the browser.
 */
export async function importCatalogList(formData: FormData): Promise<{ result?: CatalogImportResult; error?: 'parseFailed' | 'saveFailed' }> {
  const user = await requireManagement()
  const preview = await planOf(formData)
  if (!preview) return { error: 'parseFailed' }
  const creates = preview.plan.filter((p) => p.action === 'create')
  const fills = preview.plan.filter((p) => p.action === 'fill' && p.existingId)
  try {
    await db.$transaction([
      db.catalogItem.createMany({
        data: creates.map((p) => ({
          kind: p.kind,
          name: p.name,
          category: p.category,
          unit: p.unit,
          location: p.location,
          notes: p.notes,
        })),
      }),
      ...fills.map((p) => db.catalogItem.update({ where: { id: p.existingId! }, data: p.fills })),
    ])
  } catch {
    return { error: 'saveFailed' }
  }
  const result: CatalogImportResult = {
    created: creates.length,
    filled: fills.length,
    unchanged: preview.summary.same + preview.summary.repeat,
  }
  await audit({
    userId: user.id,
    action: 'import.catalog',
    entity: 'System',
    entityId: 'import',
    newValue: `${result.created} neu, ${result.filled} ergänzt, ${result.unchanged} unverändert`,
  })
  revalidatePath('/warehouse')
  return { result }
}
