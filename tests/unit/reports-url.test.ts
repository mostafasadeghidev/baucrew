import { describe, expect, it } from 'vitest'
import { resolveReportsUrl } from '@/lib/reports-url'

describe('resolveReportsUrl', () => {
  it('leaves the current addresses alone', () => {
    expect(resolveReportsUrl({})).toBeNull()
    expect(resolveReportsUrl({ tab: 'revenue', year: '2025', view: 'sites' })).toBeNull()
    expect(resolveReportsUrl({ tab: 'utilization', period: 'q2' })).toBeNull()
    expect(resolveReportsUrl({ tab: 'quality' })).toBeNull()
  })

  it('opens Heute for the old overview and cockpit, keeping the time frame', () => {
    expect(resolveReportsUrl({ tab: 'overview' })).toBe('/reports')
    expect(resolveReportsUrl({ tab: 'cockpit', year: '2025', period: 'q3' })).toBe('/reports?year=2025&period=q3')
  })

  it('sends an overview that had the comparison set up to the comparison', () => {
    expect(resolveReportsUrl({ tab: 'overview', year: '2025', compare: '2024,2023', chart: 'line' })).toBe(
      '/reports?tab=revenue&view=compare&year=2025&compare=2024%2C2023&chart=line'
    )
  })

  it('sends an old overview link without a tab to the comparison, and leaves a current Heute address alone', () => {
    expect(resolveReportsUrl({ year: '2025', compare: '2024,2023', chart: 'line', qyear: '2024' })).toBe(
      '/reports?tab=revenue&view=compare&year=2025&compare=2024%2C2023&chart=line&qyear=2024'
    )
    expect(resolveReportsUrl({ view: 'compare', compare: '2024' })).toBeNull()
    expect(resolveReportsUrl({ year: '2025', open: 'money' })).toBeNull()
  })

  it('keeps an empty comparison — every year taken out — through a redirect', () => {
    expect(resolveReportsUrl({ tab: 'revenue', view: 'cumulative', compare: '' })).toBe(
      '/reports?tab=revenue&view=compare&compare='
    )
    expect(resolveReportsUrl({ tab: 'overview', qcompare: '' })).toBe('/reports?tab=revenue&view=compare&qcompare=')
  })

  it('opens the offers list on Heute for the old offers tab', () => {
    expect(resolveReportsUrl({ tab: 'offers' })).toBe('/reports?open=offers')
  })

  it('moves projects to Auslastung and customers to Planumsatz', () => {
    expect(resolveReportsUrl({ tab: 'projects', year: '2026' })).toBe('/reports?tab=utilization&year=2026')
    expect(resolveReportsUrl({ tab: 'customers', period: 'h1' })).toBe('/reports?tab=revenue&view=customers&period=h1')
  })

  it('turns the old cumulative view into the comparison, keeping the revenue choices', () => {
    expect(resolveReportsUrl({ tab: 'revenue', view: 'cumulative', year: '2025', layout: 'lanes', per: '6' })).toBe(
      '/reports?tab=revenue&view=compare&year=2025&layout=lanes&per=6'
    )
  })

  it('opens Heute for a tab it does not know', () => {
    expect(resolveReportsUrl({ tab: 'something', year: '2024' })).toBe('/reports?year=2024')
  })
})
