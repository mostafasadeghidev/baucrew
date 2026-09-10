import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getOptionList } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'
import { db } from '@/lib/db'
import { DeleteButton } from '@/components/delete-button'
import { deleteItem, updateItem } from '../../actions'
import { listCategories } from '../../actions'
import { ItemForm } from '../../item-form'

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, tc, categories, kinds, locale] = await Promise.all([
    getTranslations('warehouse'),
    getTranslations('common'),
    listCategories(),
    getOptionList('itemKinds'),
    getLocale(),
  ])
  const item = await db.catalogItem.findUnique({ where: { id } })
  if (!item) notFound()

  return (
    <div className="space-y-4">
      <ItemForm
        action={updateItem.bind(null, item.id)}
        cancelHref="/warehouse"
        title={`${t('editTitle')} — ${item.name}`}
        headExtra={
          <DeleteButton
            action={deleteItem.bind(null, item.id)}
            label={tc('delete')}
            confirmMessage={t('deleteConfirm')}
            errorLabels={{ cannotDeleteInUse: t('cannotDeleteInUse') }}
          />
        }
        categories={categories.map((c) => c.name)}
        kinds={kinds.map((k) => ({ value: k.value, label: optionLabel(kinds, k.value, locale) }))}
        initial={{
          kind: item.kind,
          name: item.name,
          category: item.category ?? '',
          unit: item.unit ?? '',
          stockQuantity: item.stockQuantity != null ? String(Number(item.stockQuantity)) : '',
          minStock: item.minStock != null ? String(Number(item.minStock)) : '',
          location: item.location ?? '',
          videoUrl: item.videoUrl ?? '',
          active: item.active,
          notes: item.notes ?? '',
        }}
      />
    </div>
  )
}
