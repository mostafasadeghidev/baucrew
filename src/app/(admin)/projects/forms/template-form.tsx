'use client'

/**
 * A form template: its name, the fields a row each — what kind, what it is
 * called, what the project fills in, whether it has to be filled — and who
 * signs at the bottom. Rows are moved with the arrows; the order here is the
 * order on the sheet.
 *
 * Besides: a fixed text's paragraphs, the words after a value, a value of the
 * template's own, half width, a table's fixed rows and column widths, and
 * which signers sign at a `signatures` row.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { SavedForm, type SaveState } from '@/components/saved-form'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  FIELD_LABEL_MAX,
  FIELD_TYPES,
  HALF_WIDTH,
  INFO_TEXT_MAX,
  LAYOUT_TYPES,
  MAX_FIELDS,
  MAX_SIGNERS,
  PREFILLABLE,
  PREFILL_SOURCES,
  SUFFIX_MAX,
  WITH_DEFAULT,
  WITH_OPTIONS,
  WITH_SUFFIX,
  type FieldType,
  type FormField,
  type PrefillSource,
} from '@/lib/forms'

const inputClass =
  'block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

const FORM_ID = 'form-template-form'
/** A table's fixed rows and widths are written one row a line, the cells parted by "|". */
const CELL = /\s*\|\s*/

type Row = {
  key: number
  id: string
  type: FieldType
  label: string
  required: boolean
  prefill: PrefillSource | ''
  /** Answers, columns or — for a `signatures` row — the signers, one per line. */
  options: string
  body: string
  suffix: string
  defaultValue: string
  half: boolean
  rows: string
  widths: string
}

