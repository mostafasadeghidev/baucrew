'use client'

/**
 * A project's documentation — what the site and the office record about the
 * job: written notes, photos (camera or gallery, several at once), PDFs and
 * voice notes that are written out. Its own section, apart from the card's
 * attachments and comments; newest first, each entry with who and when.
 *
 * The same section on the card, the project page and the crew's phone
 * (`large`: big targets, the ways to add laid out as buttons instead of a
 * menu). Files go up through POST /api/projects/<id>/documentation, with the
 * progress shown — a site's mobile network is slow; everything else through
 * the actions in documentation-actions.ts.
 */

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { BookOpen, Camera, FileText, FolderInput, Image as ImageIcon, Mic, MoreHorizontal, NotebookPen, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Menu, menuItemClass } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { FilePreview } from '@/components/file-preview'
import { VoiceRecorder } from '@/components/voice-recorder'
import { PhotoGallery } from '@/components/photo-gallery'
import { usePhotoPicker } from '@/components/photo-picker'
import { MoveDialog, dragItem, useOpenFolder } from '@/components/project-folders'
import type { FolderItem, FolderView } from '@/lib/folders'
import { downscaleImage } from '@/lib/photo-upload'
import { formatFileSize } from '@/lib/files'
import { DOC_MAX_IMAGES, DOC_TEXT_MAX, docAccept, formatDuration, voiceFileName, type DocKind } from '@/lib/documentation'
import { addDocNote, editDocText, removeDocEntry, renameDocFile, retranscribeDocEntry } from '@/app/documentation-actions'

export type DocEntryView = {
  id: string
  kind: DocKind
  text: string | null
  transcription: 'PENDING' | 'DONE' | 'FAILED' | 'OFF' | null
  author: string | null
  createdAt: Date
  edited: boolean
  files: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
    durationMs: number | null
  }>
  canEdit: boolean
  canDelete: boolean
  folderId: string | null
}

const fileHref = (id: string) => `/api/documentation/files/${id}`

type Mode = null | 'note' | 'voice'
type UploadError = 'tooLarge' | 'badType' | 'tooMany' | 'empty' | 'forbidden' | 'uploadFailed'

