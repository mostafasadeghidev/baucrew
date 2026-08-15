import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Serves the admin-uploaded company logo from the database.
// There is no hardcoded default — without an upload this returns 404 and the
// UI shows the configurable company name instead.
export async function GET() {
  try {
    const setting = await db.appSetting.findUnique({ where: { key: 'logo' } })
    if (setting) {
      const match = setting.value.match(/^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/)
      if (match) {
        return new NextResponse(new Uint8Array(Buffer.from(match[2], 'base64')), {
          headers: {
            'Content-Type': match[1],
            'Cache-Control': 'no-store',
          },
        })
      }
    }
  } catch {
    // treat as missing
  }
  return new NextResponse(null, { status: 404 })
}
