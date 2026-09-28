import { describe, expect, it } from 'vitest'
import { notificationLine, recipientsFor, type NotifyCandidate } from '@/lib/notifications'

const office = (userId: string, rest: Partial<NotifyCandidate> = {}): NotifyCandidate => ({ userId, role: 'MANAGER', member: false, watching: true, ...rest })

describe('recipientsFor', () => {
  it('tells members and those following, never the one who did it', () => {
    const ids = recipientsFor({
      actorId: 'u1',
      candidates: [office('u1'), office('u2'), office('u3', { watching: false, member: true }), office('u4', { watching: false })],
    })
    expect(ids).toEqual(['u2', 'u3'])
  })

  it('leaves out the crew, and a site manager no longer on the card', () => {
    const ids = recipientsFor({
      actorId: null,
      candidates: [
        office('crew', { role: 'EMPLOYEE', member: true }),
        office('sm-on', { role: 'SITE_MANAGER', member: true, watching: false }),
        office('sm-off', { role: 'SITE_MANAGER', member: false, watching: true }),
      ],
    })
    expect(ids).toEqual(['sm-on'])
  })

  it('keeps what the office wrote for itself within the office', () => {
    const ids = recipientsFor({
      actorId: null,
      officeOnly: true,
      candidates: [office('boss', { role: 'ADMIN' }), office('sm', { role: 'SITE_MANAGER', member: true })],
    })
    expect(ids).toEqual(['boss'])
  })

  it('skips those told already, and counts nobody twice', () => {
    const ids = recipientsFor({ actorId: null, except: ['u2'], candidates: [office('u1'), office('u1'), office('u2')] })
    expect(ids).toEqual(['u1'])
  })
})

describe('notificationLine', () => {
  const words = (key: string, values?: Record<string, string>) => (values ? `${key}(${Object.values(values).join(',')})` : key)
  const status = (s: string) => `[${s}]`
  const today = new Date(Date.UTC(2026, 8, 28, 15))

  it('says what happened', () => {
    expect(notificationLine('comment', 'Gerüst steht', words, status, today)).toBe('nComment(Gerüst steht)')
    expect(notificationLine('moved', 'PLANNED', words, status, today)).toBe('nMoved([PLANNED])')
    expect(notificationLine('added', null, words, status, today)).toBe('nAdded')
    expect(notificationLine('attachment', 'plan.pdf', words, status, today)).toBe('nAttachment(plan.pdf)')
    expect(notificationLine('something', null, words, status, today)).toBe('nUpdated')
  })

  it('tells how near a day due is', () => {
    expect(notificationLine('due', '2026-09-27', words, status, today)).toBe('nOverdue')
    expect(notificationLine('due', '2026-09-28', words, status, today)).toBe('nDueToday')
    expect(notificationLine('due', '2026-09-29', words, status, today)).toBe('nDueTomorrow')
    expect(notificationLine('due', '2026-10-05', words, status, today)).toBe('nDueOn(2026-10-05)')
    expect(notificationLine('due', '2026-09-28 14:00', words, status, today)).toBe('nDueTodayAt(14:00)')
    expect(notificationLine('due', '2026-09-29 08:30', words, status, today)).toBe('nDueTomorrowAt(08:30)')
    expect(notificationLine('due', '2026-10-05 07:00', words, status, today)).toBe('nDueOnAt(2026-10-05,07:00)')
  })
})
