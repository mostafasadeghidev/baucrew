import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { pinsFor } from '@/lib/feedback-db'

/** The open feedback on one page, for the numbered pins of comment mode. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const page = req.nextUrl.searchParams.get('page') ?? ''
  if (!page.startsWith('/')) return NextResponse.json({ pins: [] })
  return NextResponse.json({ pins: await pinsFor(user, page) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
