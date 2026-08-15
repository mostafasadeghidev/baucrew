import { getTranslations } from 'next-intl/server'

export async function PlaceholderPage({
  titleKey,
  hintKey,
}: {
  titleKey: string
  hintKey: string
}) {
  const tNav = await getTranslations('nav')
  const tPh = await getTranslations('placeholder')
  const tc = await getTranslations('common')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{tNav(titleKey)}</h1>
      <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm font-medium">{tc('comingSoon')}</p>
        <p className="mt-1 text-sm text-muted">{tPh(hintKey)}</p>
      </div>
    </div>
  )
}
