'use client'

/**
 * The defects of a project — Mängel: what is not right on the site, shown with
 * photos, and ticked off when it has been put right. The crew reports them
 * from the phone, a photo straight from the camera; the office reports them
 * too, and says who puts it right and by when.
 *
 * Drawn on the project page and on the crew's phone; the actions know who may
 * do what, this only leaves out what the reader cannot do anyway.
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Camera, Check, MapPin, Plus, User, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { FilePreview } from '@/components/file-preview'
import { deleteDefect, reportDefect, resolveDefect } from '@/app/defect-actions'
import { DEFECT_LOCATION_MAX, DEFECT_TEXT_MAX, DEFECT_TITLE_MAX, type DefectRow } from '@/lib/defects'
import { uploadProjectPhoto } from '@/lib/photo-upload'

export type { DefectRow } from '@/lib/defects'

const TONE = {
  late: 'bg-danger/10 text-danger',
  soon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
} as const

export function ProjectDefects({
  projectId,
  defects,
  assignees,
  office,
  frame = true,
  large = false,
}: {
  projectId: string
  /** Open ones first — the list is drawn in the order it comes in. */
  defects: DefectRow[]
  /** Who a defect can be given to; only the office says. */
  assignees?: ComboboxOption[]
  /** The office: gives a defect to somebody and a day, and may take a tick away again. */
  office: boolean
  /** With its own card and title, or bare inside somebody else's. */
  frame?: boolean
  /** Larger type and targets, for the phone. */
  large?: boolean
}) {
  const t = useTranslations('defects')
  const tf = useTranslations('files')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<DefectRow | null>(null)
  const [picked, setPicked] = useState(0)
  const [formKey, setFormKey] = useState(0)
  const files = useRef<HTMLInputElement>(null)

  const open = defects.filter((d) => !d.resolved)
  const done = defects.filter((d) => d.resolved)
  const text = large ? 'text-base' : 'text-sm'
  const small = large ? 'text-sm' : 'text-xs'
  const pad = frame ? 'px-5' : 'px-0'
  const input = `mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 ${text} focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent`
  const previewLabels = { preview: tf('preview'), openInTab: tf('openInTab'), download: tf('download'), close: tc('close') }

  const say = (code: string | undefined) =>
    setError(code === 'titleRequired' ? t('titleRequired') : code === 'notAllowed' ? t('notAllowed') : tc('saveFailed'))

  /** Photos go up one by one; one that fails is said, the rest still arrive. */
  async function sendPhotos(list: File[], defectId: string) {
    let failed = 0
    for (const file of list) {
      const result = await uploadProjectPhoto(projectId, file, defectId)
      if ('error' in result) failed++
    }
    if (failed > 0) setError(t('photoFailed', { count: failed }))
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const photos = Array.from(files.current?.files ?? [])
    data.delete('photos')
    setError(null)
    startTransition(async () => {
      const result = await reportDefect(projectId, data)
      if (result.error || !result.id) return say(result.error)
      await sendPhotos(photos, result.id)
      setAdding(false)
      setPicked(0)
      setFormKey((k) => k + 1)
      router.refresh()
    })
  }

  const toggle = (defect: DefectRow, resolved: boolean) => {
    setError(null)
    setBusy(defect.id)
    startTransition(async () => {
      const result = await resolveDefect(defect.id, resolved)
      setBusy(null)
      if (result.error) return say(result.error)
      router.refresh()
    })
  }

  const addPhotos = (defect: DefectRow, list: FileList | null) => {
    const chosen = Array.from(list ?? [])
    if (chosen.length === 0) return
    setError(null)
    setBusy(defect.id)
    startTransition(async () => {
      await sendPhotos(chosen, defect.id)
      setBusy(null)
      router.refresh()
    })
  }

  const row = (defect: DefectRow) => (
    <li key={defect.id} className={`flex gap-3 ${pad} py-3 ${text}`}>
      {defect.resolved ? (
        office ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(defect, false)}
            title={t('reopen')}
            aria-label={t('reopen')}
            className={`mt-0.5 flex ${large ? 'h-8 w-8' : 'h-6 w-6'} shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 transition-colors hover:bg-subtle hover:text-muted dark:text-emerald-400`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <span className={`mt-0.5 flex ${large ? 'h-8 w-8' : 'h-6 w-6'} shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400`}>
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
        )
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(defect, true)}
          title={t('markDone')}
          aria-label={`${t('markDone')}: ${defect.title}`}
          className={`mt-0.5 flex ${large ? 'h-8 w-8' : 'h-6 w-6'} shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent transition-colors hover:border-emerald-500 hover:text-emerald-600`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`font-medium ${defect.resolved ? 'text-muted line-through' : ''}`}>{defect.title}</span>
          {defect.due && (
            <span className={`rounded-sm px-1 ${small} tabular-nums ${defect.due.tone ? TONE[defect.due.tone] : 'text-muted'}`} title={t('dueDate')}>
              {t('dueBy', { date: defect.due.text })}
            </span>
          )}
          {defect.deletable && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setRemoving(defect)}
              title={tc('delete')}
              aria-label={tc('delete')}
              className="ml-auto rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        {(defect.location || defect.assignee) && (
          <p className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 ${small} text-muted`}>
            {defect.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                {defect.location}
              </span>
            )}
            {defect.assignee && (
              <span className="inline-flex items-center gap-1" title={t('assignee')}>
                <User className="h-3 w-3 shrink-0" aria-hidden />
                {defect.assignee}
              </span>
            )}
          </p>
        )}
        {defect.description && <p className="mt-1 whitespace-pre-wrap break-words">{defect.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {defect.photos.map((photo) => (
            <FilePreview
              key={photo.id}
              id={photo.id}
              filename={photo.filename}
              kind="image"
              labels={previewLabels}
              thumb
              thumbClass={large ? 'h-20 w-20' : 'h-16 w-16'}
            />
          ))}
          {!defect.resolved && (
            <label
              className={`flex ${large ? 'h-20 w-20' : 'h-16 w-16'} shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-[10px] text-muted transition-colors hover:border-accent hover:text-accent ${
                busy === defect.id ? 'pointer-events-none opacity-50' : ''
              }`}
              title={t('addPhoto')}
            >
              <Camera className="h-4 w-4" aria-hidden />
              {t('photo')}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(defect, e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
        <p className={`mt-1.5 ${small} text-muted`}>
          {t('reportedBy', { who: defect.reported })}
          {defect.resolved && <> · {t('resolvedBy', { who: defect.resolved })}</>}
        </p>
      </div>
    </li>
  )

  const list = (
    <>
      {open.length === 0 ? (
        <p className={`${pad} py-4 ${text} text-muted`}>{done.length > 0 ? t('noneOpen') : t('none')}</p>
      ) : (
        <ul className="divide-y divide-border">{open.map(row)}</ul>
      )}
      {done.length > 0 && (
        <details className="border-t border-border">
          <summary className={`cursor-pointer select-none ${pad} py-2 ${small} font-medium text-muted hover:text-foreground`}>
            {t('doneCount', { count: done.length })}
          </summary>
          <ul className="divide-y divide-border border-t border-border">{done.map(row)}</ul>
        </details>
      )}
    </>
  )

  const form = adding ? (
    <form key={formKey} onSubmit={submit} className={`space-y-3 border-t border-border ${pad} py-3`}>
      <div>
        <label htmlFor={`defect-title-${projectId}`} className={`block ${small} font-medium`}>
          {t('title')} *
        </label>
        <input
          id={`defect-title-${projectId}`}
          name="title"
          required
          autoFocus
          maxLength={DEFECT_TITLE_MAX}
          placeholder={t('titlePlaceholder')}
          className={input}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`defect-location-${projectId}`} className={`block ${small} font-medium`}>
            {t('location')}
          </label>
          <input
            id={`defect-location-${projectId}`}
            name="location"
            maxLength={DEFECT_LOCATION_MAX}
            placeholder={t('locationPlaceholder')}
            className={input}
          />
        </div>
        {office && (
          <div>
            <label htmlFor={`defect-due-${projectId}`} className={`block ${small} font-medium`}>
              {t('dueDate')}
            </label>
            <input id={`defect-due-${projectId}`} name="dueDate" type="date" className={input} />
          </div>
        )}
      </div>
      {office && assignees && (
        <div>
          <p className={`${small} font-medium`}>{t('assignee')}</p>
          <div className="mt-1">
            <Combobox name="assigneeId" options={assignees} placeholder={t('assigneePlaceholder')} noResultsLabel={t('assigneeNone')} clearable />
          </div>
        </div>
      )}
      <div>
        <label htmlFor={`defect-text-${projectId}`} className={`block ${small} font-medium`}>
          {t('description')}
        </label>
        <textarea id={`defect-text-${projectId}`} name="description" rows={2} maxLength={DEFECT_TEXT_MAX} className={`${input} resize-y`} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${large ? btn.outline : btn.outlineSm} cursor-pointer gap-1.5`}>
          <Camera className="h-4 w-4" aria-hidden />
          {picked > 0 ? t('photosPicked', { count: picked }) : t('addPhoto')}
          <input
            ref={files}
            name="photos"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => setPicked(e.target.files?.length ?? 0)}
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setPicked(0)
              setError(null)
            }}
            className={large ? btn.outline : btn.outlineSm}
          >
            {tc('cancel')}
          </button>
          <button type="submit" disabled={pending} className={large ? btn.primary : btn.primarySm}>
            {pending ? t('sending') : t('report')}
          </button>
        </div>
      </div>
    </form>
  ) : (
    <div className={`border-t border-border ${pad} py-3`}>
      <button type="button" onClick={() => setAdding(true)} className={`${large ? btn.outline : btn.outlineSm} gap-1.5`}>
        <Plus className="h-4 w-4" aria-hidden />
        {t('report')}
      </button>
    </div>
  )

  const foot = (
    <>
      {error && (
        <p role="alert" className={`${pad} pb-3 ${text} text-danger`}>
          {error}
        </p>
      )}
      <AlertDialog
        open={removing !== null}
        title={t('deleteTitle')}
        description={removing ? <span className="block truncate">{removing.title}</span> : ''}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing
          setRemoving(null)
          if (!target) return
          startTransition(async () => {
            const result = await deleteDefect(target.id)
            if (result.error) return say(result.error)
            router.refresh()
          })
        }}
      />
    </>
  )

  if (!frame) {
    return (
      <div>
        {list}
        {form}
        {foot}
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('heading')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
        </div>
        {open.length > 0 && (
          <span className="rounded-full bg-danger/10 px-2 text-xs font-semibold tabular-nums text-danger" title={t('openCount', { count: open.length })}>
            {open.length}
          </span>
        )}
      </div>
      {list}
      {form}
      {foot}
    </section>
  )
}
