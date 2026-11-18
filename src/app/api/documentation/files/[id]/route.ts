import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { readStoredFile } from '@/lib/file-storage'
import { canSeeProject } from '@/lib/project-scope'
import { canWorkOn } from '@/lib/crew-access'
import { docServesInline, parseRange } from '@/lib/documentation'

/**
 * A file of a project's documentation: a photo, the PDF, a voice note's
 * recording. Whoever may open the project reads it — the office every one, a
 * site manager those of their projects, the crew those of the jobs the phone
 * offers them. Pictures, PDFs and recordings are shown in the page, anything
 * else is a download, and the browser may not guess a type of its own.
 *
 * A recording is served in parts when asked: Safari's player asks for the
 * first two bytes before it plays anything, and refuses a file that cannot be
 * read in parts.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const file = await db.documentationFile.findUnique({ where: { id }, include: { entry: { select: { projectId: true } } } })
  if (!file) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  const projectId = file.entry.projectId
  const allowed = user.role === 'EMPLOYEE' ? await canWorkOn(user, projectId) : await canSeeProject(user, projectId)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let data: Buffer
  try {
    data = await readStoredFile(file.path)
  } catch {
    return NextResponse.json({ error: 'missing' }, { status: 404 })
  }

  const inline = docServesInline(file.mimeType)
  const asciiName = file.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  const headers: Record<string, string> = {
    'Content-Type': inline ? file.mimeType : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'Cache-Control': 'private, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    // The browser's own PDF viewer refuses to run inside a sandbox in some browsers.
    ...(file.mimeType === 'application/pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'; sandbox" }),
  }

  const range = parseRange(req.headers.get('range'), data.length)
  if (range === 'invalid') {
    return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${data.length}` } })
  }
  if (range) {
    const part = data.subarray(range.start, range.end + 1)
    return new NextResponse(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Length': String(part.length), 'Content-Range': `bytes ${range.start}-${range.end}/${data.length}` },
    })
  }
  return new NextResponse(new Uint8Array(data), { headers: { ...headers, 'Content-Length': String(data.length) } })
}
