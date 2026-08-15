import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { searchPlaces } from '@/lib/geocode'

/** Place suggestions for the city picker (signed-in users only). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = request.nextUrl.searchParams.get('q') ?? ''
  const results = await searchPlaces(q)
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
