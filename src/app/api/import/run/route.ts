import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseSpreadsheet } from '@/lib/import-excel-server'
import { mapRow, IMPORT_FIELDS, type ImportMapping } from '@/lib/import-excel'

/**
 * Step 2: map every row and write DRAFTS (source "excel") — the office takes
 * them over one by one in the inbox. A mapped external id makes a re-import
 * update its draft instead of duplicating it.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 })

  let mapping: ImportMapping
  try {
    const parsed = JSON.parse(String(form.get('mapping') ?? '{}')) as Record<string, unknown>
    mapping = Object.fromEntries(
      Object.entries(parsed).filter(
        ([k, v]) => (IMPORT_FIELDS as readonly string[]).includes(k) && typeof v === 'string' && v
      )
    ) as ImportMapping
  } catch {
    return NextResponse.json({ error: 'badMapping' }, { status: 400 })
  }
  if (!mapping.name) return NextResponse.json({ error: 'nameRequired' }, { status: 400 })

  const sheet = await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
  let created = 0
  let updated = 0
  let skipped = 0
  for (const row of sheet.rows) {
    const fields = mapRow(sheet.headers, row, mapping)
    if (!fields) {
      skipped++
      continue
    }
    const { externalId, ...rest } = fields
    const data = { source: 'excel', ...rest, externalId, externalSystem: externalId ? 'excel' : null }
    if (externalId) {
      const existing = await db.projectDraft.findUnique({
        where: { externalSystem_externalId: { externalSystem: 'excel', externalId } },
      })
      if (existing) {
        await db.projectDraft.update({ where: { id: existing.id }, data })
        updated++
        continue
      }
    } else {
      // No id column mapped: an open draft with the same name+start is the same row.
      const dupe = await db.projectDraft.findFirst({
        where: { status: 'open', name: fields.name, plannedStart: fields.plannedStart },
      })
      if (dupe) {
        skipped++
        continue
      }
    }
    await db.projectDraft.create({ data })
    created++
  }
  await audit({
    userId: user.id,
    action: 'import.excel',
    entity: 'System',
    entityId: 'import',
    newValue: `${created} neu, ${updated} aktualisiert, ${skipped} übersprungen`,
  })
  return NextResponse.json({ created, updated, skipped })
}
