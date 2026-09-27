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
 *
 * Beside a project — `column` — it is the talk next to the work, the way a
 * Trello card keeps its comments on the right: as tall as the window lets it
 * be, the comments scrolling inside it with the newest in view, and the box to
 * write in always at its foot.
 *
 * Each comment reads like a Trello one: the name and the time over the text in
 * a bubble, and under it the signs people answered with and what can be done —
 * a sign of one's own, "Antworten" (the box starts with the author's @name),
 * and for the author "Bearbeiten" (the text is put right in place, marked
 * "bearbeitet" from then on) and "Löschen".
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Send, SmilePlus } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { PERSON_SWATCH } from '@/components/swatches'
import {
  COMMENT_MAX,
  REACTIONS,
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
  /** The author's account name, for "Antworten". */
  username?: string | null
  /** Whether the reader may put it right — the author alone. */
  editable?: boolean
  /** Put right since it was written. */
  edited?: boolean
  /** The signs under it, in the order they are offered. */
  reactions?: Array<{ emoji: string; count: number; mine: boolean; names: string[] }>
}

export function ProjectComments({
  projectId,
  comments,
  people,
  add,
  remove,
  edit,
  react,
  canMarkOffice = true,
  frame = true,
  large = false,
  column = false,
}: {
  projectId: string
  comments: CommentRow[]
  /** Everybody who can be named with @. */
  people: Mentionable[]
  add: (projectId: string, formData: FormData) => Promise<CommentResult>
  remove: (id: string) => Promise<CommentResult>
  /** Putting one's own comment right; left out where it is not offered. */
  edit?: (id: string, body: string) => Promise<CommentResult>
  /** A sign under a comment, given or taken back; left out where it is not offered. */
  react?: (id: string, emoji: string) => Promise<CommentResult>
  /** Whether "nur Büro" is offered — not to the crew. */
  canMarkOffice?: boolean
  /** With its own card and title, or bare inside somebody else's. */
  frame?: boolean
  /** Larger type and targets, for the phone. */
  large?: boolean
  /** A column beside the project: it fills the height it is given and scrolls inside. */
  column?: boolean
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
  /** The comment being put right, and its text as it is being typed. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const office = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // The newest comment is the last one; a column that opened on the oldest
  // would hide the very line somebody was sent here to read.
  useEffect(() => {
    const el = scroller.current
    if (column && el) el.scrollTop = el.scrollHeight
  }, [column, comments.length])

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

  /** "Antworten": the box starts with the author's @name and takes the caret. */
  function reply(comment: CommentRow) {
    const lead = comment.username ? `@${comment.username} ` : ''
    const next = lead && !text.startsWith(lead) ? `${lead}${text}` : text
    setText(next)
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.length, next.length)
    })
  }

  function saveEdit() {
    if (!editing || !edit) return
    const trimmed = editing.text.trim()
    if (!trimmed) {
      setError(t('commentEmpty'))
      return
    }
    const { id } = editing
    startTransition(async () => {
      const result = await edit(id, trimmed)
      if (result.error) {
        setError(result.error === 'notAllowed' ? t('commentNotAllowed') : tc('saveFailed'))
        return
      }
      setEditing(null)
      setError(null)
      router.refresh()
    })
  }

  const toggleReaction = (comment: CommentRow, emoji: string) => {
    if (!react) return
    startTransition(async () => {
      const result = await react(comment.id, emoji)
      if (result.error) setError(tc('saveFailed'))
      router.refresh()
    })
  }

  /** The small grey links under a comment, the way Trello writes them. */
  const action = `${small} text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50`

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
                <span className={`${small} tabular-nums text-muted`}>
                  {comment.when}
                  {comment.edited && ` (${t('commentEdited')})`}
                </span>
                {comment.office && (
                  <span className="rounded-sm bg-amber-500/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    {t('commentOfficeTag')}
                  </span>
                )}
              </div>
              {editing?.id === comment.id ? (
                <div className="mt-1">
                  <textarea
                    autoFocus
                    value={editing.text}
                    maxLength={COMMENT_MAX}
                    rows={3}
                    aria-label={t('commentEdit')}
                    onChange={(e) => setEditing({ id: comment.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditing(null)
                      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        saveEdit()
                      }
                    }}
                    className={`block w-full resize-y rounded-md border border-accent bg-background px-3 py-2 ${body} focus:outline-none focus:ring-1 focus:ring-ring`}
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <button type="button" onClick={saveEdit} disabled={pending} className={btn.primarySm}>
                      {tc('save')}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={pending} className={btn.ghost}>
                      {tc('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
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
              )}
              {editing?.id !== comment.id && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {(comment.reactions ?? []).map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      disabled={!react || pending}
                      onClick={() => toggleReaction(comment, r.emoji)}
                      title={r.names.join(', ')}
                      aria-pressed={r.mine}
                      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 ${small} tabular-nums transition-colors ${
                        r.mine ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-surface text-muted hover:bg-surface-hover'
                      }`}
                    >
                      <span aria-hidden>{r.emoji}</span>
                      {r.count}
                    </button>
                  ))}
                  {react && (
                    <Menu
                      side="bottom"
                      align="start"
                      label={t('commentReact')}
                      className="rounded-full p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      trigger={<SmilePlus className="h-3.5 w-3.5" aria-hidden />}
                    >
                      <div className="flex gap-0.5 p-0.5">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            role="menuitem"
                            aria-label={emoji}
                            onClick={() => toggleReaction(comment, emoji)}
                            className="rounded-md px-1.5 py-1 text-lg leading-none transition-colors hover:bg-surface-hover"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </Menu>
                  )}
                  <button type="button" className={action} disabled={pending} onClick={() => reply(comment)}>
                    {t('commentReply')}
                  </button>
                  {comment.editable && edit && (
                    <button type="button" className={action} disabled={pending} onClick={() => setEditing({ id: comment.id, text: comment.body })}>
                      {t('commentEdit')}
                    </button>
                  )}
                  {comment.deletable && (
                    <button type="button" className={action} disabled={pending} onClick={() => setRemoving(comment)}>
                      {tc('delete')}
                    </button>
                  )}
                </div>
              )}
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
            // In a column the box stands at the foot of the window: the names go up.
            className={`absolute left-0 z-20 w-64 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl ${
              column ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
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
    <section className={`rounded-xl border border-border bg-surface shadow-sm ${column ? 'flex max-h-[inherit] min-h-0 flex-col' : ''}`}>
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('commentsTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('commentsHint')}</p>
        </div>
        {comments.length > 0 && <span className="text-xs tabular-nums text-muted">{comments.length}</span>}
      </div>
      {column ? (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {list}
        </div>
      ) : (
        list
      )}
      <div className="shrink-0">{form}</div>
      {dialog}
    </section>
  )
}
