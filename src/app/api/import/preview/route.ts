import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { parseSpreadsheet } from '@/lib/import-excel-server'

/** Step 1 of the import: read the file, hand back headers + a preview. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'tooLarge' }, { status: 400 })
  try {
    const sheet = await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
    return NextResponse.json({
      headers: sheet.headers,
      rows: sheet.rows.slice(0, 8).map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : (c ?? '')))),
      totalRows: sheet.rows.length,
    })
  } catch {
    return NextResponse.json({ error: 'parseFailed' }, { status: 400 })
  }
}
