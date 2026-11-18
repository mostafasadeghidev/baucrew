'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, Copy, ExternalLink, ImagePlus, Link2, Loader2, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import {
  deleteFeedbackImage,
  noteFeedback,
  removeFeedback,
  updateFeedback,
  uploadFeedbackImage,
  type FeedbackResult,
} from '@/app/feedback-actions'
import {
  FEEDBACK_STATUSES,
  WAITING_ON,
  evidenceMatches,
  hasProposal,
  latestDecision,
  pageLink,
  wordDiff,
  type AttachmentKind,
  type FeedbackAttachmentDTO,
  type FeedbackItemDTO,
  type FeedbackStatus,
} from '@/lib/feedback'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { imageFromFile } from './capture'
import { ImageViewer } from './image-viewer'
import { StatusPill, WaitingChip } from './status-pill'
import { ghostXs, iconButton } from './toolbar-styles'

const field =
  'block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The proposal's fields, edited as one, saved with the rest of the item. */
type ProposalFields = Pick<FeedbackItemDTO, 'suggestion' | 'decision' | 'beforeText' | 'afterText' | 'completionNote'>

export function ItemDrawer({
  item,
  canEdit,
  noteDraft,
  onNoteDraft,
  onClose,
  onCopy,
  onCopyLink,
  onStatus,
}: {
  item: FeedbackItemDTO
  canEdit: boolean
  noteDraft: string
  onNoteDraft: (value: string) => void
  onClose: () => void
  onCopy: (items: FeedbackItemDTO[]) => void
  onCopyLink: (item: FeedbackItemDTO) => void
  onStatus: (item: FeedbackItemDTO, status: FeedbackStatus) => void
}) {
  const t = useTranslations('feedback.detail')
  const tStatus = useTranslations('feedback.status')
  const tWait = useTranslations('feedback.waitingOn')
  const tSource = useTranslations('feedback.source')
  const tErr = useTranslations('feedback.errors')
  const format = useFormatter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [proposalOpen, setProposalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewing, setViewing] = useState<FeedbackAttachmentDTO | null>(null)
  const [response, setResponse] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || viewing || confirmDelete) return
      const typing = e.target instanceof HTMLElement && e.target.closest('textarea, input, select')
      if (typing) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, viewing, confirmDelete])

  function run(action: () => Promise<FeedbackResult>, after?: () => void) {
    setError('')
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) setError(tErr(result.error))
        else after?.()
      } catch {
        setError(tErr('generic'))
      }
    })
  }

  const edit = (patch: Partial<FeedbackItemDTO>, after?: () => void) =>
    run(
      () =>
        updateFeedback(item.id, {
          title: item.title,
          comment: item.comment,
          status: item.status,
          waitingOn: item.waitingOn ?? '',
          suggestion: item.suggestion,
          decision: item.decision,
          beforeText: item.beforeText,
          afterText: item.afterText,
          completionNote: item.completionNote,
          version: item.version,
          ...patch,
        }),
      after
    )

  async function upload(kind: AttachmentKind, file: File | undefined) {
    if (!file) return
    try {
      const image = await imageFromFile(file)
      const form = new FormData()
      form.set('kind', kind)
      form.set('file', new File([image.blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
      form.set('width', String(image.width))
      form.set('height', String(image.height))
      URL.revokeObjectURL(image.url)
      run(() => uploadFeedbackImage(item.id, form))
    } catch {
      setError(tErr('badImage'))
    }
  }

  const pictures = item.attachments.filter((a) => a.kind === 'screenshot' || a.kind === 'upload')
  const notes = item.notes.filter((n) => n.choice === 'note')
  const decisions = item.notes.filter((n) => n.choice !== 'note')
  const decision = latestDecision(decisions)
  const proposed = hasProposal(item)
  const link = pageLink(item)
  const meta = item.metadata ?? {}
  const context = item.context ?? {}
  const size = (v: unknown) => {
    const s = v as { width?: number; height?: number } | undefined
    return s?.width && s?.height ? `${s.width} × ${s.height}` : null
  }

  return createPortal(
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-black/20 lg:bg-transparent" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="feedback-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-2xl sm:w-[min(40rem,100vw)] print:hidden"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-5">
          <span className="text-sm font-medium tabular-nums text-muted">#{item.number}</span>
          {canEdit ? (
            <Select
              compact
              aria-label={t('statusLabel')}
              value={item.status}
              disabled={pending}
              onChange={(e) => onStatus(item, e.target.value as FeedbackStatus)}
            >
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tStatus(s)}
                </option>
              ))}
            </Select>
          ) : (
            <StatusPill status={item.status} />
          )}
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => onCopy([item])} className={btn.ghost} title={t('copy')}>
              <Copy className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('copy')}</span>
            </button>
            <button type="button" onClick={() => onCopyLink(item)} className={iconButton} aria-label={t('copyLink')} title={t('copyLink')}>
              <Link2 className="h-4 w-4" aria-hidden />
            </button>
            {link && (
              <Link href={link} className={iconButton} aria-label={t('openPage')} title={t('openPage')}>
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
            )}
            {canEdit && (
              <Menu
                side="bottom"
                align="end"
                label={t('more')}
                className={iconButton}
                trigger={<MoreHorizontal className="h-4 w-4" aria-label={t('more')} />}
              >
                <button type="button" role="menuitem" className={menuItemClass} onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  {t('edit')}
                </button>
                <button type="button" role="menuitem" className={menuItemClass} onClick={() => setProposalOpen(true)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  {proposed ? t('editProposal') : t('recordProposal')}
                </button>
                <MenuSeparator />
                <button type="button" role="menuitem" className={`${menuItemClass} text-danger hover:bg-danger/10`} onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t('delete')}
                </button>
              </Menu>
            )}
            <button ref={closeRef} type="button" onClick={onClose} className={iconButton} aria-label={t('close')} title={t('close')}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error && (
            <p role="alert" className="mx-5 mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger sm:mx-6">
              {error}
            </p>
          )}

          <div className="space-y-4 px-5 py-5 sm:px-6">
            {editing ? (
              <EditForm
                item={item}
                pending={pending}
                onCancel={() => setEditing(false)}
                onSave={(patch) => edit(patch, () => setEditing(false))}
              />
            ) : (
              <>
                <h2 id="feedback-drawer-title" className="text-lg font-semibold leading-snug tracking-tight">
                  {item.title}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>{item.author?.name ?? tSource(item.source)}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                  {item.source !== 'comment' && item.author && (
                    <span className="ml-1 inline-flex h-6 items-center rounded-full bg-subtle px-2">{tSource(item.source)}</span>
                  )}
                  {item.waitingOn && <WaitingChip waitingOn={item.waitingOn} />}
                </div>
                {item.comment && item.comment !== item.title && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.comment}</p>
                )}
              </>
            )}

            {item.decision && !editing && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t('decisionNeeded')}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.decision}</p>
              </div>
            )}

            {(pictures.length > 0 || item.anchor) && (
              <div className="space-y-3">
                {pictures.length > 0 && (
                  <div className={`grid gap-2 ${pictures.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {pictures.map((p) => (
                      <Thumb key={p.id} image={p} label={t(p.kind === 'upload' ? 'upload' : 'screenshot')} onOpen={() => setViewing(p)} onRemove={canEdit ? () => run(() => deleteFeedbackImage(p.id)) : undefined} removeLabel={t('removeImage')} />
                    ))}
                  </div>
                )}
                {item.anchor && (
                  <div className="flex items-start gap-3 rounded-xl bg-subtle px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted">{t('selectedText')}</p>
                      <p className="mt-1 line-clamp-4 break-words text-sm">{item.anchor.text || t('wholePage')}</p>
                    </div>
                    {link && (
                      <Link href={link} className={`${btn.outlineXs} shrink-0`}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        {t('openPage')}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
            {canEdit && !editing && (
              <ImagePicker label={t('addImage')} onPick={(f) => void upload('upload', f)} disabled={pending} />
            )}
          </div>

          <Section title={t('notesTitle')} hint={t('notesHint')}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!noteDraft.trim()) return
                run(() => noteFeedback(item.id, { choice: 'note', body: noteDraft, version: item.version }), () => onNoteDraft(''))
              }}
              className="space-y-2"
            >
              <textarea
                value={noteDraft}
                onChange={(e) => onNoteDraft(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder={t('notePlaceholder')}
                aria-label={t('notesTitle')}
                className={field}
              />
              <div className="flex justify-end">
                <button type="submit" disabled={pending || !noteDraft.trim()} className={btn.outlineSm}>
                  {t('addNote')}
                </button>
              </div>
            </form>
            {notes.length > 0 ? (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-border px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                    <p className="mt-1.5 text-xs text-muted">
                      {n.author?.name ?? t('unknown')} · {date(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('noNotes')}</p>
            )}
          </Section>

          {(proposed || proposalOpen) && (
            <Section
              title={t('proposalTitle')}
              action={
                decision && !proposalOpen ? (
                  <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium ${decision.choice === 'accept' ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300' : 'bg-danger/10 text-danger'}`}>
                    {decision.choice === 'accept' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                    {t(decision.choice === 'accept' ? 'accepted' : 'rejected')}
                  </span>
                ) : canEdit && !proposalOpen ? (
                  <button type="button" onClick={() => setProposalOpen(true)} className={btn.outlineXs}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {t('editProposal')}
                  </button>
                ) : undefined
              }
            >
              {proposalOpen ? (
                <ProposalForm
                  item={item}
                  pending={pending}
                  onCancel={() => setProposalOpen(false)}
                  onSave={(patch) => edit(patch, () => setProposalOpen(false))}
                  onUpload={(kind, file) => void upload(kind, file)}
                  onRemove={(id) => run(() => deleteFeedbackImage(id))}
                />
              ) : (
                <Proposal item={item} onOpen={setViewing} />
              )}

              {!proposalOpen && canEdit && (
                <div className="space-y-2 rounded-xl bg-subtle p-4">
                  <label htmlFor="feedback-response" className="text-sm font-medium">
                    {t('yourResponse')}
                  </label>
                  <textarea id="feedback-response" value={response} onChange={(e) => setResponse(e.target.value)} rows={2} maxLength={4000} placeholder={t('responsePlaceholder')} className={field} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">{t('decisionSeparate')}</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={pending} onClick={() => run(() => noteFeedback(item.id, { choice: 'reject', body: response, version: item.version }), () => setResponse(''))} className={btn.dangerSm}>
                        <X className="h-4 w-4" aria-hidden />
                        {t('reject')}
                      </button>
                      <button type="button" disabled={pending} onClick={() => run(() => noteFeedback(item.id, { choice: 'accept', body: response, version: item.version }), () => setResponse(''))} className={btn.primarySm}>
                        <Check className="h-4 w-4" aria-hidden />
                        {t('accept')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {decisions.length > 0 && !proposalOpen && (
                <ul className="space-y-2">
                  {decisions.map((d) => {
                    const current = evidenceMatches(d.evidence, item)
                    return (
                      <li key={d.id} className="flex items-start gap-3 text-sm">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${d.choice === 'accept' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-danger/10 text-danger'}`}>
                          {d.choice === 'accept' ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <p>
                            <span className="font-medium">{t(d.choice === 'accept' ? 'accepted' : 'rejected')}</span>
                            {d.body && <span className="text-muted"> — {d.body}</span>}
                          </p>
                          <p className="text-xs text-muted">
                            {d.author?.name ?? t('unknown')} · {date(d.createdAt)}
                            {!current && <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-400">· {t('stale')}</span>}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          )}

          {!proposed && !proposalOpen && canEdit && (
            <div className="border-t border-border px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setProposalOpen(true)} className={btn.outlineSm}>
                <Pencil className="h-4 w-4" aria-hidden />
                {t('recordProposal')}
              </button>
            </div>
          )}

          <Section title={t('historyTitle')}>
            <ol className="space-y-2.5">
              {item.changes.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                  <span>
                    {c.from ? t('changed', { from: tStatus(c.from), to: tStatus(c.to) }) : t('created', { status: tStatus(c.to) })}
                  </span>
                  <span className="text-xs text-muted">
                    {c.by ? `${t('by', { name: c.by.name })} · ` : ''}
                    {date(c.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <details className="group border-t border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold sm:px-6 [&::-webkit-details-marker]:hidden">
              {t('details')}
              <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 px-5 pb-6 text-sm sm:px-6">
              <Row label={t('number')} value={`#${item.number}`} />
              <Row label={t('author')} value={item.author?.name} />
              <Row label={t('createdAt')} value={date(item.createdAt)} />
              <Row label={t('updatedAt')} value={date(item.updatedAt)} />
              <Row label={t('page')} value={item.page} mono />
              <Row label={tWait('label')} value={item.waitingOn ? tWait(item.waitingOn) : null} />
              <Row label={t('device')} value={meta.device as string} />
              <Row label={t('browser')} value={[meta.browser, meta.os].filter(Boolean).join(' · ') || null} />
              <Row label={t('viewport')} value={size(meta.viewport)} />
              <Row label={t('screen')} value={size(meta.screen) ? `${size(meta.screen)}${meta.pixelRatio ? ` @${meta.pixelRatio}x` : ''}` : null} />
              <Row label={t('language')} value={meta.language as string} />
              <Row label={t('timezone')} value={meta.timezone as string} />
              <Row label={t('selector')} value={item.anchor?.selector} mono />
              <Row label={t('session')} value={(context.sessionTitle as string) ?? (context.session as string)} />
              <Row label={t('refs')} value={Array.isArray(context.refs) && context.refs.length ? (context.refs as string[]).join(', ') : null} />
            </dl>
          </details>
        </div>
      </aside>

      {viewing && <ImageViewer image={viewing} onClose={() => setViewing(null)} />}
      <AlertDialog
        open={confirmDelete}
        title={t('delete')}
        description={t('deleteConfirm')}
        confirmLabel={t('delete')}
        cancelLabel={t('close')}
        destructive
        pending={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          run(() => removeFeedback(item.id), onClose)
        }}
      />
    </>,
    document.body
  )
}

function Row({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 break-words ${mono ? 'font-mono text-xs leading-5' : ''}`}>{value}</dd>
    </>
  )
}

function Thumb({ image, label, onOpen, onRemove, removeLabel }: { image: FeedbackAttachmentDTO; label: string; onOpen: () => void; onRemove?: () => void; removeLabel: string }) {
  const t = useTranslations('feedback.detail')
  return (
    <figure className="group relative overflow-hidden rounded-xl border border-border bg-subtle">
      <button type="button" onClick={onOpen} className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${t('openImage')}: ${image.filename}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a protected file the route serves itself */}
        <img src={image.url} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover object-top" />
      </button>
      <figcaption className="flex items-center justify-between gap-2 border-t border-border bg-surface px-3 py-1.5 text-xs text-muted">
        <span className="truncate">{label}</span>
        {image.width && image.height && <span className="tabular-nums">{image.width}×{image.height}</span>}
      </figcaption>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel} className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md bg-surface/90 text-muted shadow-md hover:text-danger group-hover:flex focus-visible:flex">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </figure>
  )
}

function ImagePicker({ label, onPick, disabled }: { label: string; onPick: (file: File | undefined) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => (onPick(e.target.files?.[0]), (e.target.value = ''))} />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={btn.outlineXs}>
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
    </>
  )
}

function EditForm({ item, pending, onSave, onCancel }: { item: FeedbackItemDTO; pending: boolean; onSave: (patch: Partial<FeedbackItemDTO>) => void; onCancel: () => void }) {
  const t = useTranslations('feedback.detail')
  const tWait = useTranslations('feedback.waitingOn')
  const tc = useTranslations('common')
  const [title, setTitle] = useState(item.title)
  const [comment, setComment] = useState(item.comment)
  const [waitingOn, setWaitingOn] = useState(item.waitingOn ?? '')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title, comment, waitingOn: (waitingOn || null) as FeedbackItemDTO['waitingOn'] })
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t('titleLabel')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className={`${field} h-9 py-0`} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t('commentLabel')}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} maxLength={4000} className={field} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{tWait('label')}</span>
        <Select value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} className="w-full">
          <option value="">{tWait('none')}</option>
          {WAITING_ON.map((w) => (
            <option key={w} value={w}>
              {tWait(w)}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btn.outlineSm}>
          {tc('cancel')}
        </button>
        <button type="submit" disabled={pending || !title.trim()} className={btn.primarySm}>
          {pending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}

function ProposalForm({
  item,
  pending,
  onSave,
  onCancel,
  onUpload,
  onRemove,
}: {
  item: FeedbackItemDTO
  pending: boolean
  onSave: (patch: ProposalFields) => void
  onCancel: () => void
  onUpload: (kind: 'before' | 'after', file: File | undefined) => void
  onRemove: (id: string) => void
}) {
  const t = useTranslations('feedback.detail')
  const tc = useTranslations('common')
  const [values, setValues] = useState<ProposalFields>({
    suggestion: item.suggestion,
    decision: item.decision,
    beforeText: item.beforeText,
    afterText: item.afterText,
    completionNote: item.completionNote,
  })
  const set = (key: keyof ProposalFields) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }))
  const area = (key: keyof ProposalFields, label: string, rows = 3, mono = false) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea value={values[key]} onChange={set(key)} rows={rows} maxLength={key === 'beforeText' || key === 'afterText' ? 10000 : 4000} className={`${field} ${mono ? 'font-mono text-xs' : ''}`} />
    </label>
  )
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(values)
      }}
    >
      <p className="text-xs text-muted">{t('proposalFormHint')}</p>
      {area('suggestion', t('suggestion'))}
      {area('decision', t('decisionNeeded'), 2)}
      <div className="grid gap-3 sm:grid-cols-2">
        {area('beforeText', t('before'), 4, true)}
        {area('afterText', t('after'), 4, true)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['before', 'after'] as const).map((kind) => (
          <div key={kind} className="space-y-2">
            <p className="text-sm font-medium">{t(kind === 'before' ? 'beforeImage' : 'afterImage')}</p>
            {item.attachments
              .filter((a) => a.kind === kind)
              .map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a protected file */}
                  <img src={a.url} alt="" className="h-10 w-14 rounded-md border border-border object-cover" />
                  <span className="min-w-0 flex-1 truncate text-muted">{a.filename}</span>
                  <button type="button" onClick={() => onRemove(a.id)} className={ghostXs}>
                    {t('removeImage')}
                  </button>
                </div>
              ))}
            <ImagePicker label={t('addImage')} onPick={(f) => onUpload(kind, f)} disabled={pending} />
          </div>
        ))}
      </div>
      {area('completionNote', t('completionNote'), 2)}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btn.outlineSm}>
          {tc('cancel')}
        </button>
        <button type="submit" disabled={pending} className={btn.primarySm}>
          {pending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}

/** The proposal as it stands: the suggestion, the change, the pictures, how it was checked. */
function Proposal({ item, onOpen }: { item: FeedbackItemDTO; onOpen: (image: FeedbackAttachmentDTO) => void }) {
  const t = useTranslations('feedback.detail')
  const before = item.attachments.filter((a) => a.kind === 'before')
  const after = item.attachments.filter((a) => a.kind === 'after')
  const textChanged = item.beforeText !== item.afterText
  return (
    <div className="space-y-4">
      {item.suggestion && <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.suggestion}</p>}
      {textChanged && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-subtle px-4 py-2 text-xs font-medium text-muted">{t('diff')}</p>
          <p className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-6">
            {wordDiff(item.beforeText, item.afterText).map((part, i) =>
              part.type === 'same' ? (
                <span key={i}>{part.text}</span>
              ) : part.type === 'del' ? (
                <del key={i} className="rounded-sm bg-danger/12 text-danger decoration-danger/60">
                  {part.text}
                </del>
              ) : (
                <ins key={i} className="rounded-sm bg-emerald-500/15 text-emerald-800 no-underline dark:text-emerald-300">
                  {part.text}
                </ins>
              )
            )}
          </p>
        </div>
      )}
      {(before.length > 0 || after.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['before', before],
              ['after', after],
            ] as const
          ).map(([kind, images]) => (
            <div key={kind} className="space-y-1.5">
              <p className="text-xs font-medium text-muted">{t(kind)}</p>
              {images.length ? (
                images.map((image) => (
                  <button key={image.id} type="button" onClick={() => onOpen(image)} className="block w-full overflow-hidden rounded-xl border border-border" aria-label={`${t('openImage')}: ${image.filename}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a protected file */}
                    <img src={image.url} alt="" className="aspect-[4/3] w-full object-cover object-top" />
                  </button>
                ))
              ) : (
                <p className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">{t('newAddition')}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {item.completionNote && (
        <div>
          <p className="text-xs font-medium text-muted">{t('completionNote')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.completionNote}</p>
        </div>
      )}
    </div>
  )
}
