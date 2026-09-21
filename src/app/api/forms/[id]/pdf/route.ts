import { NextResponse, type NextRequest } from 'next/server'
import { getLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { canBookOn } from '@/lib/crew-access'
import { filledFormPdf } from '@/lib/forms-db'

/**
 * A form as a PDF, as it stands — a draft to look over, or the signed sheet to
 * print and send. For the office, and for the crew on the projects it works on.
 * `?download=1` saves it instead of showing it.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const form = await db.filledForm.findUnique({ where: { id }, select: { projectId: true } })
  if (!form) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  if (user.role === 'EMPLOYEE' && (!user.employee || !(await canBookOn(form.projectId, user.employee.id)))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const sheet = await filledFormPdf(id, await getLocale())
  if (!sheet) return NextResponse.json({ error: 'notFound' }, { status: 404 })

  const asciiName = sheet.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  const disposition = req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'
  return new NextResponse(new Uint8Array(sheet.data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(sheet.data.byteLength),
      'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(sheet.filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
