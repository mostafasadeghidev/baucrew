import { getLocale, getTranslations } from 'next-intl/server'
import { getOptionList } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'
import { createItem, listCategories } from '../actions'
import { ItemForm } from '../item-form'

export default async function NewItemPage() {
  const [t, categories, kinds, locale] = await Promise.all([
    getTranslations('warehouse'),
    listCategories(),
    getOptionList('itemKinds'),
    getLocale(),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <ItemForm
        action={createItem}
        cancelHref="/warehouse"
        categories={categories.map((c) => c.name)}
        kinds={kinds.map((k) => ({ value: k.value, label: optionLabel(kinds, k.value, locale) }))}
        initial={{
          kind: kinds[0]?.value ?? 'TOOL',
          name: '',
          category: '',
          unit: '',
          stockQuantity: '',
          minStock: '',
          location: '',
          videoUrl: '',
          active: true,
          notes: '',
        }}
      />
    </div>
  )
}
