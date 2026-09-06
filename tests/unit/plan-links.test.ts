import { describe, expect, it } from 'vitest'
import { parsePlanLinks, serializePlanLinks, type PlanLinkRecord } from '@/lib/plan-links'

const link: PlanLinkRecord = {
  year: 2026,
  month: 3,
  name: 'Musterhof Innenputz',
  amount: 12500,
  project: { number: '2026-0007', name: 'Musterhof', externalSystem: 'trello', externalId: '4100001' },
}

describe('plan links file', () => {
  it('comes back as it went out', () => {
    const text = serializePlanLinks([link], new Date(Date.UTC(2026, 8, 6)))
    expect(JSON.parse(text)).toMatchObject({ format: 'baucrew-plan-links', version: 1 })
    expect(parsePlanLinks(text)).toEqual([link])
  })

  it('keeps a project without a source record', () => {
    const hand = { ...link, project: { number: '2026-0001', name: 'Musterhof', externalSystem: null, externalId: null } }
    expect(parsePlanLinks(serializePlanLinks([hand]))).toEqual([hand])
  })

  it('refuses anything that is not a links file', () => {
    expect(parsePlanLinks('not json')).toBeNull()
    expect(parsePlanLinks('{"links": []}')).toBeNull()
    expect(parsePlanLinks(JSON.stringify({ format: 'baucrew-plan-links', links: [{ year: 2026 }] }))).toBeNull()
    expect(
      parsePlanLinks(JSON.stringify({ format: 'baucrew-plan-links', links: [{ ...link, amount: '12500' }] }))
    ).toBeNull()
  })
})