/** One request with the files, its progress reported as it goes — fetch has no upload progress. */
function sendFiles(projectId: string, body: FormData, onProgress: (share: number) => void): Promise<{ error?: UploadError }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/projects/${projectId}/documentation`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({})
      let error: UploadError = 'uploadFailed'
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string }
        const known: UploadError[] = ['tooLarge', 'badType', 'tooMany', 'empty', 'forbidden']
        error = known.find((k) => k === parsed.error) ?? 'uploadFailed'
      } catch {
        // Not JSON: a proxy's page, a timeout — failed is all there is to say.
      }
      resolve({ error })
    }
    xhr.onerror = () => resolve({ error: 'uploadFailed' })
    xhr.send(body)
  })
}

export function ProjectDocumentation({
  projectId,
  entries,
  canAdd,
  transcriptionReady,
  large = false,
  frame = true,
  folders,
}: {
  projectId: string
  entries: DocEntryView[]
  /** The project's folders: the section shows the open folder's entries, and entries move between them. */
  folders?: FolderView[]
  canAdd: boolean
  /** Whether the server has a key to write voice notes out with. */
  transcriptionReady: boolean
  /** The phone: bigger targets, the ways to add as buttons. */
  large?: boolean
  /** Drawn as a card of its own; off where the page around it is the frame. */
  frame?: boolean
}) {
  const t = useTranslations('documentation')
  const tc = useTranslations('common')
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [note, setNote] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const pdf = useRef<HTMLInputElement>(null)
  const noteBox = useRef<HTMLTextAreaElement>(null)
  const [moving, setMoving] = useState<(FolderItem & { from: string | null }) | null>(null)
  const openFolder = useOpenFolder(projectId)
  // A folder that no longer exists is the top level; without folders every entry shows.
  const inFolder = folders ? (folders.some((f) => f.id === openFolder) ? openFolder : null) : undefined
  const shown = inFolder === undefined ? entries : entries.filter((e) => e.folderId === inFolder)

  // The card's "+ Hinzufügen → Dokumentation" scrolls here and asks for the way to add.
  useEffect(() => {
    const open = () => {
      if (!canAdd) return
      document.getElementById('documentation-add')?.click()
    }
    window.addEventListener('documentation:add', open)
    return () => window.removeEventListener('documentation:add', open)
  }, [canAdd])

  useEffect(() => {
    if (mode === 'note') noteBox.current?.focus()
  }, [mode])

  const busy = pending || progress !== null

  const upload = (kind: 'IMAGE' | 'PDF' | 'VOICE', build: () => Promise<FormData>, done?: () => void) => {
    setError(null)
    setProgress(t('preparing'))
    startTransition(async () => {
      const body = await build()
      body.set('kind', kind)
      if (inFolder) body.set('folderId', inFolder)
      const result = await sendFiles(projectId, body, (share) =>
        setProgress(share < 1 ? t('uploading', { percent: Math.round(share * 100) }) : kind === 'VOICE' && transcriptionReady ? t('transcribing') : t('saving'))
      )
      setProgress(null)
      if (result.error) {
        setError(t(`error.${result.error}`))
        return
      }
      done?.()
      router.refresh()
    })
  }

  const sendImages = (chosen: File[]) => {
    if (chosen.length > DOC_MAX_IMAGES) {
      setError(t('error.tooMany'))
      return
    }
    upload('IMAGE', async () => {
      const body = new FormData()
      // Drawn smaller on the phone first: a site's network takes a 6 MB photo a minute.
      for (const file of chosen) body.append('file', await downscaleImage(file))
      return body
    })
  }

  const photoPicker = usePhotoPicker(sendImages)
  const touch = photoPicker.touch

  const sendPdf = (list: FileList | null) => {
    const file = list?.[0]
    if (!file) return
    upload('PDF', async () => {
      const body = new FormData()
      body.append('file', file)
      return body
    })
  }

  const sendVoice = ({ blob, durationMs }: { blob: Blob; durationMs: number }) => {
    upload(
      'VOICE',
      async () => {
        const body = new FormData()
        body.append(
          'file',
          new File([blob], voiceFileName(new Date(), blob.type), {
            type: blob.type,
          })
        )
        body.set('durationMs', String(durationMs))
        return body
      },
      () => setMode(null)
    )
  }

  const saveNote = () => {
    setError(null)
    startTransition(async () => {
      const result = await addDocNote(projectId, note, inFolder ?? null)
      if (result.error) {
        setError(t(result.error === 'empty' ? 'error.noteEmpty' : 'error.uploadFailed'))
        return
      }
      setNote('')
      setMode(null)
      router.refresh()
    })
  }

  type Way = 'camera' | 'gallery' | 'pdf' | 'note' | 'voice'
  const choose = (way: Way) => {
    if (way === 'camera') photoPicker.openCamera()
    else if (way === 'gallery') photoPicker.openGallery()
    else if (way === 'pdf') pdf.current?.click()
    else setMode(way)
  }
  const ways: Array<{ key: Way; icon: typeof Camera; label: string }> = [
    ...(touch ? [{ key: 'camera' as const, icon: Camera, label: t('addCamera') }] : []),
    {
      key: 'gallery',
      icon: ImageIcon,
      label: touch ? t('addGallery') : t('addImages'),
    },
    { key: 'pdf', icon: FileText, label: t('addPdf') },
    { key: 'note', icon: NotebookPen, label: t('addNote') },
    { key: 'voice', icon: Mic, label: t('addVoice') },
  ]

  const inputs = (
    <>
      {photoPicker.inputs}
      <input
        ref={pdf}
        type="file"
        accept={docAccept('PDF')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          sendPdf(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )

  const addMenu = canAdd && !large && (
    <Menu
      side="bottom"
      align="end"
      label={t('add')}
      className={`${btn.outlineSm} gap-1.5`}
      trigger={
        <span id="documentation-add" className="inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          {t('add')}
        </span>
      }
    >
      {ways.map(({ key, icon: Icon, label }) => (
        <button key={key} type="button" role="menuitem" disabled={busy} onClick={() => choose(key)} className={menuItemClass}>
          <Icon className="h-4 w-4 text-muted" aria-hidden />
          {label}
        </button>
      ))}
    </Menu>
  )

  const body = (
    <>
      {inputs}
      {canAdd && large && mode === null && (
        // On the phone: every way to add in reach of a thumb, no menu in between.
        <div id="documentation-add" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ways.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => choose(key)}
              className={`${btn.outline} h-auto min-h-14 min-w-0 justify-start py-2 text-left text-base leading-tight`}
            >
              <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 whitespace-normal">{label}</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'note' && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <textarea
            ref={noteBox}
            data-sheet-draft
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={DOC_TEXT_MAX}
            rows={large ? 5 : 4}
            placeholder={t('notePlaceholder')}
            className={`w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 ${large ? 'text-base' : 'text-sm'} focus:outline-none focus:ring-2 focus:ring-ring`}
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={saveNote} className={large ? btn.primary : btn.primarySm}>
              {t('noteSave')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setNote('')
                setMode(null)
              }}
              className={large ? btn.outline : btn.outlineSm}
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      )}

      {mode === 'voice' && (
        <div className="rounded-lg border border-border p-3">
          <VoiceRecorder onSend={sendVoice} onCancel={() => setMode(null)} sending={busy} large={large} transcriptionReady={transcriptionReady} />
        </div>
      )}

      {progress && (
        <p className="text-sm text-muted" aria-live="polite">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{inFolder ? t('noneInFolder') : t('none')}</p>
      ) : (
        <ol className="space-y-3">
          {shown.map((entry) => (
            <li key={entry.id} {...(folders ? dragItem({ kind: 'entry', id: entry.id }) : {})}>
              <Entry
                entry={entry}
                large={large}
                transcriptionReady={transcriptionReady}
                onMove={folders && canAdd ? () => setMoving({ kind: 'entry', id: entry.id, from: entry.folderId }) : undefined}
              />
            </li>
          ))}
        </ol>
      )}
      {folders && <MoveDialog projectId={projectId} folders={folders} item={moving} from={moving?.from ?? null} onClose={() => setMoving(null)} />}
    </>
  )

  if (!frame) {
    return (
      <div className="space-y-3">
        {addMenu && <div className="flex justify-end">{addMenu}</div>}
        {body}
      </div>
    )
  }
  return (
    <section id="documentation" className="scroll-mt-24 rounded-xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-muted" aria-hidden />
            {t('title')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
        </div>
        {addMenu}
      </div>
      <div className="space-y-3 p-5">{body}</div>
    </section>
  )
}

const KIND_ICON: Record<DocKind, typeof Camera> = {
  TEXT: NotebookPen,
  IMAGE: ImageIcon,
  PDF: FileText,
  VOICE: Mic,
}

function Entry({
  entry,
  large,
  transcriptionReady,
  onMove,
}: {
  entry: DocEntryView
  large: boolean
  transcriptionReady: boolean
  /** Opens "Verschieben nach…"; absent where there are no folders. */
  onMove?: () => void
}) {
  const t = useTranslations('documentation')
  const tc = useTranslations('common')
  const tFiles = useTranslations('files')
  const format = useFormatter()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.text ?? '')
  const [removing, setRemoving] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const Icon = KIND_ICON[entry.kind]
  // One file to an entry — the PDF, the recording, a single photo — has a name worth changing.
  const single = entry.files.length === 1 ? entry.files[0] : null
  const previewLabels = {
    preview: tFiles('preview'),
    openInTab: tFiles('openInTab'),
    download: tFiles('download'),
    close: tc('close'),
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await editDocText(entry.id, draft)
      if (result.error) {
        setError(t(result.error === 'empty' ? 'error.noteEmpty' : 'error.saveFailed'))
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  const retry = () => {
    setError(null)
    startTransition(async () => {
      const result = await retranscribeDocEntry(entry.id)
      if (result.error || result.transcription === 'FAILED') setError(t('transcriptFailed'))
      router.refresh()
    })
  }

  const rename = () => {
    const value = renaming
    setRenaming(null)
    if (!single || !value?.trim() || value === single.filename) return
    startTransition(async () => {
      const result = await renameDocFile(single.id, value)
      if (result.error) setError(t('error.saveFailed'))
      router.refresh()
    })
  }

  const remove = () => {
    startTransition(async () => {
      const result = await removeDocEntry(entry.id)
      setRemoving(false)
      if (result.error) {
        setError(t('error.saveFailed'))
        return
      }
      router.refresh()
    })
  }

  const editor = (
    <div className="space-y-2">
      <textarea
        data-sheet-draft
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={DOC_TEXT_MAX}
        rows={large ? 5 : 4}
        aria-label={entry.kind === 'VOICE' ? t('transcript') : t('kind.TEXT')}
        className={`w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 ${large ? 'text-base' : 'text-sm'} focus:outline-none focus:ring-2 focus:ring-ring`}
      />
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className={large ? btn.primary : btn.primarySm}>
          {t('noteSave')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setDraft(entry.text ?? '')
            setEditing(false)
          }}
          className={large ? btn.outline : btn.outlineSm}
        >
          {tc('cancel')}
        </button>
      </div>
    </div>
  )

  const text = (value: string | null): ReactNode => <p className={`whitespace-pre-wrap break-words ${large ? 'text-base' : 'text-sm'}`}>{value}</p>

  return (
    <article className="rounded-lg border border-border p-3">
      <header className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-muted">
          <span className="font-medium text-foreground">{entry.author ?? t('unknownAuthor')}</span>
          {' · '}
          <time dateTime={entry.createdAt.toISOString()}>
            {format.dateTime(entry.createdAt, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
          {' · '}
          {t(`kind.${entry.kind}`)}
          {entry.edited && ` · ${t('edited')}`}
        </p>
        {(entry.canEdit || entry.canDelete || onMove) && !editing && (
          <Menu
            side="bottom"
            align="end"
            label={t('entryMenu')}
            className={`${large ? 'p-2' : 'p-1'} -m-1 rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground`}
            trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
          >
            {entry.canEdit && (
              <button type="button" role="menuitem" onClick={() => setEditing(true)} className={menuItemClass}>
                <Pencil className="h-4 w-4 text-muted" aria-hidden />
                {entry.kind === 'VOICE' ? t('editTranscript') : t('editNote')}
              </button>
            )}
            {entry.canDelete && single && (
              <button type="button" role="menuitem" onClick={() => setRenaming(single.filename)} className={menuItemClass}>
                <Pencil className="h-4 w-4 text-muted" aria-hidden />
                {t('renameFile')}
              </button>
            )}
            {onMove && (
              <button type="button" role="menuitem" onClick={onMove} className={menuItemClass}>
                <FolderInput className="h-4 w-4 text-muted" aria-hidden />
                {t('moveTo')}
              </button>
            )}
            {entry.canDelete && (
              <button type="button" role="menuitem" onClick={() => setRemoving(true)} className={`${menuItemClass} text-danger`}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('delete')}
              </button>
            )}
          </Menu>
        )}
      </header>

      <div className="mt-2 space-y-2">
        {renaming !== null && (
          <input
            autoFocus
            value={renaming}
            maxLength={200}
            aria-label={t('renameFile')}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                rename()
              } else if (e.key === 'Escape') {
                // The card closes on Escape too; here it only lets go of the name.
                e.stopPropagation()
                e.nativeEvent.stopImmediatePropagation()
                setRenaming(null)
              }
            }}
            onBlur={rename}
            data-saves-on-blur
            className={`block w-full rounded-md border border-accent bg-background px-2 py-1 ${large ? 'text-base' : 'text-sm'} font-semibold focus:outline-none focus:ring-2 focus:ring-ring`}
          />
        )}
        {entry.kind === 'TEXT' && (editing ? editor : text(entry.text))}

        {entry.kind === 'IMAGE' && (
          <PhotoGallery
            photos={entry.files.map((f) => ({ id: f.id, filename: f.filename, href: fileHref(f.id) }))}
            tileClass={large ? 'h-24 w-24' : 'h-20 w-20'}
          />
        )}

        {entry.kind === 'PDF' &&
          entry.files.map((file) => (
            <div key={file.id} className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <FilePreview id={file.id} href={fileHref(file.id)} filename={file.filename} kind="pdf" labels={previewLabels} />
              <span className="shrink-0 text-xs text-muted">{formatFileSize(file.size)}</span>
            </div>
          ))}

        {entry.kind === 'VOICE' && (
          <>
            {entry.files.map((file) => (
              <div key={file.id}>
                <div className="flex items-center gap-2">
                  <audio controls preload="metadata" src={fileHref(file.id)} className="min-w-0 flex-1" />
                  {file.durationMs !== null && <span className="shrink-0 text-xs tabular-nums text-muted">{formatDuration(file.durationMs)}</span>}
                </div>
                <a href={fileHref(file.id)} download={file.filename} className="mt-1 block truncate text-xs text-muted hover:underline">
                  {file.filename}
                </a>
              </div>
            ))}
            <div className="rounded-md bg-subtle px-3 py-2">
              <p className="mb-1 text-xs font-medium text-muted">{t('transcript')}</p>
              {editing ? (
                editor
              ) : entry.transcription === 'PENDING' ? (
                <p className="text-sm text-muted">{t('transcribing')}</p>
              ) : entry.text ? (
                text(entry.text)
              ) : entry.transcription === 'DONE' ? (
                <p className="text-sm text-muted">{t('transcriptEmpty')}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted">{entry.transcription === 'OFF' ? t('transcriptionOff') : t('transcriptFailed')}</p>
                  {transcriptionReady && (
                    <button type="button" disabled={pending} onClick={retry} className={btn.outlineXs}>
                      <RotateCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} aria-hidden />
                      {pending ? t('transcribing') : t('transcribeAgain')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <AlertDialog
        open={removing}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(false)}
        onConfirm={remove}
      />
    </article>
  )
}
