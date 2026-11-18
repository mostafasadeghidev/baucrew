import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { readStoredFile } from '@/lib/file-storage'
import { canSeeFeedback } from '@/lib/feedback'

/**
 * A feedback item's picture, to whoever may see the item: the office all of
 * them, everybody else what the crew and the site managers wrote and their own.
 * `?download` asks for it as a file. Only the three picture types are ever
 * stored, and the browser is told not to guess a type of its own.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const attachment = await db.feedbackAttachment.findUnique({
    where: { id },
    include: { item: { select: { officeOnly: true, authorId: true } } },
  })
  if (!attachment || !canSeeFeedback(user, attachment.item)) return NextResponse.json({ error: 'notFound' }, { status: 404 })

  let data: Buffer
  try {
    data = await readStoredFile(attachment.path)
  } catch {
    return NextResponse.json({ error: 'missing' }, { status: 404 })
  }
  const download = req.nextUrl.searchParams.has('download')
  const asciiName = attachment.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(data.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      // Never kept by the browser: on a shared tablet the next person to log in
      // must not be shown what the last one was allowed to see.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}
