'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createCustomerInline } from '../customers/actions'
import { CityPicker, type CityValue } from '@/components/city-picker'
import { btn } from '@/components/ui/button'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function NewCustomerModal({
  prefillName,
  onClose,
  onCreated,
}: {
  prefillName: string
  onClose: () => void
  onCreated: (customer: {
    id: string
    name: string
    street?: string | null
    postalCode?: string | null
    city?: string | null
    phone?: string | null
    latitude?: number | null
    longitude?: number | null
  }) => void
}) {
  const t = useTranslations('customers')
  const tc = useTranslations('common')
  const [error, setError] = useState<string | null>(null)
  const [city, setCity] = useState<CityValue>({ city: '', latitude: null, longitude: null })
  const [postalCode, setPostalCode] = useState('')
  const [pending, startTransition] = useTransition()

  // Lock background scrolling while the modal is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const value = (name: string) =>
      String((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '')
    setError(null)
    startTransition(async () => {
      const result = await createCustomerInline({
        name: value('name'),
        company: value('company'),
        contactPerson: value('contactPerson'),
        phone: value('phone'),
        email: value('email'),
        street: value('street'),
        postalCode,
        city: city.city,
        latitude: city.latitude,
        longitude: city.longitude,
      })
      if ('error' in result) {
        setError(result.error === 'nameRequired' ? t('nameRequired') : tc('saveFailed'))
      } else {
        onCreated(result)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('createTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            title={tc('cancel')}
            aria-label={tc('cancel')}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="nc-name" className="block text-sm font-medium">
                {t('name')} <span className="text-danger">*</span>
              </label>
              <input id="nc-name" name="name" defaultValue={prefillName} required autoFocus className={inputClass} />
            </div>
            <div>
              <label htmlFor="nc-company" className="block text-sm font-medium">
                {t('company')}
              </label>
              <input id="nc-company" name="company" className={inputClass} />
            </div>
            <div>
              <label htmlFor="nc-contact" className="block text-sm font-medium">
                {t('contactPerson')}
              </label>
              <input id="nc-contact" name="contactPerson" className={inputClass} />
            </div>
            <div>
              <label htmlFor="nc-phone" className="block text-sm font-medium">
                {t('phone')}
              </label>
              <input id="nc-phone" name="phone" className={inputClass} />
            </div>
            <div>
              <label htmlFor="nc-email" className="block text-sm font-medium">
                {t('email')}
              </label>
              <input id="nc-email" name="email" type="email" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nc-street" className="block text-sm font-medium">
                {t('street')}
              </label>
              <input id="nc-street" name="street" className={inputClass} />
            </div>
            <div>
              <label htmlFor="nc-postal" className="block text-sm font-medium">
                {t('postalCode')}
              </label>
              <input
                id="nc-postal"
                name="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              {/* Same picker as everywhere else: recognises the place and
                  stores the coordinates for the weather warnings. */}
              <CityPicker
                label={t('city')}
                name="city"
                value={city}
                onChange={setCity}
                onPostcode={(plz) => setPostalCode((prev) => prev || plz)}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
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
            <button
              type="button"
              onClick={onClose}
              className={btn.outline}
            >
              {tc('cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
