import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { readStoredFile } from '@/lib/file-storage'
import { canWorkOn } from '@/lib/crew-access'
import { servesInline } from '@/lib/files'

/**
 * Download a project file. The office sees everything; a site manager the files
 * of their own projects; crew accounts only the files of projects they work
 * on, and of those only what the office marked as visible — offers with
 * prices stay office-only.
 *
 * A file is shown in the page only when its type is one a browser draws
 * without running anything; everything else is a download. The browser is
 * told not to guess a type of its own, so a file that is really a web page
 * can never run on this origin with the reader's session.
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
  if ((user.role === 'SITE_MANAGER' || user.role === 'EMPLOYEE') && !(await canWorkOn(user, doc.projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let data: Buffer
  try {
    data = await readStoredFile(doc.path)
  } catch {
    return NextResponse.json({ error: 'missing' }, { status: 404 })
  }

  const asciiName = doc.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  const inline = servesInline(doc.mimeType)
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': inline ? doc.mimeType : 'application/octet-stream',
      'Content-Length': String(doc.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'Cache-Control': 'private, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      // A PDF is drawn by the browser's own viewer, which some browsers refuse
      // inside a sandbox; every other file gets the sandbox, download or not.
      ...(doc.mimeType === 'application/pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'; sandbox" }),
    },
  })
}
