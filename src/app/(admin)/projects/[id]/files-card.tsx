import { getLocale, getTranslations } from 'next-intl/server'
import { Eye, EyeOff, FileText, Image as ImageIcon } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'
import { formatFileSize, previewKind } from '@/lib/files'
import { FileUpload } from './file-upload'
import { FilePreview } from '@/components/file-preview'
import { deleteProjectFile, setProjectCover, toggleFileVisibility } from './file-actions'

export type FileRow = {
  id: string
  filename: string
  mimeType: string
  /** True for a photo that shows a defect — it is drawn with the defect too. */
  defect?: boolean
  size: number
  source: string
  visibleToCrew: boolean
  createdAt: Date
  uploadedBy: { username: string } | null
}

/** The cover as a form action: it wants nothing back. */
async function setCover(projectId: string, fileId: string | null) {
  'use server'
  await setProjectCover(projectId, fileId)
}

/** Plans, offer PDFs, photos — stored on the project, crew-visible on demand. */
export async function FilesCard({
  projectId,
  files,
  coverId = null,
}: {
  projectId: string
  files: FileRow[]
  /** The photo on the front of the project's card, if one was chosen. */
  coverId?: string | null
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations('files'),
    getTranslations('common'),
    getLocale(),
  ])
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const photos = files.filter((file) => previewKind(file.mimeType) === 'image')
  const documents = files.filter((file) => previewKind(file.mimeType) !== 'image')

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
      </div>
      <div className="p-5">
        {/* Pictures as tiles — a site is looked at, not read — and under each
            the same two controls a file has: who sees it, and away with it. */}
        {photos.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t('photos', { count: photos.length })}</p>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
              {photos.map((file) => (
                <li key={file.id} className="min-w-0">
                  <FilePreview
                    id={file.id}
                    filename={file.filename}
                    kind="image"
                    thumb
                    thumbClass="aspect-square w-full"
                    labels={{ preview: t('preview'), openInTab: t('openInTab'), download: t('download'), close: tc('close') }}
                  />
                  <p className="mt-1 truncate text-[11px] text-muted" title={file.filename}>
                    {fmt.format(file.createdAt)}
                    {file.uploadedBy && ` · ${file.uploadedBy.username}`}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {file.source === 'site' ? t('fromSite') : formatFileSize(file.size)}
                    {file.defect && ` · ${t('ofDefect')}`}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {/* The picture on the front of the card — one of these, or none. */}
                    <form action={setCover.bind(null, projectId, file.id === coverId ? null : file.id)}>
                      <button
                        type="submit"
                        className={`${btn.outlineSm} h-6 gap-1 px-1.5 py-0 text-[11px] ${file.id === coverId ? 'text-accent' : 'text-muted'}`}
                        title={file.id === coverId ? t('clearCover') : t('setCover')}
                      >
                        <ImageIcon className="h-3 w-3" aria-hidden />
                        {file.id === coverId ? t('isCover') : t('setCover')}
                      </button>
                    </form>
                    <form action={toggleFileVisibility.bind(null, file.id)}>
                      <button
                        type="submit"
                        className={`${btn.outlineSm} h-6 gap-1 px-1.5 py-0 text-[11px] ${
                          file.visibleToCrew ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'
                        }`}
                        title={file.visibleToCrew ? t('crewCanSee') : t('officeOnly')}
                      >
                        {file.visibleToCrew ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
                        {file.visibleToCrew ? t('crewShort') : t('officeShort')}
                      </button>
                    </form>
                    <DeleteButton
                      action={deleteProjectFile.bind(null, file.id)}
                      label={tc('delete')}
                      confirmMessage={`${file.filename} — ${tc('delete')}?`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {files.length === 0 ? (
          <p className="mb-4 text-sm text-muted">{t('none')}</p>
        ) : documents.length === 0 ? null : (
          <ul className="mb-4 divide-y divide-border">
            {documents.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <FilePreview
                  id={file.id}
                  filename={file.filename}
                  kind={previewKind(file.mimeType)}
                  labels={{ preview: t('preview'), openInTab: t('openInTab'), download: t('download'), close: tc('close') }}
                />
                <span className="shrink-0 text-xs text-muted">
                  {formatFileSize(file.size)} · {fmt.format(file.createdAt)}
                  {file.uploadedBy && ` · ${file.uploadedBy.username}`}
                  {file.source !== 'manual' && ` · ${file.source}`}
                </span>
                {/* One click flips whether the crew accounts see this file. */}
                <form action={toggleFileVisibility.bind(null, file.id)}>
                  <button
                    type="submit"
                    className={`${btn.outlineSm} h-7 gap-1 px-2 py-0 text-xs ${
                      file.visibleToCrew ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'
                    }`}
                    title={file.visibleToCrew ? t('crewCanSee') : t('officeOnly')}
                  >
                    {file.visibleToCrew ? (
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {file.visibleToCrew ? t('crewShort') : t('officeShort')}
                  </button>
                </form>
                <DeleteButton
                  action={deleteProjectFile.bind(null, file.id)}
                  label={tc('delete')}
                  confirmMessage={`${file.filename} — ${tc('delete')}?`}
                />
              </li>
            ))}
          </ul>
        )}
        <FileUpload projectId={projectId} />
      </div>
    </section>
  )
}
