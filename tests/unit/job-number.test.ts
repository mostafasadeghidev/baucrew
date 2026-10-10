import { describe, expect, it } from 'vitest'
import { jobNumberOf } from '@/lib/job-number'

describe('jobNumberOf', () => {
  it('gives back the number a Trello card carried in its title', () => {
    expect(jobNumberOf({ externalSystem: 'trello', externalId: '4100001' })).toBe('4100001')
  })

  it('has none for a card without a number, whose id is the Trello card id', () => {
    expect(jobNumberOf({ externalSystem: 'trello', externalId: '6710b182cf10bba334c66856' })).toBeNull()
  })

  it('has none for a project from elsewhere or without a source', () => {
    expect(jobNumberOf({ externalSystem: 'excel', externalId: '4100001' })).toBeNull()
    expect(jobNumberOf({ externalSystem: null, externalId: null })).toBeNull()
  })
})
