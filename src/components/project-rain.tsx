import { CloudRain } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getProjectsRain, getRainThreshold } from '@/lib/weather'
import type { RainProject } from '@/lib/rain-days'

/** " · 6,5 mm" behind a probability — nothing for a dry or unknown amount. */
export function RainAmount({ amount, locale }: { amount: number | null; locale: string }) {
  if (amount == null || amount <= 0) return null
  const mm = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 }).format(amount)
  return <> · {mm} mm</>
}

/**
 * A project's rain over the next two weeks, on its card and its page: the
 * rainy work days, firm ones apart from the tendency, or one quiet line on
 * why nothing can be said. Streams in on its own — the forecast never holds
 * up the card.
 */
export async function ProjectRain({ project }: { project: RainProject & { id: string } }) {
  const [rain, threshold, t, locale] = await Promise.all([
    getProjectsRain([project]).then((m) => m.get(project.id)),
    getRainThreshold(),
    getTranslations('rain'),
    getLocale(),
  ])
  if (!rain) return null
  if (!rain.ok) {
    // Over, put away or paused: nobody looks for weather there.
    if (rain.reason === 'closed' || rain.reason === 'archived' || rain.reason === 'paused') return null
    return <p className="text-xs text-muted">{t(`skip_${rain.reason}`)}</p>
  }
  // Said wherever a plaster or paint job counts by its words, so a wrong guess is seen and the text put right.
  const byText =
    rain.outdoor.by === 'text' ? (
      <p className="mt-1 text-xs text-muted">{t('outdoorByText', { word: rain.outdoor.word, field: rain.outdoor.field })}</p>
    ) : null
  if (rain.days.length === 0)
    return (
      <div>
        <p className="text-xs text-muted">{t('dry', { count: rain.checked, threshold })}</p>
        {byText}
      </div>
    )

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
  const firm = rain.days.filter((d) => d.confidence === 'firm')
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        firm.length > 0 ? 'border-sky-500/40 bg-sky-500/10' : 'border-border bg-subtle/60'
      }`}
    >
      <p className="flex items-center gap-1.5 font-medium">
        <CloudRain className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden />
        {t('title', { count: rain.days.length })}
      </p>
      <ul className="mt-1 space-y-0.5">
        {rain.days.map((d) => (
          <li key={d.date} className={`flex items-baseline gap-2 tabular-nums ${d.confidence === 'trend' ? 'text-muted' : ''}`}>
            <span className="w-20 shrink-0">{dateFmt.format(new Date(`${d.date}T00:00:00Z`))}</span>
            <span>
              {d.probability} %<RainAmount amount={d.amount} locale={locale} />
            </span>
            {d.confidence === 'trend' && <span className="text-xs">{t('trend')}</span>}
          </li>
        ))}
      </ul>
      {rain.source === 'planned' && <p className="mt-1 text-xs text-muted">{t('fromPlannedRange')}</p>}
      {byText}
    </div>
  )
}
