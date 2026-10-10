import { describe, expect, it } from 'vitest'
import { resolveReportsUrl } from '@/lib/reports-url'

describe('resolveReportsUrl', () => {
  it('leaves the current addresses alone', () => {
    expect(resolveReportsUrl({})).toBeNull()
    expect(resolveReportsUrl({ year: '2025', compare: '2024', chart: 'line', qyear: '2024' })).toBeNull()
    expect(resolveReportsUrl({ tab: 'revenue', year: '2025', layout: 'lanes' })).toBeNull()
    expect(resolveReportsUrl({ tab: 'utilization', period: 'q2' })).toBeNull()
    expect(resolveReportsUrl({ tab: 'quality' })).toBeNull()
    expect(resolveReportsUrl({ tab: 'quality', gap: 'town' })).toBeNull()
  })

  it('sends the old named Vergleich tab to the tab without a name, with its choices', () => {
    expect(resolveReportsUrl({ tab: 'compare', year: '2025', compare: '2024', chart: 'line' })).toBe(
      '/reports?year=2025&compare=2024&chart=line'
    )
    expect(resolveReportsUrl({ tab: 'compare' })).toBe('/reports')
  })

  it('opens Vergleich for the old overview, cockpit and Heute addresses, keeping the time frame', () => {
    expect(resolveReportsUrl({ tab: 'overview' })).toBe('/reports')
    expect(resolveReportsUrl({ tab: 'cockpit', year: '2025', period: 'q3' })).toBe('/reports?year=2025&period=q3')
    expect(resolveReportsUrl({ year: '2025', open: 'money' })).toBe('/reports?year=2025')
    expect(resolveReportsUrl({ view: 'compare', compare: '2024' })).toBe('/reports?compare=2024')
  })

  it('sends an overview that had the comparison set up to the comparison', () => {
    expect(resolveReportsUrl({ tab: 'overview', year: '2025', compare: '2024,2023', chart: 'line' })).toBe(
      '/reports?year=2025&compare=2024%2C2023&chart=line'
    )
  })

  it('keeps an empty comparison — every year taken out — through a redirect', () => {
    expect(resolveReportsUrl({ tab: 'revenue', view: 'cumulative', compare: '' })).toBe('/reports?compare=')
    expect(resolveReportsUrl({ tab: 'overview', qcompare: '' })).toBe('/reports?qcompare=')
  })

  it('opens Vergleich for the removed Aufträge & Baustellen, Pipeline and old offers tabs', () => {
    expect(resolveReportsUrl({ tab: 'jobs', sites: 'kanban' })).toBe('/reports')
    expect(resolveReportsUrl({ tab: 'pipeline', year: '2025' })).toBe('/reports?year=2025')
    expect(resolveReportsUrl({ tab: 'offers' })).toBe('/reports')
  })

  it('moves projects to Auslastung and customers to Planumsatz', () => {
    expect(resolveReportsUrl({ tab: 'projects', year: '2026' })).toBe('/reports?tab=utilization&year=2026')
    expect(resolveReportsUrl({ tab: 'customers', period: 'h1' })).toBe('/reports?tab=revenue&period=h1')
  })

  it('opens the months of Planumsatz for its old Baustellen and Kunden views, keeping how the months are drawn', () => {
    expect(resolveReportsUrl({ tab: 'revenue', view: 'sites', year: '2025', layout: 'lanes' })).toBe(
      '/reports?tab=revenue&year=2025&layout=lanes'
    )
    expect(resolveReportsUrl({ tab: 'revenue', view: 'customers', period: 'q1' })).toBe('/reports?tab=revenue&period=q1')
  })

  it('drops the year matrix, which is no longer a layout, and its zoom', () => {
    expect(resolveReportsUrl({ tab: 'revenue', year: '2025', layout: 'matrix', per: 'full', order: 'desc' })).toBe(
      '/reports?tab=revenue&year=2025&order=desc'
    )
    expect(resolveReportsUrl({ tab: 'revenue', view: 'sites', layout: 'matrix' })).toBe('/reports?tab=revenue')
  })

  it('moves the comparison out of Planumsatz into its own tab, with its choices and not the months layout', () => {
    expect(
      resolveReportsUrl({ tab: 'revenue', view: 'compare', year: '2025', period: 'q2', compare: '2024', chart: 'area', layout: 'lanes' })
    ).toBe('/reports?year=2025&period=q2&compare=2024&chart=area')
    expect(resolveReportsUrl({ tab: 'revenue', view: 'cumulative', year: '2025', layout: 'lanes', per: '6' })).toBe(
      '/reports?year=2025'
    )
  })

  it('opens Vergleich for a tab it does not know', () => {
    expect(resolveReportsUrl({ tab: 'something', year: '2024' })).toBe('/reports?year=2024')
  })
})
