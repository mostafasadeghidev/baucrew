'use client'

/**
 * What one answer of the assistant is made of, each drawn its own way:
 * its text (Markdown, set as it streams in), the look-ups it made (one quiet
 * line), a change it proposes (a card with the record and each field from
 * what it is to what it would be, to run or decline), a question with
 * answers to click, and a page it opened.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { getToolName, type UIMessage } from 'ai'
import { Streamdown, type Components } from 'streamdown'
import 'streamdown/styles.css'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  CircleCheck,
  Columns3,
  Loader2,
  MessageSquareText,
  PenLine,
  Plus,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { btn } from '@/components/ui/button'
import { recordUrl } from '@/lib/record-url'
import { readQuestion } from '@/lib/assistant-client-tools'

export type ToolPart = Extract<UIMessage['parts'][number], { toolCallId: string }>
type ProposalValue = string | number | boolean | null | string[]
type Proposal = { target: string | null; changes: Array<{ field: string; from?: ProposalValue; to: ProposalValue }> }

export const toolNameOf = (part: ToolPart) => getToolName(part as Parameters<typeof getToolName>[0])

function readProposal(reason: string | undefined): Proposal | null {
  if (!reason) return null
  try {
    const p = JSON.parse(reason) as Proposal
    return Array.isArray(p?.changes) ? p : null
  } catch {
    return null
  }
}

/** The error a tool handed back instead of a result — a refusal, a miss. */
const toolError = (output: unknown): string | null =>
  output && typeof output === 'object' && typeof (output as { error?: unknown }).error === 'string' ? (output as { error: string }).error : null

/* ------------------------------------------------------------------ text */

const internal = (href: string | undefined) => typeof href === 'string' && /^\/[a-z]/.test(href) && !href.startsWith('//')

/** The page's own type set for Markdown: small, calm, and the app's colours — no second design system. */
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  h1: ({ children }) => <h3 className="mb-1.5 mt-4 text-[0.95rem] font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1.5 mt-4 text-[0.95rem] font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-muted">{children}</blockquote>,
  hr: () => <hr className="my-3 border-border" />,
  a: ({ href, children }) =>
    internal(href) ? (
      <Link href={href!} className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
        {children}
      </a>
    ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) =>
    /language-/.test(className ?? '') || String(children).includes('\n') ? (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-subtle px-3 py-2 font-mono text-xs leading-5">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="rounded-md border border-border bg-subtle px-1 py-px font-mono text-[0.85em]">{children}</code>
    ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-[0.8125rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-subtle text-xs text-muted">{children}</thead>,
  tr: ({ children }) => <tr className="border-t border-border first:border-t-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
}

/** The answer's words, Markdown set as it arrives; half-written marks never show. */
export function MessageText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Streamdown
      className="text-sm leading-6 text-foreground"
      components={components}
      controls={false}
      linkSafety={{ enabled: false }}
      mode={streaming ? 'streaming' : 'static'}
      isAnimating={streaming}
      animated={{ animation: 'fadeIn', duration: 180 }}
    >
      {text}
    </Streamdown>
  )
}

/* -------------------------------------------------------------- look-ups */

/** The look-ups of one stretch of the answer, on one quiet line. */
export function Steps({ parts }: { parts: ToolPart[] }) {
  const t = useTranslations('assistant')
  const label = (part: ToolPart) => {
    const name = toolNameOf(part)
    return t.has(`tools.${name}`) ? t(`tools.${name}` as 'tools.list_projects') : name
  }
  const running = parts.find((p) => p.state === 'input-streaming' || p.state === 'input-available')
  const names = [...new Set(parts.map(label))]
  return (
    <div className="flex items-start gap-2 text-xs text-muted">
      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className={running ? 'animate-pulse' : undefined}>{running ? t('lookingUp', { tool: label(running) }) : names.join(' · ')}</span>
    </div>
  )
}

/* -------------------------------------------------------------- proposals */

const ICONS: Record<string, LucideIcon> = {
  create_project: Plus,
  create_customer: Plus,
  add_comment: MessageSquareText,
  add_defect: TriangleAlert,
  set_defect_resolved: CircleCheck,
  move_project_to_column: Columns3,
  plan_assignment: CalendarPlus,
  move_schedule_entry: CalendarClock,
  update_schedule_entry: CalendarClock,
  cancel_schedule_entry: CalendarX,
}

/** A value as words: a date in the person's format, a status by its name, a list joined. */
function useValueText() {
  const t = useTranslations('assistant')
  const tStatus = useTranslations('status')
  const format = useFormatter()
  return (field: string, value: ProposalValue): string | null => {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null
    if (typeof value === 'boolean') return value ? t('yes') : t('no')
    if (Array.isArray(value)) return value.join(', ')
    if (field === 'status' && tStatus.has(String(value))) return tStatus(String(value) as 'LEAD')
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
    }
    return String(value)
  }
}

