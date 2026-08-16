import { getTranslations } from 'next-intl/server'
import { createItem, listCategories } from '../actions'
import { ItemForm } from '../item-form'

export default async function NewItemPage() {
  const [t, categories] = await Promise.all([getTranslations('warehouse'), listCategories()])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <ItemForm
        action={createItem}
        cancelHref="/warehouse"
        categories={categories.map((c) => c.name)}
        initial={{
          kind: 'TOOL',
          name: '',
          category: '',
          unit: '',
          stockQuantity: '',
          minStock: '',
          location: '',
          active: true,
          notes: '',
        }}
      />
    </div>
  )
}
