'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Combobox } from '@/components/combobox'
import type { UserFormState } from './actions'
import { Select } from '@/components/ui/select'

export type UserFormValues = {
  username: string
  role: string
  canViewFinancials: boolean
  active: boolean
  employeeId: string
}

const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function UserForm({
  action,
  initial,
  employees,
  isNew,
  isSelf,
}: {
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>
  initial: UserFormValues
  employees: Array<{ value: string; label: string }>
  isNew: boolean
  isSelf: boolean
}) {
  const t = useTranslations('settings')
  const tRoles = useTranslations('roles')
  const tc = useTranslations('common')
  const tEmployees = useTranslations('employees')
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(action, {})

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="username" className="block text-sm font-medium">
              {t('username')} <span className="text-danger">*</span>
            </label>
            <input
              id="username"
              name="username"
              defaultValue={initial.username}
              required
              disabled={!isNew}
              autoComplete="off"
              className={`${inputClass} disabled:opacity-60`}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              {t('password')} {isNew && <span className="text-danger">*</span>}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required={isNew}
              autoComplete="new-password"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted">{isNew ? t('passwordHint') : t('passwordKeep')}</p>
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium">
              {t('role')}
            </label>
            <Select id="role" name="role" defaultValue={initial.role} disabled={isSelf} className="mt-1 w-full">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </Select>
            {isSelf && <input type="hidden" name="role" value={initial.role} />}
          </div>
          <div>
            <label className="block text-sm font-medium">{t('linkedEmployee')}</label>
            <Combobox
              name="employeeId"
              options={employees}
              defaultValue={initial.employeeId}
              placeholder={tc('none')}
              noResultsLabel={tEmployees('noResults')}
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="canViewFinancials"
                defaultChecked={initial.canViewFinancials}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {t('financialAccess')}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="active"
                defaultChecked={initial.active}
                disabled={isSelf}
                className="h-4 w-4 accent-[var(--accent)] disabled:opacity-60"
              />
              {tc('active')}
              {isSelf && <input type="hidden" name="active" value="on" />}
            </label>
          </div>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'saveFailed' ? tc('saveFailed') : t(state.error)}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {tc('save')}
        </button>
        <Link
          href="/settings?tab=accounts"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
        >
          {tc('cancel')}
        </Link>
      </div>
    </form>
  )
}
