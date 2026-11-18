'use client'

/**
 * "Liste einfügen": a needs list for this project pasted at once — out of an
 * e-mail, an offer or an Excel sheet, one thing per line. Each line is shown
 * with the catalogue entry it was read as; the person corrects what is wrong
 * (another entry, a new one, leave it out) and the quantities, then adds them
 * all. Nothing is written before that.
 */

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { ClipboardList } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { AddNeedsResult, NeedPreviewLine } from '@/lib/project-needs-server'
import { addNeedsList, previewNeedsList } from './needs-actions'

type Row = NeedPreviewLine & { choice: string; quantityText: string }

const numberText = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

export function NeedsPasteButton({
  projectId,
  defaultKind,
  kinds,
  canCreate,
}: {
  projectId: string
  /** The kind a line nobody knows is made as, unless the line names one. */
  defaultKind: string
  kinds: Array<{ value: string; label: string }>
  /** A new catalogue entry is the office's to make. */
  canCreate: boolean
}) {
  const t = useTranslations('projectNeeds')
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [result, setResult] = useState<AddNeedsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const kindLabel = (value: string) => kinds.find((k) => k.value === value)?.label ?? value

  function close() {
    setOpen(false)
    setText('')
    setRows(null)
    setResult(null)
    setError(null)
  }

  function check() {
    setError(null)
    startTransition(async () => {
      const res = await previewNeedsList(projectId, text)
      if (res.error || !res.lines) return setError(tc('saveFailed'))
      if (res.lines.length === 0) return setError(t('pasteEmpty'))
      setRows(
        res.lines.map((line) => ({
          ...line,
          quantityText: numberText(line.quantity),
          choice: line.match ? `item:${line.match.id}` : canCreate && line.candidates.length === 0 ? `new:${line.kind ?? defaultKind}` : 'skip',
        }))
      )
    })
  }

  function add() {
    if (!rows) return
    setError(null)
    const picks = rows
      .filter((r) => r.choice !== 'skip')
      .map((r) => {
        const quantity = r.quantityText.trim() ? Number(r.quantityText.replace(',', '.')) : null
        const [how, value] = [r.choice.slice(0, r.choice.indexOf(':')), r.choice.slice(r.choice.indexOf(':') + 1)]
        return {
          catalogItemId: how === 'item' ? value : null,
          create: how === 'new' ? { kind: value, name: r.name, unit: r.unit } : null,
          quantity: quantity != null && Number.isFinite(quantity) ? quantity : null,
          note: r.note,
        }
      })
    startTransition(async () => {
      const res = await addNeedsList(projectId, picks)
      if (res.error || !res.result) return setError(tc('saveFailed'))
      setResult(res.result)
      setRows(null)
      setText('')
    })
  }

  const chosen = rows?.filter((r) => r.choice !== 'skip').length ?? 0

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${btn.outlineXs} px-2 text-muted`}>
        <ClipboardList className="h-3.5 w-3.5" aria-hidden />
        {t('pasteList')}
      </button>

      {open &&
        createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.target === e.currentTarget && close()}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="needs-paste-title"
            onKeyDown={(e) => {
              // Escape closes this window only; the card under it stays.
              if (e.key === 'Escape' && !e.defaultPrevented) {
                e.preventDefault()
                close()
              }
            }}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 id="needs-paste-title" className="text-base font-semibold">
                {t('pasteTitle')}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={tc('close')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {result ? (
                <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-medium">
                  {t('pasteResult', { added: result.added, updated: result.updated, skipped: result.skipped, created: result.created })}
                </p>
              ) : rows ? (
                <ul className="divide-y divide-border text-sm">
                  {rows.map((row, index) => (
                    <li key={row.line} className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_5rem] sm:items-center">
                      <span className="min-w-0">
                        <span className="block truncate font-medium" title={row.text}>
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {row.onProject
                            ? t('lineOnProject')
                            : row.how === 'close' && row.match
                              ? t('lineReadAs', { name: row.match.name })
                              : row.candidates.length > 0
                                ? t('lineChoose')
                                : !row.match
                                  ? t('lineUnknown')
                                  : row.text}
                          {row.note && ` · ${row.note}`}
                        </span>
                      </span>
                      <Select
                        compact
                        value={row.choice}
                        aria-label={t('lineChoice', { name: row.name })}
                        onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, choice: e.target.value } : r)))}
                        className={row.choice === 'skip' ? '[&>select]:text-muted' : ''}
                      >
                        {row.match && <option value={`item:${row.match.id}`}>{`${row.match.name} · ${kindLabel(row.match.kind)}`}</option>}
                        {row.candidates.map((c) => (
                          <option key={c.id} value={`item:${c.id}`}>
                            {`${c.name} · ${kindLabel(c.kind)}`}
                          </option>
                        ))}
                        {canCreate &&
                          kinds.map((k) => (
                            <option key={k.value} value={`new:${k.value}`}>
                              {t('createAs', { kind: k.label })}
                            </option>
                          ))}
                        <option value="skip">{t('skipLine')}</option>
                      </Select>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.quantityText}
                        aria-label={t('lineQuantity', { name: row.name })}
                        placeholder={t('quantityShort')}
                        onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, quantityText: e.target.value } : r)))}
                        className="rounded-lg border border-border-strong bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="text-xs text-muted">{t('pasteHint')}</p>
                  <textarea
                    value={text}
                    autoFocus
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    placeholder={t('pastePlaceholder')}
                    aria-label={t('pasteTitle')}
                    className="mt-2 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </>
              )}
              {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
              {result ? (
                <button type="button" onClick={close} className={btn.primary}>
                  {tc('close')}
                </button>
              ) : rows ? (
                <>
                  <button type="button" disabled={pending || chosen === 0} onClick={add} className={btn.primary}>
                    {t('addLines', { count: chosen })}
                  </button>
                  <button type="button" disabled={pending} onClick={() => setRows(null)} className={btn.outline}>
                    {t('backToText')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" disabled={pending || !text.trim()} onClick={check} className={btn.primary}>
                    {t('checkList')}
                  </button>
                  <button type="button" onClick={close} className={btn.outline}>
                    {tc('cancel')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  )
}
