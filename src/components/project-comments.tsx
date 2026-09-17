'use client'

/**
 * The team talking on the project, the way it talks under a Trello card:
 * short comments, oldest first, and a box to write the next one. An @ names
 * somebody — the picker under the box offers the accounts as the name is
 * typed — and the automations hear of every comment with the people it
 * names, so a message can reach them in Telegram or by mail. A comment marked
 * "nur Büro" stays with the office.
 *
 * Drawn on the project page, in the card sheet over the board and on the
 * crew's phone; each hands in the actions it may use.
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Send, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { PERSON_SWATCH } from '@/components/swatches'
import {
  COMMENT_MAX,
  commentSegments,
  mentionMatches,
  mentionQuery,
  type CommentResult,
  type Mentionable,
} from '@/lib/comments'

export type CommentRow = {
  id: string
  body: string
  /** When it was written, already formatted. */
  when: string
  author: { name: string; initials: string; swatch: number } | null
  /** Marked for the office only. */
  office: boolean
  /** Whether the reader may take it back — the author, or an administrator. */
  deletable: boolean
}

export function ProjectComments({
  projectId,
  comments,
  people,
  add,
  remove,
  canMarkOffice = true,
  frame = true,
  large = false,
}: {
  projectId: string
  comments: CommentRow[]
  /** Everybody who can be named with @. */
  people: Mentionable[]
  add: (projectId: string, formData: FormData) => Promise<CommentResult>
  remove: (id: string) => Promise<CommentResult>
  /** Whether "nur Büro" is offered — not to the crew. */
  canMarkOffice?: boolean
  /** With its own card and title, or bare inside somebody else's. */
  frame?: boolean
  /** Larger type and targets, for the phone. */
  large?: boolean
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const [removing, setRemoving] = useState<CommentRow | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const office = useRef<HTMLInputElement>(null)

  const matches = pick ? mentionMatches(pick.query, people) : []
  const body = large ? 'text-base' : 'text-sm'
  const pad = frame ? 'px-5' : 'px-0'
  const small = large ? 'text-sm' : 'text-xs'

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setText(value)
    setPick(mentionQuery(value, e.target.selectionStart ?? value.length))
    setActive(0)
  }

  /** The picked account name replaces what was typed after the @. */
  function insert(person: Mentionable) {
    if (!pick) return
    const caret = area.current?.selectionStart ?? text.length
    const next = `${text.slice(0, pick.start)}@${person.username} ${text.slice(caret)}`
    const pos = pick.start + person.username.length + 2
    setText(next)
    setPick(null)
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (pick && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insert(matches[active])
        return
      }
      if (e.key === 'Escape') {
        setPick(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) {
      setError(t('commentEmpty'))
      return
    }
    const data = new FormData()
    data.set('body', trimmed)
    if (office.current?.checked) data.set('office', 'on')
    setError(null)
    startTransition(async () => {
      const result = await add(projectId, data)
      if (result.error) {
        setError(result.error === 'empty' ? t('commentEmpty') : result.error === 'notAllowed' ? t('commentNotAllowed') : tc('saveFailed'))
        return
      }
      setText('')
      setPick(null)
      if (office.current) office.current.checked = false
      router.refresh()
    })
  }

  const takeBack = (comment: CommentRow) =>
    startTransition(async () => {
      const result = await remove(comment.id)
      if (result.error) setError(tc('saveFailed'))
      router.refresh()
    })

  const list =
    comments.length === 0 ? (
      <p className={`${pad} py-4 ${body} text-muted`}>{t('commentsNone')}</p>
    ) : (
      <ul className="divide-y divide-border">
        {comments.map((comment) => (
          <li key={comment.id} className={`flex gap-3 ${pad} py-3 ${body}`}>
            <span
              aria-hidden
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                comment.author ? PERSON_SWATCH[comment.author.swatch] : 'bg-subtle text-muted'
              }`}
            >
              {comment.author?.initials ?? '—'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium">{comment.author?.name ?? t('commentNoAuthor')}</span>
                <span className={`${small} tabular-nums text-muted`}>{comment.when}</span>
                {comment.office && (
                  <span className="rounded-sm bg-amber-500/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    {t('commentOfficeTag')}
                  </span>
                )}
                {comment.deletable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRemoving(comment)}
                    title={tc('delete')}
                    aria-label={tc('delete')}
                    className="ml-auto rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words">
                {commentSegments(comment.body, people).map((segment, i) =>
                  segment.mention ? (
                    <span key={i} title={segment.mention.name} className="rounded-sm bg-accent/10 px-0.5 font-medium text-accent">
                      {segment.text}
                    </span>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  )
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    )

  const form = (
    <div className={frame ? 'border-t border-border px-5 py-3' : 'pt-2'}>
      <div className="relative">
        <textarea
          ref={area}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setPick(null), 150)}
          rows={large ? 2 : 3}
          maxLength={COMMENT_MAX}
          placeholder={t('commentPlaceholder')}
          aria-label={t('commentsTitle')}
          className={`block w-full resize-y rounded-md border border-border bg-background px-3 py-2 ${body} focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring`}
        />
        {pick && matches.length > 0 && (
          <ul
            role="listbox"
            aria-label={t('commentMentionHint')}
            className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
          >
            {matches.map((person, i) => (
              <li key={person.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  // Before blur takes the picker away.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(person)}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left ${body} ${
                    i === active ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                  }`}
                >
                  <span className="font-medium">@{person.username}</span>
                  {person.name !== person.username && <span className={`truncate ${small} text-muted`}>{person.name}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {canMarkOffice && (
          <label className={`flex items-center gap-2 ${small} text-muted`}>
            <input ref={office} type="checkbox" name="office" className="h-4 w-4 accent-[var(--accent)]" />
            {t('commentOffice')}
          </label>
        )}
        {!large && <span className="text-[11px] text-muted">{t('commentShortcut')}</span>}
        <button type="button" onClick={submit} disabled={pending} className={`${large ? btn.primary : btn.primarySm} ml-auto gap-1.5`}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          {t('commentSend')}
        </button>
      </div>
      {error && (
        <p role="alert" className={`mt-2 ${body} text-danger`}>
          {error}
        </p>
      )}
    </div>
  )

  const dialog = (
    <AlertDialog
      open={removing !== null}
      title={t('commentDelete')}
      description={removing ? <span className="block truncate">{removing.body}</span> : ''}
      confirmLabel={tc('delete')}
      cancelLabel={tc('cancel')}
      destructive
      pending={pending}
      onCancel={() => setRemoving(null)}
      onConfirm={() => {
        if (removing) takeBack(removing)
        setRemoving(null)
      }}
    />
  )

  if (!frame) {
    return (
      <div>
        {list}
        {form}
        {dialog}
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t('commentsTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('commentsHint')}</p>
        </div>
        {comments.length > 0 && <span className="text-xs tabular-nums text-muted">{comments.length}</span>}
      </div>
      {list}
      {form}
      {dialog}
    </section>
  )
}
