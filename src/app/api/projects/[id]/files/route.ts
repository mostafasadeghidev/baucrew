import { NextResponse, after, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { notifyCard } from '@/lib/notifications-db'
import { previewKind, resolveUploadType, safeFileName, storageKeyFor, validateUpload } from '@/lib/files'
import { saveStoredFile } from '@/lib/file-storage'
import { canWorkOn } from '@/lib/crew-access'
import { folderInProject, rootFolderNamed } from '@/lib/folders-db'
import { getTranslations } from 'next-intl/server'
import { isPdfDocument } from '@/lib/quotes-db'
import { readUploadedQuote } from '@/lib/quotes-app'

/**
 * Upload one file onto a project.
 *
 * The office uploads anything the project accepts. The crew sends photos from
 * the site — pictures only, onto the projects it works on, and what it sends
 * the crew can see: nobody photographs a wall to hide it from the colleague
 * who has to paint it. A photo may belong to a defect (`defectId`); it is then
 * shown with it, and visible to the crew whoever took it. A photo may belong
 * to a task (`taskId`) in the same way; it is filed into the project's
 * "Aufgaben" folder, made when there is none. A PDF from the office is read
 * for a quote once it is saved (src/lib/quotes-db.ts) — after the answer, so
 * the upload does not wait for it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id: projectId } = await ctx.params
  const crew = user.role === 'EMPLOYEE'
  if (!(await canWorkOn(user, projectId))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'notFound' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 })
  // An Outlook e-mail often comes without a type the browser knows; its name says what it is.
  const type = resolveUploadType(file.name, file.type)
  const invalid = validateUpload(file.size, type)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  // A phone's HEIC is a picture too, though no browser here will draw it.
  const picture = previewKind(type) === 'image' || type === 'image/heic'
  if (crew && !picture) return NextResponse.json({ error: 'badType' }, { status: 400 })

  const defectId = String(form.get('defectId') ?? '').trim()
  if (defectId) {
    const defect = await db.defect.findUnique({ where: { id: defectId }, select: { projectId: true } })
    if (!defect || defect.projectId !== projectId) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  }

  const taskId = String(form.get('taskId') ?? '').trim()
  if (taskId) {
    const task = await db.projectTask.findUnique({ where: { id: taskId }, select: { projectId: true } })
    if (!task || task.projectId !== projectId) return NextResponse.json({ error: 'notFound' }, { status: 404 })
    if (!picture) return NextResponse.json({ error: 'badType' }, { status: 400 })
  }

  // A task's photo goes into "Aufgaben"; anything else into the folder open while it was sent.
  const folderId = taskId
    ? await rootFolderNamed(projectId, (await getTranslations('tasks'))('photoFolder'), user.id)
    : await folderInProject(projectId, form.get('folderId'))

  const key = storageKeyFor(projectId, randomUUID(), file.name)
  await saveStoredFile(key, Buffer.from(await file.arrayBuffer()))
  const doc = await db.document.create({
    data: {
      projectId,
      filename: safeFileName(file.name),
      mimeType: type,
      size: file.size,
      path: key,
      source: crew ? 'site' : 'manual',
      // A defect's, a task's and a form's photo are the crew's to see too, whoever took them.
      visibleToCrew: crew || Boolean(defectId) || Boolean(taskId) || (picture && form.get('forForm') === '1'),
      defectId: defectId || null,
      taskId: taskId || null,
      folderId,
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
  // A photo from the site is news for the office; a file of the office's own, for the card's people.
  await notifyCard(projectId, user.id, 'attachment', { text: doc.filename })
  if (!crew && isPdfDocument(doc)) after(() => readUploadedQuote(doc.id, user.id))
  return NextResponse.json({ ok: true, id: doc.id })
}
