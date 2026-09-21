import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { previewKind, safeFileName, storageKeyFor, validateUpload } from '@/lib/files'
import { saveStoredFile } from '@/lib/file-storage'
import { canBookOn } from '@/lib/crew-access'

/**
 * Upload one file onto a project.
 *
 * The office uploads anything the project accepts. The crew sends photos from
 * the site — pictures only, onto the projects it works on, and what it sends
 * the crew can see: nobody photographs a wall to hide it from the colleague
 * who has to paint it. A photo may belong to a defect (`defectId`); it is then
 * shown with it, and visible to the crew whoever took it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id: projectId } = await ctx.params
  const crew = user.role === 'EMPLOYEE'
  if (crew && (!user.employee || !(await canBookOn(projectId, user.employee.id)))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'notFound' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const invalid = validateUpload(file.size, file.type)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  // A phone's HEIC is a picture too, though no browser here will draw it.
  const picture = previewKind(file.type) === 'image' || file.type === 'image/heic'
  if (crew && !picture) return NextResponse.json({ error: 'badType' }, { status: 400 })

  const defectId = String(form.get('defectId') ?? '').trim()
  if (defectId) {
    const defect = await db.defect.findUnique({ where: { id: defectId }, select: { projectId: true } })
    if (!defect || defect.projectId !== projectId) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  }

  const key = storageKeyFor(projectId, randomUUID(), file.name)
  await saveStoredFile(key, Buffer.from(await file.arrayBuffer()))
  const doc = await db.document.create({
    data: {
      projectId,
      filename: safeFileName(file.name),
      mimeType: file.type,
      size: file.size,
      path: key,
      source: crew ? 'site' : 'manual',
      visibleToCrew: crew || Boolean(defectId),
      defectId: defectId || null,
      uploadedById: user.id,
    },
  })
  await audit({
    userId: user.id,
    action: 'project.file.add',
    entity: 'Project',
    entityId: projectId,
    newValue: doc.filename,
  })
  return NextResponse.json({ ok: true, id: doc.id })
}
