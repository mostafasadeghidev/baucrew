import { NextResponse, type NextRequest } from 'next/server'

// Lightweight gate: only checks cookie presence and redirects to /login.
// Real session validation (DB lookup, expiry, role checks) happens in the
// server layouts via requireUser()/requireManagement().
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = pathname === '/login' || pathname === '/logo'
  const hasSessionCookie = Boolean(request.cookies.get('session')?.value)

  if (!isPublic && !hasSessionCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)$).*)'],
}
