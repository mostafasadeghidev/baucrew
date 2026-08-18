'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trelloWizard, type PreviewState } from './actions'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'

const STATUSES = [
  'LEAD',
  'QUOTED',
  'APPROVED',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
  'CANCELLED',
] as const


export function ImportWizard() {
  const t = useTranslations('importTrello')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  // One action state drives all three phases; the parsed board travels in the
  // state between preview and import (not re-uploaded).
  const [effective, formAction, pending] = useActionState<PreviewState, FormData>(trelloWizard, {
    step: 'upload',
  })
  const previewAction = formAction
  const importAction = formAction
  const previewPending = pending
  const importPending = pending

  if (effective.step === 'done') {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-5">
          <p className="text-lg font-semibold">✓ {t('doneTitle')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>{t('doneCreated', { count: effective.created })}</li>
            <li>{t('doneCustomers', { count: effective.customersCreated })}</li>
            <li>{t('doneSkipped', { count: effective.skipped })}</li>
            <li>{t('doneIgnored', { count: effective.ignored })}</li>
          </ul>
        </div>
        <Link
          href="/projects"
          className={btn.primary}
        >
          {t('goToProjects')}
        </Link>
      </div>
    )
  }

  if (effective.step === 'preview') {
    const { board, suggested } = effective
    const cardsByList = new Map<string, number>()
    for (const c of board.cards) {
      if (!c.closed) cardsByList.set(c.idList, (cardsByList.get(c.idList) ?? 0) + 1)
    }
    const archived = board.cards.filter((c) => c.closed).length

    return (
      <form action={importAction} className="max-w-3xl space-y-4">
        <input type="hidden" name="_phase" value="import" />
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="font-semibold">{board.name}</p>
          <p className="text-sm text-muted">
            {t('previewSummary', { lists: board.lists.length, cards: board.cards.length })}
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">{t('trelloList')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('cards')}</th>
                <th className="px-4 py-2 font-medium">{t('mapTo')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {board.lists.map((list) => (
                <tr key={list.id}>
                  <td className="px-4 py-2 font-medium">
                    {list.name}
                    {list.closed && <span className="ml-2 text-xs text-muted">({t('archived')})</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{cardsByList.get(list.id) ?? 0}</td>
                  <td className="px-4 py-2">
                    <Select
                      className="w-full"
                      name={`list_${list.id}`}
                      defaultValue={list.closed ? 'SKIP' : (suggested[list.id] ?? 'LEAD')}
                    >
                      <option value="SKIP">{t('skipList')}</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tStatus(s)}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="includeArchived" className="h-4 w-4 accent-[var(--accent)]" />
          {t('includeArchived', { count: archived })}
        </label>

        <p className="text-xs text-muted">{t('titleRuleHint')}</p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={importPending}
            className={btn.primary}
          >
            {importPending ? tc('loading') : t('startImport')}
          </button>
          <Link
            href="/settings/import-trello"
            className={btn.outline}
          >
            {tc('cancel')}
          </Link>
        </div>
      </form>
    )
  }

  return (
    <form action={previewAction} className="max-w-2xl space-y-4">
      <input type="hidden" name="_phase" value="preview" />
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-medium">{t('howTo')}</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          required
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <button
          type="submit"
          disabled={previewPending}
          className={btn.primary}
        >
          {previewPending ? tc('loading') : t('analyze')}
        </button>
      </div>
      {effective.step === 'upload' && effective.error && (
        <p role="alert" className="text-sm text-danger">
          {t('invalidFile')}
        </p>
      )}
    </form>
  )
}
