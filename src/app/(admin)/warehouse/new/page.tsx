import { getTranslations } from 'next-intl/server'
import { createItem } from '../actions'
import { ItemForm } from '../item-form'

export default async function NewItemPage() {
  const t = await getTranslations('warehouse')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h1>
      <ItemForm
        action={createItem}
        cancelHref="/warehouse"
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
