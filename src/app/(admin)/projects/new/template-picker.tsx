'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'

/**
 * Selecting a template reloads the form server-side with prefilled values.
 *
 * It stands in the page's bar, beside cancel and save: its name and its field
 * on one line, the height of the buttons next to it. It used to be a tinted
 * card with the name stacked over the field, which made the new-project bar
 * nearly twice the height of the bar on every other page — and the bar is
 * pinned to the top of the window, so that height was lost for the whole form.
 */
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
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-sm text-muted">{t('fromTemplate')}</label>
      {/* The field keeps the top margin it carries for a label stacked above
          it; here the label stands beside it, and those four pixels were all
          that made this bar taller than every other. */}
      <div className={`w-56 [&_input]:mt-0 ${pending ? 'opacity-60' : ''}`}>
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
