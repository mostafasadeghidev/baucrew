'use client'

/**
 * A form template: its name, the fields a row each — what kind, what it is
 * called, what the project fills in, whether it has to be filled — and who
 * signs at the bottom. Rows are moved with the arrows; the order here is the
 * order on the sheet.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { SavedForm, type SaveState } from '@/components/saved-form'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { FIELD_LABEL_MAX, FIELD_TYPES, MAX_FIELDS, MAX_SIGNERS, PREFILL_SOURCES, type FieldType, type FormField, type PrefillSource } from '@/lib/forms'

const inputClass =
  'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

const FORM_ID = 'form-template-form'

type Row = { key: number; id: string; type: FieldType; label: string; required: boolean; prefill: PrefillSource | ''; options: string }

export function FormTemplateForm({
  action,
  initial,
  deleteAction,
}: {
  action: (formData: FormData) => Promise<SaveState>
  initial: { name: string; description: string; active: boolean; fields: FormField[]; signers: string[] }
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
    }))
  )
  const [nextKey, setNextKey] = useState(initial.fields.length)

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
    setRows((list) => [...list, { key: nextKey, id: '', type, label: '', required: false, prefill: '', options: '' }])
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
      options: row.type === 'choice' ? row.options.split('\n') : undefined,
    }))
  )

  return (
    <div className="space-y-4">
      <SavedForm
        id={FORM_ID}
        action={action}
        className="space-y-5"
        errorLabel={(code) => (code === 'nameRequired' ? t('templateNameRequired') : code === 'fieldsRequired' ? t('templateFieldsRequired') : tc('saveFailed'))}
      >
        <input type="hidden" name="fields" value={payload} />
        <div className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
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
        </div>

        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t('templateFields')}</h2>
            <p className="mt-0.5 text-xs text-muted">{t('templateFieldsHint')}</p>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{t('templateNoFields')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, index) => (
                <li key={row.key} className={`grid gap-2 px-5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_11rem_auto] sm:items-start ${row.type === 'heading' ? 'bg-subtle/60' : ''}`}>
                  <Select aria-label={t('fieldType')} compact value={row.type} onChange={(e) => change(row.key, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`type_${type}`)}
                      </option>
                    ))}
                  </Select>
                  <div className="min-w-0 space-y-2">
                    <input
                      aria-label={t('fieldLabel')}
                      value={row.label}
                      onChange={(e) => change(row.key, { label: e.target.value })}
                      maxLength={FIELD_LABEL_MAX}
                      placeholder={row.type === 'heading' ? t('fieldHeadingPlaceholder') : t('fieldLabelPlaceholder')}
                      className={`${inputClass} ${row.type === 'heading' ? 'font-semibold' : ''}`}
                    />
                    {row.type === 'choice' && (
                      <textarea
                        aria-label={t('fieldOptions')}
                        value={row.options}
                        onChange={(e) => change(row.key, { options: e.target.value })}
                        rows={3}
                        placeholder={t('fieldOptionsPlaceholder')}
                        className={`${inputClass} text-xs`}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    {row.type !== 'heading' && row.type !== 'checkbox' && (
                      <Select aria-label={t('fieldPrefill')} compact value={row.prefill} onChange={(e) => change(row.key, { prefill: e.target.value as PrefillSource | '' })}>
                        <option value="">{t('prefill_none')}</option>
                        {PREFILL_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {t(`prefill_${source}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                    {row.type !== 'heading' && (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" checked={row.required} onChange={(e) => change(row.key, { required: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                        {t('fieldRequired')}
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

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <label className="block text-sm">
            <span className="font-semibold">{t('templateSigners')}</span>
            <span className="mt-0.5 block text-xs text-muted">{t('templateSignersHint', { max: MAX_SIGNERS })}</span>
            <textarea name="signers" rows={3} defaultValue={initial.signers.join('\n')} className={`mt-2 ${inputClass}`} />
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
