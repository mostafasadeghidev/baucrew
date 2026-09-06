'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { btn } from '@/components/ui/button'
import { mergeProjects, type MergeResult } from '../actions'

/**
 * "Zusammenführen" on the project page: picks the duplicate and folds it
 * into this project. Admin only; the page decides whether to show it.
 */
export function MergeButton({ projectId, projects }: { projectId: string; projects: ComboboxOption[] }) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<ComboboxOption | null>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<MergeResult | null>(null)

  function merge() {
    if (!picked || !window.confirm(t('mergeConfirm', { project: picked.label }))) return
    const dropId = picked.value
    startTransition(async () => {
      const res = await mergeProjects(projectId, dropId)
      setResult(res)
      if (!res.error) {
        setOpen(false)
        setPicked(null)
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResult(null)
          setOpen((o) => !o)
        }}
        className={btn.outlineSm}
      >
        {t('merge')}
      </button>
      {open && (
        <div className="basis-full rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted">{t('mergeHint')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="min-w-[320px] flex-1">
              <Combobox
                name="merge-project"
                options={projects}
                defaultValue=""
                onSelect={(id) => setPicked(projects.find((p) => p.value === id) ?? null)}
                placeholder={t('mergePick')}
                noResultsLabel={t('noResults')}
              />
            </div>
            <button type="button" onClick={merge} disabled={pending || !picked} className={btn.primary}>
              {t('merge')}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className={btn.outline}>
              {tc('cancel')}
            </button>
          </div>
          {result?.error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {tc('saveFailed')}
            </p>
          )}
        </div>
      )}
      {result && !result.error && (
        <p className="basis-full text-sm text-emerald-700 dark:text-emerald-400">
          {t('mergeDone', { conflicts: result.conflicts ?? 0 })}
        </p>
      )}
    </>
  )
}
