import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { readStoredFile } from '@/lib/file-storage'

/**
 * Download a project file. Management sees everything; crew accounts only get
 * files the office marked as visible — offers with prices stay office-only.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  if (user.role === 'EMPLOYEE' && !doc.visibleToCrew) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let data: Buffer
  try {
    data = await readStoredFile(doc.path)
  } catch {
    return NextResponse.json({ error: 'missing' }, { status: 404 })
  }

  const asciiName = doc.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Length': String(doc.size),
      'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'Cache-Control': 'private, max-age=0',
    },
  })
}
