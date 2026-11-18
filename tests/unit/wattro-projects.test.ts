import { describe, expect, it } from 'vitest'
import {
  addressLine,
  isFinishedForWattro,
  projectPatch,
  shouldCreateInWattro,
  toWattroProject,
  wattroChangeOf,
  wattroPhone,
  WATTRO_LIMITS,
  type PushableProject,
} from '@/lib/wattro/projects'

const project = (over: Partial<PushableProject> = {}): PushableProject => ({
  number: '2026-0804',
  jobNumber: null,
  name: 'Muster Fassade Beispielweg 3',
  status: 'APPROVED',
  archivedAt: null,
  street: 'Beispielweg 3',
  postalCode: '12345',
  city: 'Musterstadt',
  phone: '0123 456789',
  contact: 'Frau Muster',
  ...over,
})

describe('which projects Wattro gets', () => {
  it('creates a project once the job is approved, planned or running', () => {
    for (const status of ['APPROVED', 'PLANNED', 'IN_PROGRESS']) {
      expect(shouldCreateInWattro(project({ status }))).toBe(true)
    }
  })

  it('leaves leads, offers, finished and lost jobs out', () => {
    for (const status of ['LEAD', 'QUOTED', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']) {
      expect(shouldCreateInWattro(project({ status }))).toBe(false)
    }
  })

  it('does not create an archived project', () => {
    expect(shouldCreateInWattro(project({ archivedAt: new Date() }))).toBe(false)
  })

  it('closes the site in Wattro when the job is done, lost or put away', () => {
    expect(isFinishedForWattro(project({ status: 'IN_PROGRESS' }))).toBe(false)
    expect(isFinishedForWattro(project({ status: 'COMPLETED' }))).toBe(true)
    expect(isFinishedForWattro(project({ status: 'CANCELLED' }))).toBe(true)
    expect(isFinishedForWattro(project({ archivedAt: new Date() }))).toBe(true)
  })
})

describe('what Wattro is told', () => {
  it('sends the number as Wattro\'s human id, with name, address, contact and phone', () => {
    expect(toWattroProject(project())).toEqual({
      name: 'Muster Fassade Beispielweg 3',
      human_id: '2026-0804',
      contact: 'Frau Muster',
      address: 'Beispielweg 3, 12345 Musterstadt',
      phone: '0123 456789',
      finished: false,
    })
  })

  it('uses the client\'s Projektnummer as the ID when the project has one', () => {
    expect(toWattroProject(project({ jobNumber: '1234567' })).human_id).toBe('1234567')
    expect(toWattroProject(project({ jobNumber: null })).human_id).toBe('2026-0804')
  })

  it('carries nothing but those fields — no price, notes or customer', () => {
    expect(Object.keys(toWattroProject(project())).sort()).toEqual(
      ['address', 'contact', 'finished', 'human_id', 'name', 'phone']
    )
  })

  it('clips a name to Wattro\'s 100 characters', () => {
    const body = toWattroProject(project({ name: 'x'.repeat(250) }))
    expect(body.name).toHaveLength(WATTRO_LIMITS.name)
  })

  it('falls back to the number for an empty name', () => {
    expect(toWattroProject(project({ name: '   ' })).name).toBe('2026-0804')
  })

  it('leaves out a phone number that does not fit instead of cutting it', () => {
    expect(wattroPhone('+49 123 4567890 12345 67')).toBeNull()
    expect(wattroPhone('  ')).toBeNull()
    expect(wattroPhone(null)).toBeNull()
    expect(wattroPhone('+49 123 456789')).toBe('+49 123 456789')
  })

  it('writes whatever part of the address is known', () => {
    expect(addressLine({ street: null, postalCode: null, city: 'Musterstadt' })).toBe('Musterstadt')
    expect(addressLine({ street: 'Beispielweg 3', postalCode: null, city: null })).toBe('Beispielweg 3')
    expect(addressLine({ street: null, postalCode: null, city: null })).toBeNull()
  })
})

describe('what is sent to a project Wattro already has', () => {
  const body = toWattroProject(project())
  const same = { name: body.name, contact: body.contact, address: body.address, phone: body.phone, finished: false }

  it('sends nothing when nothing differs', () => {
    expect(projectPatch(body, same)).toEqual({})
  })

  it('sends only the fields that differ', () => {
    expect(projectPatch(body, { ...same, address: 'Anderswo 1' })).toEqual({ address: body.address })
  })

  it('never renames a project Wattro already holds', () => {
    expect(projectPatch(body, { ...same, name: 'Alter Name' })).toEqual({})
  })

  it('renames a project Wattro holds under another number', () => {
    const renamed = toWattroProject(project({ jobNumber: '1234567' }))
    expect(projectPatch(renamed, { ...same, human_id: '2026-0804' })).toEqual({ human_id: '1234567' })
    expect(projectPatch(renamed, { ...same, human_id: '1234567' })).toEqual({})
  })

  it('does not empty a field somebody filled in Wattro when ours is empty', () => {
    const empty = toWattroProject(project({ contact: null, phone: null, street: null, postalCode: null, city: null }))
    expect(projectPatch(empty, { name: empty.name, contact: 'Herr Beispiel', address: 'Dort 2', phone: '555', finished: false })).toEqual({})
  })

  it('always says whether the job is finished', () => {
    const done = toWattroProject(project({ status: 'COMPLETED' }))
    expect(projectPatch(done, { ...same })).toEqual({ finished: true })
    expect(projectPatch(body, { ...same, finished: true })).toEqual({ finished: false })
  })
})

describe('what a change made by the Trello sync means for Wattro', () => {
  const old = project({ status: 'QUOTED' })

  it('makes a site of a job the sync moved to a status Wattro gets', () => {
    expect(wattroChangeOf(old, project({ status: 'IN_PROGRESS' }), false)).toBe('status')
    expect(wattroChangeOf(project({ status: 'APPROVED' }), project({ status: 'IN_PROGRESS' }), false)).toBe('status')
  })

  it('leaves out a job moved anywhere else, or put away as it was moved', () => {
    expect(wattroChangeOf(old, project({ status: 'CANCELLED' }), false)).toBeNull()
    expect(wattroChangeOf(old, project({ status: 'IN_PROGRESS', archivedAt: new Date() }), false)).toBeNull()
  })

  it('leaves the stock from before the push alone: a running job whose status stood still', () => {
    const running = project({ status: 'IN_PROGRESS' })
    expect(wattroChangeOf(running, { ...running, street: 'Musterweg 9' }, false)).toBeNull()
  })

  it('tells Wattro of every new status of a site it has, so a finished job leaves the list', () => {
    expect(wattroChangeOf(project({ status: 'IN_PROGRESS' }), project({ status: 'COMPLETED' }), true)).toBe('status')
  })

  it('tells Wattro what changed on a site it has — but not a new name, which Wattro keeps', () => {
    const running = project({ status: 'IN_PROGRESS' })
    expect(wattroChangeOf(running, { ...running, street: 'Musterweg 9' }, true)).toBe('updated')
    expect(wattroChangeOf(running, { ...running, archivedAt: new Date() }, true)).toBe('updated')
    expect(wattroChangeOf(running, { ...running, name: 'Muster Neubau' }, true)).toBeNull()
    expect(wattroChangeOf(running, { ...running }, true)).toBeNull()
  })
})
