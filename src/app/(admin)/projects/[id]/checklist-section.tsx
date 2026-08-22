'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from 'lucide-react'
import { Checklist, type ChecklistRow } from '@/components/checklist'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'
import { addProjectChecklist, removeProjectChecklist } from './checklist-actions'

/**
 * Checklists of a project (office view): add one from a template or blank,
 * tick lines, delete the whole list.
 */
export function ChecklistSection({
  projectId,
  checklists,
  templates,
}: {
  projectId: string
  checklists: ChecklistRow[]
  templates: Array<{ id: string; name: string }>
}) {
  const t = useTranslations('checklists')
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [name, setName] = useState('')

  function add() {
    const payload = templateId ? { templateId } : { name: name.trim() }
    if (!templateId && !name.trim()) return
    setName('')
    startTransition(async () => void (await addProjectChecklist(projectId, payload)))
  }

  return (
    <div className="space-y-4">
      {checklists.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : (
        checklists.map((c) => (
          <div key={c.id} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">{c.name}</p>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => void (await removeProjectChecklist(c.id)))}
                title={tc('delete')}
                aria-label={tc('delete')}
                className="rounded-md border border-border p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="p-3">
              <Checklist checklist={{ ...c, name: '' }} canRemoveItems compact />
            </div>
          </div>
        ))
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {templates.length > 0 && (
          <Select
            className="min-w-52"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            aria-label={t('template')}
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
            <option value="">{t('blank')}</option>
          </Select>
        )}
        {!templateId && (
          <input
            value={name}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            className="min-w-48 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
        <button type="button" disabled={pending} onClick={add} className={btn.primarySm}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('add')}
        </button>
      </div>
    </div>
  )
}
