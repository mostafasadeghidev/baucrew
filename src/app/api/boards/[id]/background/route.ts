import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { readStoredFile } from '@/lib/file-storage'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/**
 * A board's photo, for the ground behind its lists. Everybody who sees the
 * board may have it; the address carries the photo's own key, so a new photo
 * is a new address and the old one may be kept by the browser.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const board = await db.board.findUnique({ where: { id }, select: { backgroundImage: true } })
  if (!board?.backgroundImage) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  let data: Buffer
  try {
    data = await readStoredFile(board.backgroundImage)
  } catch {
    return NextResponse.json({ error: 'missing' }, { status: 404 })
  }
  const ending = board.backgroundImage.split('.').pop()?.toLowerCase() ?? ''
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': TYPES[ending] ?? 'application/octet-stream',
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