export function ProposalCard({
  part,
  busy,
  onAnswer,
  onUndo,
}: {
  part: ToolPart
  busy: boolean
  onAnswer: (id: string, approved: boolean) => void
  onUndo: (text: string) => void
}) {
  const t = useTranslations('assistant')
  const valueText = useValueText()
  const name = toolNameOf(part)
  const label = t.has(`tools.${name}`) ? t(`tools.${name}` as 'tools.list_projects') : name
  const approval = 'approval' in part ? part.approval : undefined
  if (!approval) return null
  const proposal = readProposal(approval.requestReason)
  const Icon = ICONS[name] ?? PenLine
  const fieldName = (field: string) => (t.has(`fields.${field}`) ? t(`fields.${field}` as 'fields.name') : field)

  const failed = part.state === 'output-error' ? part.errorText : part.state === 'output-available' ? toolError(part.output) : null
  const done = part.state === 'output-available' && !failed
  const link = done ? recordUrl(part.output) : null
  const waiting = part.state === 'approval-requested'
  const running = part.state === 'approval-responded' || (part.state === 'input-available' && approval.approved)
  const declined = part.state === 'output-denied' || (part.state === 'approval-responded' && !approval.approved)
  // Only a change of fields that all had a value before can be turned back by the same way.
  const undoable = done && !!proposal && proposal.changes.length > 0 && proposal.changes.every((c) => c.from !== undefined)

  const undo = () => {
    if (!proposal) return
    const changes = proposal.changes.map((c) => `${fieldName(c.field)}: ${valueText(c.field, c.from ?? null) ?? t('empty')}`).join('; ')
    onUndo(t('undoRequest', { target: proposal.target ?? label, changes }))
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface transition-colors ${
        waiting ? 'border-accent/40 ring-4 ring-accent/5' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3 px-3.5 pt-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
            done ? 'border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' : 'border-border bg-subtle text-muted'
          }`}
        >
          {done ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{label}</p>
          {proposal?.target && <p className="truncate text-xs leading-5 text-muted">{proposal.target}</p>}
        </div>
      </div>

      {proposal && proposal.changes.length > 0 && (
        <dl className="mx-3.5 mt-3 divide-y divide-border rounded-lg border border-border text-[0.8125rem]">
          {proposal.changes.map((c) => {
            const from = c.from !== undefined ? valueText(c.field, c.from) : undefined
            const to = valueText(c.field, c.to)
            return (
              <div key={c.field} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2">
                <dt className="truncate text-muted">{fieldName(c.field)}</dt>
                <dd className="min-w-0 break-words">
                  {from !== undefined && (
                    <span className="mr-1 text-muted line-through decoration-muted/60">{from ?? t('empty')}</span>
                  )}
                  {from !== undefined && <ArrowRight className="mr-1 inline h-3 w-3 -translate-y-px text-muted" aria-hidden />}
                  <span className={to === null ? 'italic text-muted' : 'font-medium'}>{to ?? t('empty')}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      <div className="mt-3 flex min-h-12 items-center gap-2 border-t border-border bg-subtle/60 px-3.5 py-2">
        {waiting && (
          <>
            <p className="mr-auto text-xs text-muted">{t('confirmHint')}</p>
            <button type="button" className={btn.outlineSm} onClick={() => onAnswer(approval.id, false)} disabled={busy}>
              {t('decline')}
            </button>
            <button type="button" className={btn.primarySm} onClick={() => onAnswer(approval.id, true)} disabled={busy}>
              <Check className="h-4 w-4" aria-hidden />
              {t('confirm')}
            </button>
          </>
        )}
        {running && !declined && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('running')}
          </p>
        )}
        {declined && <p className="text-sm text-muted">{t('declined')}</p>}
        {failed && <p className="text-sm text-danger">{t('failed', { message: failed })}</p>}
        {done && (
          <>
            <p className="mr-auto flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="h-4 w-4" aria-hidden />
              {t('done')}
            </p>
            {undoable && (
              <button type="button" className={btn.ghost} onClick={undo} disabled={busy}>
                <Undo2 className="h-4 w-4" aria-hidden />
                {t('undo')}
              </button>
            )}
            {link && (
              <Link href={link} className={btn.outlineSm}>
                {t('openRecord')}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- questions */

export function QuestionCard({ part, busy, onAnswer }: { part: ToolPart; busy: boolean; onAnswer: (toolCallId: string, answer: string) => void }) {
  const t = useTranslations('assistant')
  const q = readQuestion(part.input)
  if (!q) return part.state === 'input-streaming' ? <Steps parts={[part]} /> : null
  const answer =
    part.state === 'output-available' && part.output && typeof part.output === 'object' ? String((part.output as { answer?: unknown }).answer ?? '') : null
  const open = part.state === 'input-available'

  return (
    <div className={`rounded-xl border bg-surface p-3.5 ${open ? 'border-accent/40 ring-4 ring-accent/5' : 'border-border'}`}>
      <p className="text-sm font-semibold leading-5">{q.question}</p>
      {open ? (
        <>
          <div className="mt-3 flex flex-col gap-1.5">
            {q.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={busy}
                onClick={() => onAnswer(part.toolCallId, option)}
                className="group flex w-full items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-sm transition-[background-color,border-color,transform] duration-100 hover:border-accent/50 hover:bg-accent/5 active:scale-[0.99] disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">{option}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t('orType')}</p>
        </>
      ) : answer !== null ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1 text-sm font-medium text-accent">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {answer}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ pages */

export function PageLine({ part }: { part: ToolPart }) {
  const t = useTranslations('assistant')
  const input = (part.input ?? {}) as { path?: unknown; label?: unknown }
  const label = typeof input.label === 'string' && input.label.trim() ? input.label : typeof input.path === 'string' ? input.path : ''
  const path = part.state === 'output-available' && part.output && typeof part.output === 'object' ? (part.output as { opened?: unknown }).opened : null

  if (part.state === 'output-error') return <p className="text-xs text-danger">{t('pageFailed')}</p>
  if (typeof path !== 'string') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t('opening')}
      </p>
    )
  }
  return (
    <Link
      href={path}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-hover"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{t('opened')}</span>
        <span className="block truncate font-medium">{label}</span>
      </span>
    </Link>
  )
}

/** A small round thing that says the assistant is at work. */
export function Thinking({ label }: { label: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/70" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      {label}
    </p>
  )
}