export function FormTemplateForm({
  action,
  initial,
  deleteAction,
}: {
  action: (formData: FormData) => Promise<SaveState>
  initial: { name: string; description: string; active: boolean; financial: boolean; fields: FormField[]; signers: string[] }
  /** Only on the edit page. */
  deleteAction?: (prev: { error?: string }, formData: FormData) => Promise<{ error?: string }>
}) {
  const t = useTranslations('forms')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<Row[]>(() =>
    initial.fields.map((f, key) => ({
      key,
      id: f.id,
      type: f.type,
      label: f.label,
      required: f.required === true,
      prefill: f.prefill ?? '',
      options: (f.options ?? []).join('\n'),
      body: f.body ?? '',
      suffix: f.suffix ?? '',
      defaultValue: f.defaultValue ?? '',
      half: f.half === true,
      rows: (f.rows ?? []).map((row) => row.join(' | ')).join('\n'),
      widths: (f.widths ?? []).join(' | '),
    }))
  )
  const [nextKey, setNextKey] = useState(initial.fields.length)
  const [signers, setSigners] = useState(initial.signers.join('\n'))
  const signerList = [...new Set(signers.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SIGNERS)

  const change = (key: number, patch: Partial<Row>) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const move = (index: number, by: number) =>
    setRows((list) => {
      const to = index + by
      if (to < 0 || to >= list.length) return list
      const next = [...list]
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
  const add = (type: FieldType) => {
    setRows((list) => [
      ...list,
      { key: nextKey, id: '', type, label: '', required: false, prefill: '', options: '', body: '', suffix: '', defaultValue: '', half: false, rows: '', widths: '' },
    ])
    setNextKey((k) => k + 1)
  }

  // What is sent: the rows as the rules read them. A row without a label is
  // dropped on the server, not here — the office sees it until it saves.
  const payload = JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      type: row.type,
      label: row.label,
      required: row.required,
      prefill: row.prefill || undefined,
      options: WITH_OPTIONS.has(row.type) || row.type === 'signatures' ? row.options.split('\n') : undefined,
      body: row.type === 'info' ? row.body : undefined,
      suffix: row.suffix || undefined,
      defaultValue: row.defaultValue || undefined,
      half: row.half || undefined,
      rows: row.type === 'table' && row.rows.trim() ? row.rows.split('\n').filter((line) => line.trim()).map((line) => line.split(CELL)) : undefined,
      widths: row.type === 'table' && row.widths.trim() ? row.widths.split(CELL).map(Number) : undefined,
    }))
  )
  const small = `${inputClass} text-xs`

  return (
    <div className="space-y-4">
      <SavedForm
        id={FORM_ID}
        action={action}
        className="space-y-5"
        errorLabel={(code) => (code === 'nameRequired' ? t('templateNameRequired') : code === 'fieldsRequired' ? t('templateFieldsRequired') : tc('saveFailed'))}
      >
        <input type="hidden" name="fields" value={payload} />
        <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block text-sm">
              {t('templateName')}
              <input name="name" defaultValue={initial.name} required autoFocus maxLength={200} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4 accent-[var(--accent)]" />
              {tc('active')}
            </label>
          </div>
          <label className="block text-sm">
            {t('templateDescription')}
            <input name="description" defaultValue={initial.description} maxLength={500} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="financial" defaultChecked={initial.financial} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              {t('templateFinancial')}
              <span className="block text-xs text-muted">{t('templateFinancialHint')}</span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t('templateFields')}</h2>
            <p className="mt-0.5 text-xs text-muted">{t('templateFieldsHint')}</p>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t('templateNoFields')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, index) => (
                <li
                  key={row.key}
                  className={`grid gap-2 px-5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_11rem_auto] sm:items-start ${row.type === 'heading' || row.type === 'pagebreak' ? 'bg-subtle/60' : ''}`}
                >
                  <Select aria-label={t('fieldType')} compact value={row.type} onChange={(e) => change(row.key, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`type_${type}`)}
                      </option>
                    ))}
                  </Select>
                  <div className="min-w-0 space-y-2">
                    {row.type !== 'pagebreak' && (
                      <input
                        aria-label={t('fieldLabel')}
                        value={row.label}
                        onChange={(e) => change(row.key, { label: e.target.value })}
                        maxLength={FIELD_LABEL_MAX}
                        placeholder={
                          row.type === 'heading'
                            ? t('fieldHeadingPlaceholder')
                            : row.type === 'info' || row.type === 'signatures'
                              ? t('fieldTitlePlaceholder')
                              : row.type === 'choice' || row.type === 'multi'
                                ? t('fieldLabelOptionalPlaceholder')
                                : t('fieldLabelPlaceholder')
                        }
                        className={`${inputClass} ${row.type === 'heading' ? 'font-semibold' : ''}`}
                      />
                    )}
                    {row.type === 'pagebreak' && <p className="py-2 text-xs text-muted">{t('fieldPagebreakHint')}</p>}
                    {row.type === 'info' && (
                      <textarea
                        aria-label={t('fieldBody')}
                        value={row.body}
                        onChange={(e) => change(row.key, { body: e.target.value })}
                        rows={Math.min(12, Math.max(3, row.body.split('\n').length + 1))}
                        maxLength={INFO_TEXT_MAX}
                        placeholder={t('fieldBodyPlaceholder')}
                        className={small}
                      />
                    )}
                    {WITH_OPTIONS.has(row.type) && (
                      <textarea
                        aria-label={row.type === 'table' ? t('fieldColumns') : t('fieldOptions')}
                        value={row.options}
                        onChange={(e) => change(row.key, { options: e.target.value })}
                        rows={3}
                        placeholder={row.type === 'table' ? t('fieldColumnsPlaceholder') : t('fieldOptionsPlaceholder')}
                        className={small}
                      />
                    )}
                    {row.type === 'table' && (
                      <>
                        <textarea
                          aria-label={t('fieldRows')}
                          value={row.rows}
                          onChange={(e) => change(row.key, { rows: e.target.value })}
                          rows={Math.min(10, Math.max(2, row.rows.split('\n').length + 1))}
                          placeholder={t('fieldRowsPlaceholder')}
                          className={small}
                        />
                        <input
                          aria-label={t('fieldWidths')}
                          value={row.widths}
                          onChange={(e) => change(row.key, { widths: e.target.value })}
                          placeholder={t('fieldWidthsPlaceholder')}
                          className={small}
                        />
                      </>
                    )}
                    {row.type === 'signatures' && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted">{t('fieldSignersHint')}</p>
                        {signerList.map((role) => {
                          const chosen = row.options.split('\n').filter(Boolean)
                          return (
                            <label key={role} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={chosen.includes(role)}
                                onChange={(e) =>
                                  change(row.key, { options: (e.target.checked ? [...chosen, role] : chosen.filter((r) => r !== role)).join('\n') })
                                }
                                className="h-4 w-4 accent-[var(--accent)]"
                              />
                              {role}
                            </label>
                          )
                        })}
                      </div>
                    )}
                    {(WITH_SUFFIX.has(row.type) || WITH_DEFAULT.has(row.type)) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {WITH_DEFAULT.has(row.type) &&
                          (row.type === 'longtext' ? (
                            <textarea
                              aria-label={t('fieldDefault')}
                              value={row.defaultValue}
                              onChange={(e) => change(row.key, { defaultValue: e.target.value })}
                              rows={2}
                              placeholder={t('fieldDefault')}
                              className={small}
                            />
                          ) : (
                            <input
                              aria-label={t('fieldDefault')}
                              value={row.defaultValue}
                              onChange={(e) => change(row.key, { defaultValue: e.target.value })}
                              placeholder={t('fieldDefault')}
                              className={small}
                            />
                          ))}
                        {WITH_SUFFIX.has(row.type) && (
                          <input
                            aria-label={t('fieldSuffix')}
                            value={row.suffix}
                            onChange={(e) => change(row.key, { suffix: e.target.value })}
                            maxLength={SUFFIX_MAX}
                            placeholder={t('fieldSuffixPlaceholder')}
                            className={small}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {PREFILLABLE.has(row.type) && (
                      <Select aria-label={t('fieldPrefill')} compact value={row.prefill} onChange={(e) => change(row.key, { prefill: e.target.value as PrefillSource | '' })}>
                        <option value="">{t('prefill_none')}</option>
                        {PREFILL_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {t(`prefill_${source}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                    {!LAYOUT_TYPES.has(row.type) && (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" checked={row.required} onChange={(e) => change(row.key, { required: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                        {t('fieldRequired')}
                      </label>
                    )}
                    {HALF_WIDTH.has(row.type) && (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" checked={row.half} onChange={(e) => change(row.key, { half: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                        {t('fieldHalf')}
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('fieldUp')} title={t('fieldUp')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={t('fieldDown')} title={t('fieldDown')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30">
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))} aria-label={tc('delete')} title={tc('delete')} className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
            <span className="text-xs text-muted">{t('fieldAdd')}</span>
            {FIELD_TYPES.map((type) => (
              <button key={type} type="button" onClick={() => add(type)} disabled={rows.length >= MAX_FIELDS} className={`${btn.outlineSm} gap-1 text-xs`}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t(`type_${type}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <label className="block text-sm">
            <span className="font-semibold">{t('templateSigners')}</span>
            <span className="mt-0.5 block text-xs text-muted">{t('templateSignersHint', { max: MAX_SIGNERS })}</span>
            <textarea name="signers" rows={3} value={signers} onChange={(e) => setSigners(e.target.value)} className={`mt-2 ${inputClass}`} />
          </label>
        </div>
      </SavedForm>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" form={FORM_ID} className={btn.primary}>
          {tc('save')}
        </button>
        <Link href="/projects/forms" className={btn.outline}>
          {tc('cancel')}
        </Link>
        {deleteAction && (
          <span className="ml-auto">
            <DeleteButton action={deleteAction} label={tc('delete')} confirmMessage={`${initial.name} — ${tc('delete')}?`} />
          </span>
        )}
      </div>
    </div>
  )
}
