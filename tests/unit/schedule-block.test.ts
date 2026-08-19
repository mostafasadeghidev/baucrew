import { describe, expect, it } from 'vitest'
import { assignmentBlock, blockEnd } from '@/lib/schedule-block'

const week = ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25']

describe('assignmentBlock', () => {
  it('keeps consecutive days together across the weekend', () => {
    expect(assignmentBlock(week, '2026-08-20')).toEqual(week)
    expect(blockEnd(week, '2026-08-19')).toBe('2026-08-25')
  })
  it('stops at a real pause (a separate assignment later)', () => {
    const days = [...week, '2026-09-07', '2026-09-08']
    expect(assignmentBlock(days, '2026-08-19')).toEqual(week)
    expect(assignmentBlock(days, '2026-09-07')).toEqual(['2026-09-07', '2026-09-08'])
  })
  it('a single day is its own block', () => {
    expect(assignmentBlock(['2026-08-19'], '2026-08-19')).toEqual(['2026-08-19'])
    expect(assignmentBlock([], '2026-08-19')).toEqual(['2026-08-19'])
  })
  it('also collects the days before the edited one', () => {
    expect(assignmentBlock(week, '2026-08-25')).toEqual(week)
  })
})
