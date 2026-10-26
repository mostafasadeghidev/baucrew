import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  project: null as unknown,
  findUnique: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  fetchByNumber: vi.fn(),
  fetchById: vi.fn(),
  create: vi.fn(),
  patch: vi.fn(),
  enabled: true,
}))

vi.mock('@/lib/db', () => ({
  db: { project: { findUnique: h.findUnique, findMany: vi.fn() }, projectLink: { upsert: h.upsert }, appSetting: {} },
}))
vi.mock('@/lib/audit', () => ({ audit: h.audit }))
vi.mock('@/lib/wattro/client', async (orig) => {
  const actual = await orig<typeof import('@/lib/wattro/client')>()
  return {
    ...actual,
    isProjectPushEnabled: () => h.enabled,
    fetchProjectByHumanId: h.fetchByNumber,
    fetchProjectById: h.fetchById,
    createWattroProject: h.create,
    patchWattroProject: h.patch,
  }
})

import { pushProjectToWattro } from '@/lib/wattro/project-push'
import { WattroApiError } from '@/lib/wattro/client'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  number: '2026-0804',
  jobNumber: null,
  name: 'Muster Fassade',
  status: 'APPROVED',
  archivedAt: null,
  street: 'Beispielweg 3',
  postalCode: '12345',
  city: 'Musterstadt',
  phone: null,
  contact: null,
  links: [],
  ...over,
})
const record = (over: Record<string, unknown> = {}) => ({
  id: 77,
  name: 'Muster Fassade',
  humanId: '2026-0804',
  contact: null,
  address: 'Beispielweg 3, 12345 Musterstadt',
  phone: null,
  finished: false,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.enabled = true
  h.findUnique.mockResolvedValue(row())
  h.fetchByNumber.mockResolvedValue(null)
  h.fetchById.mockResolvedValue(null)
  h.create.mockResolvedValue(record())
  h.patch.mockResolvedValue(record())
})

describe('pushProjectToWattro', () => {
  it('does nothing and asks nothing while the switch is off', async () => {
    h.enabled = false
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: true, result: 'off' })
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.fetchByNumber).not.toHaveBeenCalled()
  })

  it('creates a new approved project under its number and remembers the link', async () => {
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: true, result: 'created' })
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ human_id: '2026-0804', name: 'Muster Fassade', finished: false }))
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { projectId: 'p1', system: 'wattro', externalId: '77' } }))
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.wattroPush', newValue: 'created created 2026-0804' }))
  })

  it('leaves a lead out', async () => {
    h.findUnique.mockResolvedValue(row({ status: 'LEAD' }))
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: true, result: 'skipped' })
    expect(h.fetchByNumber).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('does not create a project from a plain edit, only from a new project or status', async () => {
    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'skipped' })
    expect(h.create).not.toHaveBeenCalled()
    expect(await pushProjectToWattro('p1', 'status')).toEqual({ ok: true, result: 'created' })
  })

  it('adopts a project Wattro already holds under the number instead of creating it twice', async () => {
    h.fetchByNumber.mockResolvedValue(record())
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: true, result: 'adopted' })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.upsert).toHaveBeenCalled()
  })

  it('adopts when a repeat finds what the first try already made', async () => {
    h.fetchByNumber.mockResolvedValueOnce(null).mockResolvedValueOnce(record())
    h.create.mockRejectedValue(new WattroApiError('upstream', 'Wattro responded with 400', 400))
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: true, result: 'adopted' })
  })

  it('updates a linked project with only what differs', async () => {
    h.findUnique.mockResolvedValue(row({ name: 'Muster Fassade neu', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'updated' })
    expect(h.patch).toHaveBeenCalledWith('2026-0804', { name: 'Muster Fassade neu' })
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('sends nothing when the linked project is already up to date', async () => {
    h.findUnique.mockResolvedValue(row({ links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'unchanged' })
    expect(h.patch).not.toHaveBeenCalled()
    expect(h.audit).not.toHaveBeenCalled()
  })

  it('closes the site in Wattro when a linked job is completed', async () => {
    h.findUnique.mockResolvedValue(row({ status: 'COMPLETED', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    await pushProjectToWattro('p1', 'status')
    expect(h.patch).toHaveBeenCalledWith('2026-0804', { finished: true })
  })

  it('does not bring back a finished project Wattro lost', async () => {
    h.findUnique.mockResolvedValue(row({ status: 'COMPLETED', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(null)
    expect(await pushProjectToWattro('p1', 'status')).toEqual({ ok: true, result: 'skipped' })
    expect(h.create).not.toHaveBeenCalled()
  })

  it('knows the project by the client\'s Projektnummer when it has one', async () => {
    h.findUnique.mockResolvedValue(row({ jobNumber: '1234567' }))
    h.create.mockResolvedValue(record({ humanId: '1234567' }))
    await pushProjectToWattro('p1', 'created')
    expect(h.fetchByNumber).toHaveBeenCalledWith('1234567')
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ human_id: '1234567' }))
  })

  it('renames the same Wattro project when the number was changed here, instead of making a second', async () => {
    h.findUnique.mockResolvedValue(row({ jobNumber: '1234567', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(null) // nothing under the new number
    h.fetchById.mockResolvedValue(record({ humanId: '2026-0804' })) // but id 77 is there under the old one
    h.patch.mockResolvedValue(record({ humanId: '1234567' }))

    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'renamed' })
    expect(h.fetchById).toHaveBeenCalledWith(77)
    expect(h.patch).toHaveBeenCalledWith('2026-0804', { human_id: '1234567' })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ newValue: 'updated renamed 2026-0804 → 1234567' }))
  })

  it('makes the project again when its Wattro record is gone under both numbers', async () => {
    h.findUnique.mockResolvedValue(row({ jobNumber: '1234567', links: [{ id: 'l1', externalId: '77' }] }))
    h.create.mockResolvedValue(record({ id: 90, humanId: '1234567' }))
    expect(await pushProjectToWattro('p1', 'status')).toEqual({ ok: true, result: 'created' })
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { externalId: '90' } }))
  })

  it('never throws: a failing Wattro is audited and reported', async () => {
    h.create.mockRejectedValue(new WattroApiError('network', 'down'))
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: false, error: 'network' })
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.wattroPushFailed', newValue: 'created network' }))
  })

  it('reports a database failure as its own kind', async () => {
    h.findUnique.mockRejectedValue(new Error('connection lost'))
    expect(await pushProjectToWattro('p1', 'created')).toEqual({ ok: false, error: 'database' })
  })

  it('runs two quick events for one project one after the other', async () => {
    let release!: () => void
    h.create.mockImplementationOnce(() => new Promise((r) => (release = () => r(record()))))
    const first = pushProjectToWattro('p1', 'created')
    await vi.waitFor(() => expect(h.create).toHaveBeenCalled())
    // The first is still waiting on Wattro; the second has not even looked at the project.
    const second = pushProjectToWattro('p1', 'updated')
    await new Promise((r) => setTimeout(r, 20))
    expect(h.findUnique).toHaveBeenCalledTimes(1)

    h.findUnique.mockResolvedValue(row({ links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    release()
    expect(await first).toEqual({ ok: true, result: 'created' })
    expect(await second).toEqual({ ok: true, result: 'unchanged' })
    expect(h.create).toHaveBeenCalledTimes(1)
  })
})
