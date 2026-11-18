import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { searchEverything } from '@/lib/global-search-db'

export const dynamic = 'force-dynamic'

/**
 * The search window's results (⌘K in the administration area): projects the
 * user sees, and for the office customers, employees, vehicles and devices.
 * A GET and not a server action, so a query typed over an earlier one can
 * cancel it instead of waiting in line behind it.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = request.nextUrl.searchParams.get('q') ?? ''
  const results = await searchEverything(user, q)
  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
