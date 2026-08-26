import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { safeFileName, storageKeyFor, validateUpload } from '@/lib/files'
import { saveStoredFile } from '@/lib/file-storage'

/** Upload one file onto a project. Office/management only. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role === 'EMPLOYEE') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id: projectId } = await ctx.params
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'notFound' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const invalid = validateUpload(file.size, file.type)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const key = storageKeyFor(projectId, randomUUID(), file.name)
  await saveStoredFile(key, Buffer.from(await file.arrayBuffer()))
  const doc = await db.document.create({
    data: {
      projectId,
      filename: safeFileName(file.name),
      mimeType: file.type,
      size: file.size,
      path: key,
      source: 'manual',
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
