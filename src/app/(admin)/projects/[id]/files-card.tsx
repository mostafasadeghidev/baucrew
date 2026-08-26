import { getLocale, getTranslations } from 'next-intl/server'
import { Eye, EyeOff, FileText } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'
import { formatFileSize } from '@/lib/files'
import { FileUpload } from './file-upload'
import { deleteProjectFile, toggleFileVisibility } from './file-actions'

export type FileRow = {
  id: string
  filename: string
  size: number
  source: string
  visibleToCrew: boolean
  createdAt: Date
  uploadedBy: { username: string } | null
}

/** Plans, offer PDFs, photos — stored on the project, crew-visible on demand. */
export async function FilesCard({ projectId, files }: { projectId: string; files: FileRow[] }) {
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

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
      </div>
      <div className="p-5">
        {files.length === 0 ? (
          <p className="mb-4 text-sm text-muted">{t('none')}</p>
        ) : (
          <ul className="mb-4 divide-y divide-border">
            {files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <a
                  href={`/api/files/${file.id}`}
                  target="_blank"
                  className="min-w-0 flex-1 truncate font-medium text-accent hover:underline"
                >
                  {file.filename}
                </a>
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
