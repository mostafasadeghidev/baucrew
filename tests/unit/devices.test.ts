import { describe, expect, it } from 'vitest'
import { daysOut, deviceState, isAvailable, type Handout } from '@/lib/devices'

const project = { id: 'p1', number: '2026-0001', name: 'Muster Fassade' }
const employee = { id: 'e1', firstName: 'Peter', lastName: 'Beispiel' }

function handout(over: Partial<Handout> = {}): Handout {
  return { returnedAt: null, project: null, employee: null, ...over }
}

describe('device state', () => {
  it('is free without a handout and after everything came back', () => {
    expect(deviceState([])).toEqual({ status: 'free' })
    expect(
      deviceState([handout({ returnedAt: new Date('2026-08-20'), project })])
    ).toEqual({ status: 'free' })
    expect(isAvailable([handout({ returnedAt: new Date('2026-08-20'), project })])).toBe(true)
  })

  it('reports the site it sits on', () => {
    const state = deviceState([handout({ project })])
    expect(state).toEqual({ status: 'onSite', projectId: 'p1', label: '2026-0001 — Muster Fassade' })
    expect(isAvailable([handout({ project })])).toBe(false)
  })

  it('reports the person who took it', () => {
    expect(deviceState([handout({ employee })])).toEqual({
      status: 'withEmployee',
      employeeId: 'e1',
      label: 'Peter Beispiel',
    })
  })

  it('stays busy when the handout says neither site nor person', () => {
    expect(deviceState([handout()]).status).toBe('out')
  })

  it('ignores returned handouts next to an open one', () => {
    const state = deviceState([
      handout({ returnedAt: new Date('2026-08-01'), employee }),
      handout({ project }),
    ])
    expect(state.status).toBe('onSite')
  })

  it('counts the days a device has been out', () => {
    expect(daysOut(new Date('2026-08-20T08:00:00Z'), new Date('2026-08-26T09:00:00Z'))).toBe(6)
    expect(daysOut(new Date('2026-08-26T08:00:00Z'), new Date('2026-08-26T09:00:00Z'))).toBe(0)
  })
})
