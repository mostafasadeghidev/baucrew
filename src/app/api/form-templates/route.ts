import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isOffice } from '@/lib/authz'
import { templateFile } from '@/lib/form-template-file'

/**
 * The form templates as a file to import elsewhere (src/lib/form-template-file.ts):
 * all of them, or one with `?id=`. For the office only — a template is the
 * office's own paperwork.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isOffice(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  const templates = await db.formTemplate.findMany({
    where: id ? { id } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { name: true, description: true, fields: true, signers: true, financial: true },
  })
  if (id && templates.length === 0) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  const filename = id ? `${templates[0].name}.json` : 'formularvorlagen.json'
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return new NextResponse(JSON.stringify(templateFile(templates), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
