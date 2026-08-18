'use client'

import { useActionState, useState } from 'react'
import { CityPicker } from '@/components/city-picker'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { CustomerFormState } from './actions'
import { btn } from '@/components/ui/button'

export type CustomerFormValues = {
  name: string
  company: string
  contactPerson: string
  phone: string
  email: string
  street: string
  postalCode: string
  city: string
  latitude: number | null
  longitude: number | null
  country: string
  notes: string
}

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
}: {
  label: string
  name: string
  defaultValue: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className={inputClass}
      />
    </div>
  )
}

export function CustomerForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: CustomerFormState, formData: FormData) => Promise<CustomerFormState>
  initial: CustomerFormValues
  cancelHref: string
}) {
  const t = useTranslations('customers')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<CustomerFormState, FormData>(action, {})
  const [cityValue, setCityValue] = useState({ city: initial.city, latitude: initial.latitude, longitude: initial.longitude })
  const [postalCode, setPostalCode] = useState(initial.postalCode)

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} name="name" defaultValue={initial.name} required />
          <Field label={t('company')} name="company" defaultValue={initial.company} />
          <Field label={t('contactPerson')} name="contactPerson" defaultValue={initial.contactPerson} />
          <Field label={t('phone')} name="phone" defaultValue={initial.phone} />
          <Field label={t('email')} name="email" type="email" defaultValue={initial.email} />
          <Field label={t('street')} name="street" defaultValue={initial.street} />
          <div>
            <label htmlFor="postalCode" className="block text-sm font-medium">
              {t('postalCode')}
            </label>
            <input
              id="postalCode"
              name="postalCode"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className={inputClass}
            />
          </div>
          <CityPicker
            label={t('city')}
            value={cityValue}
            onChange={setCityValue}
            onPostcode={(pc) => setPostalCode((prev) => prev || pc)}
          />
          <Field label={t('country')} name="country" defaultValue={initial.country} />
        </div>
        <div className="mt-4">
          <label htmlFor="notes" className="block text-sm font-medium">
            {t('notes')}
          </label>
          <textarea id="notes" name="notes" rows={4} defaultValue={initial.notes} className={inputClass} />
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
