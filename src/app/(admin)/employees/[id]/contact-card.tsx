'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { TagsPicker } from '@/components/tags-picker'
import type { ContactFormState } from '../actions'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * The contact card on an employee's page, edited where it stands.
 *
 * The pencil at its top right opens its own fields — phone, e-mail, skills,
 * notes — and becomes cancel and save, the way every card on a project's page
 * works, so nothing else on the page moves while one card is open. It saves
 * only what it shows: the name and the active flag stay with the full edit
 * page, and a card that posted every field of the employee could quietly
 * overwrite them.
 */
export function ContactCard({
  action,
  contact,
  skillSuggestions,
}: {
  action: (prev: ContactFormState, formData: FormData) => Promise<ContactFormState>
  contact: { phone: string | null; email: string | null; skills: string[]; notes: string | null }
  /** Skills anybody already has, offered while typing. */
  skillSuggestions: string[]
}) {
  const t = useTranslations('employees')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(action, {})
  /** When the pencil was pressed; null while the card only shows. */
  const [openedAt, setOpenedAt] = useState<number | null>(null)

  // Derived rather than copied into state by an effect: a save that lands after
  // the card was opened closes it again, and an error only counts if it came
  // from this opening, not from one that was cancelled earlier.
  const editing = openedAt !== null && !(state.savedAt !== undefined && state.savedAt > openedAt)
  const failed = editing && state.failedAt !== undefined && state.failedAt > (openedAt ?? 0)

  return (
    <form action={formAction} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('contactData')}</h2>
        {editing ? (
          <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => setOpenedAt(null)} className={btn.outlineXs}>
              {tc('cancel')}
            </button>
            <button type="submit" disabled={pending} className={`${btn.primarySm} px-2.5 py-1 text-xs`}>
              {tc('save')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpenedAt(Date.now())}
            title={tc('edit')}
            aria-label={`${tc('edit')}: ${t('contactData')}`}
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {editing ? (
        // Mounted only while open, so every opening starts from what is saved
        // — a cancel leaves nothing half-typed behind for the next one.
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-phone" className="block text-sm font-medium">
              {t('phone')}
            </label>
            <input id="contact-phone" name="phone" defaultValue={contact.phone ?? ''} className={inputClass} />
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium">
              {t('email')}
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              defaultValue={contact.email ?? ''}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <TagsPicker
              name="skills"
              label={t('skills')}
              defaultValues={contact.skills}
              suggestions={skillSuggestions}
              createLabel={(v) => t('createSkill', { name: v })}
              removeLabel={t('removeSkill')}
              hint={t('skillsHint')}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="contact-notes" className="block text-sm font-medium">
              {t('notes')}
            </label>
            <textarea
              id="contact-notes"
              name="notes"
              rows={3}
              defaultValue={contact.notes ?? ''}
              className={inputClass}
            />
          </div>
          {failed && (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {tc('saveFailed')}
            </p>
          )}
        </div>
      ) : (
        <>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('phone')}</dt>
              <dd>{contact.phone ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('email')}</dt>
              <dd>{contact.email ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 text-muted">{t('skills')}</dt>
              <dd className="flex flex-wrap gap-1">
                {contact.skills.length === 0
                  ? '—'
                  : contact.skills.map((s) => (
                      <span key={s} className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium">
                        {s}
                      </span>
                    ))}
              </dd>
            </div>
          </dl>
          {contact.notes && (
            <>
              <h3 className="mt-4 text-sm font-semibold">{t('notes')}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{contact.notes}</p>
            </>
          )}
        </>
      )}
    </form>
  )
}
