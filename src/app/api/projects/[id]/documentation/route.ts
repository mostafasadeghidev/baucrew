import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { canWorkOn } from '@/lib/crew-access'
import { folderInProject } from '@/lib/folders-db'
import { createDocEntry, transcribeDocEntry, type IncomingDocFile } from '@/lib/documentation-db'
import {
  DOC_MAX_IMAGES,
  cleanDocText,
  cleanDuration,
  docFileType,
  validateDocFile,
  voiceFileName,
  type DocFileKind,
} from '@/lib/documentation'

/**
 * A new entry of a project's documentation with its files: photos (several at
 * once), one PDF, or one voice note. A written note goes through the server
 * action instead (documentation-actions.ts); it has no file to carry.
 *
 * Everyone who may work on the project adds to it — the office, the site
 * manager on their projects, the crew on the jobs the phone offers them. Type
 * and size are checked here, whatever the browser said. A voice note is
 * written out before the answer goes back, so the phone shows its words at
 * once; when that fails the recording is kept and can be tried again.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id: projectId } = await ctx.params
  if (!(await canWorkOn(user, projectId))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'notFound' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'uploadFailed' }, { status: 400 })
  }
  const kind = String(form.get('kind') ?? '') as DocFileKind
  if (kind !== 'IMAGE' && kind !== 'PDF' && kind !== 'VOICE') return NextResponse.json({ error: 'badType' }, { status: 400 })

  const chosen = form.getAll('file').filter((f): f is File => f instanceof File)
  if (chosen.length === 0) return NextResponse.json({ error: 'empty' }, { status: 400 })
  if (chosen.length > (kind === 'IMAGE' ? DOC_MAX_IMAGES : 1)) return NextResponse.json({ error: 'tooMany' }, { status: 400 })

  const files: IncomingDocFile[] = []
  for (const file of chosen) {
    const mimeType = docFileType(kind, file.name, file.type)
    const invalid = validateDocFile(kind, file.size, mimeType)
    if (invalid) return NextResponse.json({ error: invalid, name: file.name }, { status: 400 })
    files.push({
      name: kind === 'VOICE' ? voiceFileName(new Date(), mimeType) : file.name,
      mimeType,
      data: Buffer.from(await file.arrayBuffer()),
      durationMs: kind === 'VOICE' ? cleanDuration(form.get('durationMs')) : null,
    })
  }

  const entry = await createDocEntry({
    projectId,
    authorId: user.id,
    kind,
    text: kind === 'VOICE' ? null : cleanDocText(form.get('text')),
    files,
    folderId: await folderInProject(projectId, form.get('folderId')),
  })
  const transcription = entry.transcription === 'PENDING' ? await transcribeDocEntry(entry.id) : entry.transcription
  return NextResponse.json({ ok: true, id: entry.id, transcription })
}
