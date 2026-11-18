'use client'

/**
 * The tasks of a project, or of a person across projects: a circle to tick,
 * the title, who has it and by when, and a line to add the next one. Drawn on
 * the project page, in the site overview and on the crew's phone; the actions
 * know who may do what, this only leaves out what the reader cannot do anyway.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Camera, Check, Image as ImageIcon, Plus, User, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { Menu, menuItemClass } from '@/components/ui/menu'
import { PhotoGallery } from '@/components/photo-gallery'
import { usePhotoPicker } from '@/components/photo-picker'
import { uploadTaskPhoto } from '@/lib/photo-upload'
import { addTask, completeTask, deleteTask, deleteTaskPhoto } from '@/app/task-actions'
import { TASK_TEXT_MAX, TASK_TITLE_MAX, type TaskRow } from '@/lib/tasks'

export type { TaskRow } from '@/lib/tasks'

const TONE = {
  late: 'bg-danger/10 text-danger',
  soon: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
} as const

export function ProjectTasks({
  projectId,
  tasks,
  assignees,
  office,
  frame = true,
  large = false,
  compact = false,
}: {
  /** The project a new task goes on; without one the list only reads and ticks. */
  projectId?: string
  /** Open ones first — the list is drawn in the order it comes in. */
  tasks: TaskRow[]
  /** Who a task can be given to; only the office says. */
  assignees?: ComboboxOption[]
  /** The office: gives a task to somebody and a day. */
  office: boolean
  /** With its own card and title, or bare inside somebody else's. */
  frame?: boolean
  /** Larger type and targets, for the phone. */
  large?: boolean
  /** No line to add to, no done list: the open tasks alone, for an overview. */
  compact?: boolean
}) {
  const t = useTranslations('tasks')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<TaskRow | null>(null)
  const [formKey, setFormKey] = useState(0)

  const open = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)
  const text = large ? 'text-base' : 'text-sm'
  const small = large ? 'text-sm' : 'text-xs'
  const pad = frame ? 'px-5' : 'px-0'
  const input = `mt-1 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 ${text} focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent`

  const say = (code: string | undefined) =>
    setError(code === 'titleRequired' ? t('titleRequired') : code === 'notAllowed' ? t('notAllowed') : tc('saveFailed'))

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!projectId) return
    const data = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await addTask(projectId, data)
      if (result.error) return say(result.error)
      setAdding(false)
      setFormKey((k) => k + 1)
      router.refresh()
    })
  }

  const toggle = (task: TaskRow, next: boolean) => {
    setError(null)
    startTransition(async () => {
      const result = await completeTask(task.id, next)
      if (result.error) return say(result.error)
      router.refresh()
    })
  }

  const circle = large ? 'h-8 w-8' : 'h-6 w-6'
  const row = (task: TaskRow) => (
    <li key={task.id} className={`flex gap-3 ${pad} py-2.5 ${text}`}>
      <button
        type="button"
        disabled={pending}
        onClick={() => toggle(task, !task.done)}
        title={task.done ? t('reopen') : t('markDone')}
        aria-label={`${task.done ? t('reopen') : t('markDone')}: ${task.title}`}
        className={`mt-0.5 flex ${circle} shrink-0 items-center justify-center rounded-full transition-colors ${
          task.done
            ? 'bg-emerald-500/15 text-emerald-700 hover:bg-subtle hover:text-muted dark:text-emerald-400'
            : 'border-2 border-border text-transparent hover:border-emerald-500 hover:text-emerald-600'
        }`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`font-medium ${task.done ? 'text-muted line-through' : ''}`}>{task.title}</span>
          {task.due && (
            <span className={`rounded-sm px-1 ${small} tabular-nums ${task.due.tone ? TONE[task.due.tone] : 'text-muted'}`} title={t('dueDate')}>
              {t('dueBy', { date: task.due.text })}
            </span>
          )}
          {task.assignee && (
            <span className={`inline-flex items-center gap-1 ${small} ${task.mine ? 'font-medium text-accent' : 'text-muted'}`} title={t('assignee')}>
              <User className="h-3 w-3 shrink-0" aria-hidden />
              {task.mine ? t('you') : task.assignee}
            </span>
          )}
          {task.deletable && !compact && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setRemoving(task)}
              title={tc('delete')}
              aria-label={tc('delete')}
              className="ml-auto rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        {task.project && (
          <Link href={`/projects/${task.project.id}`} className={`block truncate ${small} text-accent hover:underline`}>
            {task.project.label}
          </Link>
        )}
        {task.description && !compact && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">{task.description}</p>}
        {!compact && (
          <p className={`mt-1 ${small} text-muted`}>
            {t('madeBy', { who: task.made })}
            {task.done && <> · {t('doneBy', { who: task.done })}</>}
          </p>
        )}
        {!compact && (task.project?.id ?? projectId) && <TaskPhotos projectId={task.project?.id ?? projectId!} task={task} large={large} />}
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
      {done.length > 0 && !compact && (
        <details className="border-t border-border">
          <summary className={`cursor-pointer select-none ${pad} py-2 ${small} font-medium text-muted hover:text-foreground`}>
            {t('doneCount', { count: done.length })}
          </summary>
          <ul className="divide-y divide-border border-t border-border">{done.map(row)}</ul>
        </details>
      )}
    </>
  )

  const form =
    !projectId || compact ? null : adding ? (
      <form key={formKey} onSubmit={submit} className={`space-y-3 border-t border-border ${pad} py-3`}>
        <div>
          <label htmlFor={`task-title-${projectId}`} className={`block ${small} font-medium`}>
            {t('title')} *
          </label>
          <input id={`task-title-${projectId}`} name="title" required autoFocus maxLength={TASK_TITLE_MAX} placeholder={t('titlePlaceholder')} className={input} />
        </div>
        {office && (
          <div className="grid gap-3 sm:grid-cols-2">
            {assignees && (
              <div>
                <p className={`${small} font-medium`}>{t('assignee')}</p>
                <div className="mt-1">
                  <Combobox name="assigneeId" options={assignees} placeholder={t('assigneePlaceholder')} noResultsLabel={t('assigneeNone')} clearable />
                </div>
              </div>
            )}
            <div>
              <label htmlFor={`task-due-${projectId}`} className={`block ${small} font-medium`}>
                {t('dueDate')}
              </label>
              <input id={`task-due-${projectId}`} name="dueDate" type="date" className={input} />
            </div>
          </div>
        )}
        <div>
          <label htmlFor={`task-text-${projectId}`} className={`block ${small} font-medium`}>
            {t('description')}
          </label>
          <textarea id={`task-text-${projectId}`} name="description" rows={2} maxLength={TASK_TEXT_MAX} className={`${input} resize-y`} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setError(null)
            }}
            className={large ? btn.outline : btn.outlineSm}
          >
            {tc('cancel')}
          </button>
          <button type="submit" disabled={pending} className={large ? btn.primary : btn.primarySm}>
            {t('add')}
          </button>
        </div>
      </form>
    ) : (
      <div className={`border-t border-border ${pad} py-3`}>
        <button type="button" onClick={() => setAdding(true)} className={`${large ? btn.outline : btn.outlineSm} gap-1.5`}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('add')}
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
            const result = await deleteTask(target.id)
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
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('heading')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
        </div>
        {open.length > 0 && (
          <span className="rounded-full bg-accent/10 px-2 text-xs font-semibold tabular-nums text-accent" title={t('openCount', { count: open.length })}>
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

/**
 * A task's photos — taken on the site as proof it is done, or of what stands
 * in its way: the tiles, opening large, and "Foto" to add more. On a phone the
 * camera and the gallery are both offered; at a desk, the file picker. The
 * photos are the project's own files too, in its "Aufgaben" folder.
 */
function TaskPhotos({ projectId, task, large }: { projectId: string; task: TaskRow; large: boolean }) {
  const t = useTranslations('tasks')
  const router = useRouter()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const send = (files: File[]) => {
    setError(null)
    setProgress({ done: 0, total: files.length })
    startTransition(async () => {
      let failed = 0
      for (const [i, file] of files.entries()) {
        const result = await uploadTaskPhoto(projectId, task.id, file)
        if ('error' in result) failed++
        setProgress({ done: i + 1, total: files.length })
      }
      setProgress(null)
      if (failed > 0) setError(t('photoFailed', { count: failed }))
      router.refresh()
    })
  }
  const picker = usePhotoPicker(send)

  const button = `${large ? btn.outline : btn.outlineXs} gap-1.5`
  const label = progress ? t('photoSending', { done: progress.done, total: progress.total }) : t('photoAdd')
  return (
    <div className="mt-2 space-y-2">
      {picker.inputs}
      {task.photos.length > 0 && (
        <PhotoGallery
          photos={task.photos.map((p) => ({ id: p.id, filename: p.filename, href: `/api/files/${p.id}`, deletable: p.deletable }))}
          tileClass={large ? 'h-20 w-20' : 'h-14 w-14'}
          onDelete={async (id) => {
            const result = await deleteTaskPhoto(id)
            if (result.error) setError(t('notAllowed'))
            router.refresh()
          }}
        />
      )}
      {picker.touch ? (
        <Menu
          side="bottom"
          align="start"
          label={t('photoAdd')}
          className={button}
          trigger={
            <span className="inline-flex items-center gap-1.5">
              <Camera className="h-4 w-4" aria-hidden />
              {label}
            </span>
          }
        >
          <button type="button" role="menuitem" disabled={progress !== null} onClick={picker.openCamera} className={menuItemClass}>
            <Camera className="h-4 w-4 text-muted" aria-hidden />
            {t('photoCamera')}
          </button>
          <button type="button" role="menuitem" disabled={progress !== null} onClick={picker.openGallery} className={menuItemClass}>
            <ImageIcon className="h-4 w-4 text-muted" aria-hidden />
            {t('photoGallery')}
          </button>
        </Menu>
      ) : (
        <button type="button" disabled={progress !== null} onClick={picker.openGallery} className={button}>
          <Camera className="h-4 w-4" aria-hidden />
          {label}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
