import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { lookupPlaces } from '@/lib/geocode'

/**
 * Place suggestions for the city picker (signed-in users only). `unavailable`
 * says the search service did not answer, which is not "no such place" — and
 * such an answer is not kept in the browser's cache.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = request.nextUrl.searchParams.get('q') ?? ''
  const { results, answered } = await lookupPlaces(q)
  return NextResponse.json(
    { results, unavailable: !answered },
    { headers: { 'Cache-Control': answered ? 'private, max-age=300' : 'no-store' } }
  )
}
