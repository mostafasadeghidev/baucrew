import { getLocale, getTranslations } from 'next-intl/server'
import { requireManagement } from '@/lib/authz'
import { getOptionList } from '@/lib/option-lists-db'
import { optionLabel } from '@/lib/option-lists'
import { PageBar, PageHint, StickyHead } from '@/components/ui/page-panel'
import { CatalogImport } from './catalog-import'

/** Materials and tools as a list: pasted from Excel, a CSV or Excel file, or the starter list. */
export default async function CatalogImportPage() {
  await requireManagement()
  const [t, tWarehouse, locale, kinds] = await Promise.all([
    getTranslations('catalogImport'),
    getTranslations('warehouse'),
    getLocale(),
    getOptionList('itemKinds'),
  ])

  return (
    <div className="space-y-4">
      <StickyHead>
        <PageBar back={{ href: '/warehouse', label: tWarehouse('title') }} title={t('title')} />
      </StickyHead>
      <PageHint>{t('hint')}</PageHint>
      <CatalogImport kinds={kinds.map((k) => ({ value: k.value, label: optionLabel(kinds, k.value, locale) }))} />
    </div>
  )
}
