import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { parseSpreadsheet } from '@/lib/import-excel-server'
import { cleanMasterMapping, isMasterKind, mappingComplete } from '@/lib/import-master'
import { runMasterImport } from '@/lib/import-master-server'

/**
 * Master data from a spreadsheet — customers, employees, vehicles — straight
 * into their lists: `kind`, `file`, `mapping` (JSON) and `overwrite`. The
 * preview before it is the same one the project import uses
 * (`/api/import/preview`).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const form = await req.formData()
  const kind = form.get('kind')
  const file = form.get('file')
  if (!isMasterKind(kind)) return NextResponse.json({ error: 'badKind' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'tooLarge' }, { status: 400 })

  let mapping
  try {
    mapping = cleanMasterMapping(kind, JSON.parse(String(form.get('mapping') ?? '{}')))
  } catch {
    return NextResponse.json({ error: 'badMapping' }, { status: 400 })
  }
  if (!mappingComplete(kind, mapping)) return NextResponse.json({ error: 'nameRequired' }, { status: 400 })

  let sheet
  try {
    sheet = await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
  } catch {
    return NextResponse.json({ error: 'parseFailed' }, { status: 400 })
  }
  const result = await runMasterImport(kind, sheet, mapping, form.get('overwrite') === '1')
  await audit({
    userId: user.id,
    action: `import.${kind}`,
    entity: 'System',
    entityId: 'import',
    newValue: `${result.created} neu, ${result.updated} ergänzt, ${result.unchanged} unverändert, ${result.skipped} übersprungen`,
  })
  for (const path of ['/customers', '/employees', '/vehicles', '/projects']) revalidatePath(path)
  return NextResponse.json(result)
}
