'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { EmployeeFormState } from './actions'
import { TagsPicker } from '@/components/tags-picker'
import { btn } from '@/components/ui/button'

export type EmployeeFormValues = {
  firstName: string
  lastName: string
  phone: string
  email: string
  skills: string
  active: boolean
  notes: string
}

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function EmployeeForm({
  action,
  initial,
  cancelHref,
  skillSuggestions = [],
}: {
  action: (prev: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>
  initial: EmployeeFormValues
  cancelHref: string
  /** Existing skills for live suggestions. */
  skillSuggestions?: string[]
}) {
  const t = useTranslations('employees')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(action, {})

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium">
              {t('firstName')} <span className="text-danger">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              defaultValue={initial.firstName}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium">
              {t('lastName')} <span className="text-danger">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              defaultValue={initial.lastName}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium">
              {t('phone')}
            </label>
            <input id="phone" name="phone" defaultValue={initial.phone} className={inputClass} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              {t('email')}
            </label>
            <input id="email" name="email" type="email" defaultValue={initial.email} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <TagsPicker
              name="skills"
              label={t('skills')}
              defaultValues={initial.skills.split(/[,،]/).map((s) => s.trim()).filter(Boolean)}
              suggestions={skillSuggestions}
              createLabel={(v) => t('createSkill', { name: v })}
              removeLabel={t('removeSkill')}
              hint={t('skillsHint')}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="active"
                defaultChecked={initial.active}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {tc('active')}
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="block text-sm font-medium">
              {t('notes')}
            </label>
            <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} className={inputClass} />
          </div>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'nameRequired' ? t('nameRequired') : tc('saveFailed')}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={btn.primary}
        >
          {tc('save')}
        </button>
        <Link
          href={cancelHref}
          className={btn.outline}
        >
          {tc('cancel')}
        </Link>
      </div>
    </form>
  )
}
