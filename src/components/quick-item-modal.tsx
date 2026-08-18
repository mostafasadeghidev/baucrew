'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { quickCreateCatalogItem } from '@/app/(admin)/warehouse/actions'
import { btn } from '@/components/ui/button'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * Small dialog offered when the typed tool/material is not in the catalog yet:
 * name (prefilled), kind and unit — creates the catalog entry and hands the new
 * id back so the caller can add it to the project/template right away.
 */
export function QuickItemModal({
  initialName,
  onCreated,
  onClose,
}: {
  initialName: string
  onCreated: (item: { id: string; label: string }) => void
  onClose: () => void
}) {
  const t = useTranslations('warehouse')
  const tKind = useTranslations('itemKind')
  const tc = useTranslations('common')
  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<'MATERIAL' | 'TOOL'>('MATERIAL')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await quickCreateCatalogItem({ name, kind, unit })
      if (res.error || !res.id) {
        setError(res.error === 'nameRequired' ? t('nameRequired') : tc('saveFailed'))
        return
      }
      onCreated({ id: res.id, label: res.label ?? name })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('quickCreateTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('cancel')}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">{t('quickCreateHint')}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="qi-name" className="block text-sm font-medium">
              {t('name')} <span className="text-danger">*</span>
            </label>
            <input
              id="qi-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              className={inputClass}
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">{t('kind')}</legend>
            <div className="mt-1 flex gap-2">
              {(['MATERIAL', 'TOOL'] as const).map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="qi-kind"
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {tKind(k)}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="qi-unit" className="block text-sm font-medium">
              {t('unit')}
            </label>
            <input
              id="qi-unit"
              value={unit}
              placeholder={t('unitPlaceholder')}
              onChange={(e) => setUnit(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={submit}
            className={btn.primary}
          >
            {t('quickCreateSubmit')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={btn.outline}
          >
            {tc('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
