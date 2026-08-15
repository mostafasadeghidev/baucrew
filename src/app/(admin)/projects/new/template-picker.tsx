'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'

/** Selecting a template reloads the form server-side with prefilled values. */
export function TemplatePicker({
  templates,
  current,
}: {
  templates: ComboboxOption[]
  current: string
}) {
  const t = useTranslations('templates')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="max-w-md rounded-lg border border-accent/40 bg-accent/5 p-4">
      <label className="block text-sm font-medium">{t('fromTemplate')}</label>
      <div className={pending ? 'opacity-60' : ''}>
        <Combobox
          key={current}
          name="_templatePicker"
          options={[{ value: '', label: t('noTemplate') }, ...templates]}
          defaultValue={current}
          placeholder={t('noTemplate')}
          noResultsLabel={t('noResults')}
          onSelect={(value) =>
            startTransition(() =>
              router.replace(value ? `/projects/new?template=${value}` : '/projects/new')
            )
          }
        />
      </div>
    </div>
  )
}
