import { describe, expect, it } from 'vitest'
import { columnFor, columnRuleKey, dropPatch, ruleMatches, type RuleFacts } from '@/lib/board-rules'

const facts = (over: Partial<RuleFacts> = {}): RuleFacts => ({ pausedAt: null, plannedStart: null, planMonth: null, priority: null, invoice1: false, ...over })
const now = new Date(Date.UTC(2026, 8, 24))

describe('what a rule picks', () => {
  it('reads the pause, the year, the priority and the invoice off the project', () => {
    expect(ruleMatches('paused', facts({ pausedAt: now }), 2026)).toBe(true)
    expect(ruleMatches('paused', facts(), 2026)).toBe(false)
    expect(ruleMatches('nextYear', facts({ plannedStart: new Date(Date.UTC(2027, 2, 1)) }), 2026)).toBe(true)
    expect(ruleMatches('nextYear', facts({ planMonth: new Date(Date.UTC(2027, 0, 1)) }), 2026)).toBe(true)
    expect(ruleMatches('nextYear', facts({ plannedStart: new Date(Date.UTC(2026, 11, 1)), planMonth: new Date(Date.UTC(2027, 0, 1)) }), 2026)).toBe(false)
    expect(ruleMatches('nextYear', facts({ plannedStart: new Date(Date.UTC(2026, 11, 1)) }), 2026)).toBe(false)
    expect(ruleMatches('lowPriority', facts({ priority: 'LOW' }), 2026)).toBe(true)
    expect(ruleMatches('invoice1', facts({ invoice1: true }), 2026)).toBe(true)
  })

  it('knows its own names', () => {
    expect(columnRuleKey('paused')).toBe('paused')
    expect(columnRuleKey('urgent')).toBeNull()
    expect(columnRuleKey(null)).toBeNull()
  })
})

describe('which column a card stands in', () => {
  const columns = [
    { key: 'a', status: 'APPROVED', rule: null },
    { key: 'a27', status: 'APPROVED', rule: 'nextYear' },
    { key: 'run', status: 'IN_PROGRESS', rule: null },
    { key: 'pause', status: 'IN_PROGRESS', rule: 'paused' },
    { key: 'only-paused', status: 'PLANNED', rule: 'paused' },
  ]

  it('is the rule column that picks it, else the plain one, else none', () => {
    expect(columnFor(columns, 'APPROVED', facts(), 2026)?.key).toBe('a')
    expect(columnFor(columns, 'APPROVED', facts({ plannedStart: new Date(Date.UTC(2027, 0, 1)) }), 2026)?.key).toBe('a27')
    expect(columnFor(columns, 'IN_PROGRESS', facts({ pausedAt: now }), 2026)?.key).toBe('pause')
    expect(columnFor(columns, 'PLANNED', facts(), 2026)).toBeNull()
    expect(columnFor(columns, 'PAID', facts(), 2026)).toBeNull()
  })
})

describe('what a drop does beyond the status', () => {
  it('puts a job on hold and takes it off again', () => {
    expect(dropPatch(null, 'paused', facts(), now)).toEqual({ pausedAt: now })
    expect(dropPatch('paused', null, facts({ pausedAt: now }), now)).toEqual({ pausedAt: null })
    expect(dropPatch('paused', 'paused', facts({ pausedAt: now }), now)).toEqual({})
  })

  it('marks the waiting list and clears it, leaving another priority alone', () => {
    expect(dropPatch(null, 'lowPriority', facts(), now)).toEqual({ priority: 'LOW' })
    expect(dropPatch('lowPriority', null, facts({ priority: 'LOW' }), now)).toEqual({ priority: null })
    expect(dropPatch('lowPriority', null, facts({ priority: 'HIGH' }), now)).toEqual({})
  })

  it('plans a card for next year only when it is not there yet, and never unplans it', () => {
    expect(dropPatch(null, 'nextYear', facts(), now)).toEqual({ planMonth: new Date(Date.UTC(2027, 0, 1)) })
    expect(dropPatch(null, 'nextYear', facts({ plannedStart: new Date(Date.UTC(2027, 5, 1)) }), now)).toEqual({})
    expect(dropPatch('nextYear', null, facts({ plannedStart: new Date(Date.UTC(2027, 5, 1)) }), now)).toEqual({})
  })

  it('refuses the invoice list: that is marked on the project, not dragged', () => {
    expect(dropPatch(null, 'invoice1', facts(), now)).toBe('refused')
    expect(dropPatch('invoice1', null, facts({ invoice1: true }), now)).toEqual({})
  })
})
