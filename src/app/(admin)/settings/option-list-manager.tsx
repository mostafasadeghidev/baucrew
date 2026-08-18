'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { SavedForm } from '@/components/saved-form'
import { btn } from '@/components/ui/button'
import type { SaveState } from '@/components/saved-form'
import type { OptionEntry } from '@/lib/option-lists'

const inputClass =
  'block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * Editor for a configurable list (client types, building types, item kinds):
 * rename entries, add new ones, remove custom ones. The stored `value` never
 * changes so existing projects/items keep their assignment.
 */
export function OptionListManager({
  action,
  entries,
  suggestions,
  builtIn,
}: {
  action: (formData: FormData) => Promise<SaveState>
  entries: OptionEntry[]
  /** Ready-made extras offered as "+ add" chips. */
  suggestions: OptionEntry[]
  /** Values that cannot be removed (built-in). */
  builtIn: string[]
}) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<OptionEntry[]>(entries)

  const missing = suggestions.filter((s) => !rows.some((r) => r.value === s.value))

  return (
    <SavedForm action={action} className="space-y-3">
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.value} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="value" value={row.value} />
            <input
              name="labelDe"
              defaultValue={row.labelDe}
              aria-label={`${t('optionLabelDe')} — ${row.value}`}
              className={`${inputClass} min-w-40 flex-1`}
            />
            <input
              name="labelEn"
              defaultValue={row.labelEn}
              aria-label={`${t('optionLabelEn')} — ${row.value}`}
              className={`${inputClass} min-w-40 flex-1`}
            />
            {builtIn.includes(row.value) ? (
              <span className="px-2 text-xs text-muted">{t('optionBuiltIn')}</span>
            ) : (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, x) => x !== i))}
                title={tc('delete')}
                aria-label={tc('delete')}
                className="rounded-md border border-border p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {missing.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setRows((prev) => [...prev, s])}
            className={`${btn.outlineSm} text-xs`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {s.labelDe}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { value: `NEW_${prev.length + 1}`, labelDe: '', labelEn: '' }])
          }
          className={`${btn.outlineSm} text-xs`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('optionAdd')}
        </button>
      </div>

      <button type="submit" className={btn.primarySm}>
        {tc('save')}
      </button>
    </SavedForm>
  )
}
