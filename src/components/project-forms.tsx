'use client'

/**
 * The forms of a project — acceptance protocols and whatever else the office
 * has built a template for: which there are, how far each is signed, and a
 * way to start a new one. Drawn on the project page and on the crew's phone;
 * a form itself opens on a page of its own (`/forms/…`).
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, FileSignature, Plus } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { addForm } from '@/app/form-actions'
import type { FormStatus } from '@/lib/forms'

export type ProjectFormRow = {
  id: string
  title: string
  status: FormStatus
  signed: number
  signers: number
  /** When it was made, already formatted, and by whom. */
  made: string
}

export function ProjectForms({
  projectId,
  forms,
  templates,
  manageHref,
  frame = true,
  large = false,
}: {
  projectId: string
  forms: ProjectFormRow[]
  /** The active templates a new form can be made from. */
  templates: Array<{ value: string; label: string }>
  /** Where templates are built — for those who may go there. */
  manageHref?: string
  frame?: boolean
  large?: boolean
}) {
  const t = useTranslations('forms')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [template, setTemplate] = useState(templates[0]?.value ?? '')
  const [error, setError] = useState<string | null>(null)

  const text = large ? 'text-base' : 'text-sm'
  const small = large ? 'text-sm' : 'text-xs'
  const pad = frame ? 'px-5' : 'px-0'

  const add = () => {
    if (!template) return
    setError(null)
    startTransition(async () => {
      const result = await addForm(projectId, template)
      if (result.error || !result.id) return setError(result.error === 'notAllowed' ? t('errorNotAllowed') : tc('saveFailed'))
      router.push(`/forms/${result.id}`)
    })
  }

  const chip = (form: ProjectFormRow) => (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 ${small} font-medium ${
        form.status === 'signed'
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : form.status === 'partly'
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
            : 'bg-subtle text-muted'
      }`}
    >
      {form.status === 'signed' && <Check className="h-3 w-3" aria-hidden />}
      {form.status === 'signed' ? t('statusSigned') : form.status === 'partly' ? t('statusPartly', { done: form.signed, total: form.signers }) : t('statusDraft')}
    </span>
  )

  const body = (
    <>
      {forms.length === 0 ? (
        <p className={`${pad} py-4 ${text} text-muted`}>{t('none')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {forms.map((form) => (
            <li key={form.id} className={`flex items-center gap-3 ${pad} py-2.5 ${text}`}>
              <FileSignature className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={`/forms/${form.id}`} className="block truncate font-medium text-accent hover:underline">
                  {form.title}
                </Link>
                <p className={`truncate ${small} text-muted`}>{form.made}</p>
              </div>
              {chip(form)}
            </li>
          ))}
        </ul>
      )}
      <div className={`flex flex-wrap items-center gap-2 border-t border-border ${pad} py-3`}>
        {templates.length === 0 ? (
          <p className={`${small} text-muted`}>
            {t('noTemplates')}
            {manageHref && (
              <>
                {' '}
                <Link href={manageHref} className="text-accent hover:underline">
                  {t('templatesManage')} →
                </Link>
              </>
            )}
          </p>
        ) : (
          <>
            <Select
              aria-label={t('template')}
              compact={!large}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="min-w-0 flex-1 sm:max-w-xs"
            >
              {templates.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <button type="button" onClick={add} disabled={pending || !template} className={`${large ? btn.outline : btn.outlineSm} gap-1.5`}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('add')}
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className={`${pad} pb-3 ${text} text-danger`}>
          {error}
        </p>
      )}
    </>
  )

  if (!frame) return <div>{body}</div>

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('heading')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('hint')}</p>
        </div>
        {manageHref && (
          <Link href={manageHref} className="text-xs text-muted hover:text-foreground hover:underline">
            {t('templatesManage')}
          </Link>
        )}
      </div>
      {body}
    </section>
  )
}
