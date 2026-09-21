import { describe, expect, it } from 'vitest'
import { nextStatus } from '@/lib/status-flow'

describe('nextStatus', () => {
  it('walks a project from the inquiry to the payment', () => {
    const walked = ['LEAD']
    for (let next = nextStatus('LEAD'); next; next = nextStatus(next)) walked.push(next)
    expect(walked).toEqual(['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'])
  })

  it('has no step after paid, none out of cancelled, none for what is no status', () => {
    expect(nextStatus('PAID')).toBeNull()
    expect(nextStatus('CANCELLED')).toBeNull()
    expect(nextStatus('whatever')).toBeNull()
  })
})
