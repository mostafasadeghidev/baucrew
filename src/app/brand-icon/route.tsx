import { ImageResponse } from 'next/og'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_ACCENT, normalizeAccent } from '@/lib/branding'
import { FAVICON_TYPES, iconInitial, iconInk } from '@/lib/brand-icon'

/**
 * The browser tab's icon (src/lib/brand-icon.ts): the image uploaded in
 * Settings, or the company's first letter on its colour. Public, like /logo —
 * the login page wears it too.
 *
 * The page links it with `?v=` and a mark of what it is made of; an address
 * with that mark never changes its answer, so it may be kept for good. Asked
 * without one (a browser trying /favicon.ico on its own) it is checked anew.
 */
export async function GET(request: NextRequest) {
  const cache = request.nextUrl.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache'
  let companyName = ''
  let accent = DEFAULT_ACCENT
  try {
    const rows = await db.appSetting.findMany({ where: { key: { in: ['favicon', 'companyName', 'accentColor'] } } })
    const uploaded = rows.find((r) => r.key === 'favicon')?.value.match(/^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/)
    if (uploaded && (FAVICON_TYPES as readonly string[]).includes(uploaded[1])) {
      return new NextResponse(new Uint8Array(Buffer.from(uploaded[2], 'base64')), {
        headers: {
          'Content-Type': uploaded[1],
          'Cache-Control': cache,
          'X-Content-Type-Options': 'nosniff',
          // An SVG is a document that could carry a script: opened on its own
          // it runs none, and reaches nothing.
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      })
    }
    companyName = rows.find((r) => r.key === 'companyName')?.value.trim() ?? ''
    accent = normalizeAccent(rows.find((r) => r.key === 'accentColor')?.value)
  } catch {
    // No database to ask: the generated icon with the defaults.
  }

  // Large enough for a phone's home screen; the browser scales it down for the tab.
  const size = 180
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: accent,
          color: iconInk(accent),
          borderRadius: 36,
          fontSize: 118,
          fontWeight: 700,
        }}
      >
        {iconInitial(companyName)}
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': cache } }
  )
}
