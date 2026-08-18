'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createEmployeeAccount, updateEmployeeAccount, type AccountState } from '../actions'
import { SavedToast } from '@/components/saved-toast'
import { DeleteButton } from '@/components/delete-button'
import { deleteUser } from '../../settings/actions'
import { Select } from '@/components/ui/select'

const ROLES = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const
const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export type AccountInfo = {
  id: string
  username: string
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  canViewFinancials: boolean
  active: boolean
} | null

export function AccountSection({
  employeeId,
  account,
  isAdmin,
  isSelf,
}: {
  employeeId: string
  account: AccountInfo
  /** Only administrators may create/edit accounts. */
  isAdmin: boolean
  isSelf: boolean
}) {
  const t = useTranslations('employees')
  const ts = useTranslations('settings')
  const tRoles = useTranslations('roles')
  const tc = useTranslations('common')
  const [enable, setEnable] = useState(false)
  const [createState, createAction, createPending] = useActionState<AccountState, FormData>(
    createEmployeeAccount.bind(null, employeeId),
    {}
  )
  const [updateState, updateAction, updatePending] = useActionState<AccountState, FormData>(
    updateEmployeeAccount.bind(null, employeeId),
    {}
  )

  const errorText = (s: AccountState) =>
    s.error ? (s.error === 'saveFailed' ? tc('saveFailed') : ts(s.error)) : null

  // ── No account yet ────────────────────────────────────────
  if (!account) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{t('accountTitle')}</h2>
        {!isAdmin ? (
          <p className="mt-2 text-sm text-muted">{t('accountNone')}</p>
        ) : (
          <>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={enable}
                onChange={(e) => setEnable(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {t('accountEnable')}
            </label>
            <p className="mt-1 text-xs text-muted">{t('accountActiveHint')}</p>
            {enable && (
              <form action={createAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="acc-username" className="block text-sm font-medium">
                    {ts('username')} <span className="text-danger">*</span>
                  </label>
                  <input id="acc-username" name="username" required autoComplete="off" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="acc-password" className="block text-sm font-medium">
                    {ts('password')} <span className="text-danger">*</span>
                  </label>
                  <input id="acc-password" name="password" type="password" required autoComplete="new-password" className={inputClass} />
                  <p className="mt-1 text-xs text-muted">{ts('passwordHint')}</p>
                </div>
                <div>
                  <label htmlFor="acc-role" className="block text-sm font-medium">
                    {ts('role')}
                  </label>
                  <Select id="acc-role" name="role" defaultValue="EMPLOYEE" className="mt-1 w-full">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tRoles(r)}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm font-medium">
                  <input type="checkbox" name="canViewFinancials" className="h-4 w-4 accent-[var(--accent)]" />
                  {ts('financialAccess')}
                </label>
                {createState.error && (
                  <p role="alert" className="text-sm text-danger sm:col-span-2">
                    {errorText(createState)}
                  </p>
                )}
                <div className="flex items-center gap-3 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={createPending}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                  >
                    {t('createAccount')}
                  </button>
                  <SavedToast trigger={createState.savedAt} />
                </div>
              </form>
            )}
          </>
        )}
      </section>
    )
  }

  // ── Existing account ──────────────────────────────────────
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('accountTitle')}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium">{account.username}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              account.role === 'ADMIN'
                ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                : account.role === 'MANAGER'
                  ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                  : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
            }`}
          >
            {tRoles(account.role)}
          </span>
          {(account.role === 'ADMIN' || account.canViewFinancials) && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              € {ts('financialAccess')}
            </span>
          )}
          {!account.active && (
            <span className="rounded-full bg-neutral-500/15 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('accountDeactivated')}
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <form action={updateAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="acc-role" className="block text-sm font-medium">
              {ts('role')}
            </label>
            <Select
              id="acc-role"
              name="role"
              defaultValue={account.role}
              disabled={isSelf}
              className="mt-1 w-full"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </Select>
            {isSelf && <input type="hidden" name="role" value={account.role} />}
          </div>
          <div>
            <label htmlFor="acc-newpw" className="block text-sm font-medium">
              {t('newPassword')}
            </label>
            <input id="acc-newpw" name="password" type="password" autoComplete="new-password" className={inputClass} />
            <p className="mt-1 text-xs text-muted">{ts('passwordKeep')}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="canViewFinancials"
              defaultChecked={account.canViewFinancials}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {ts('financialAccess')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="active"
              defaultChecked={account.active}
              disabled={isSelf}
              className="h-4 w-4 accent-[var(--accent)] disabled:opacity-60"
            />
            {tc('active')}
            {isSelf && <input type="hidden" name="active" value="on" />}
          </label>
          {updateState.error && (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {errorText(updateState)}
            </p>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              {tc('save')}
            </button>
            <SavedToast trigger={updateState.savedAt} />
          </div>
        </form>
      )}
      {isAdmin && (
        <div className="mt-3 flex justify-end">
          <DeleteButton
            action={deleteUser.bind(null, account.id)}
            label={t('deleteAccount')}
            confirmMessage={ts('deleteUserConfirm')}
            errorLabels={{
              selfDelete: ts('cannotDeleteSelf'),
              lastAdmin: ts('cannotDeleteLastAdmin'),
              saveFailed: tc('saveFailed'),
            }}
          />
        </div>
      )}
    </section>
  )
}
