import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  project: null as unknown,
  findUnique: vi.fn(),
  findMany: vi.fn(),
  setting: vi.fn(),
  failed: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  fetchByNumber: vi.fn(),
  fetchById: vi.fn(),
  create: vi.fn(),
  patch: vi.fn(),
  enabled: true,
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: h.findUnique, findMany: h.findMany },
    projectLink: { upsert: h.upsert },
    appSetting: { findUnique: h.setting },
    auditLog: { findMany: h.failed },
  },
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

import { MAX_CREATED_PER_IMPORT, pushImportedProjects, pushPendingProjects, pushProjectToWattro } from '@/lib/wattro/project-push'
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
  h.findMany.mockResolvedValue([])
  h.failed.mockResolvedValue([])
  h.setting.mockResolvedValue({ key: 'wattro.projectPushFrom', value: '2026-10-19T08:00:00.000Z' })
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
    h.findUnique.mockResolvedValue(row({ street: 'Beispielweg 5', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'updated' })
    expect(h.patch).toHaveBeenCalledWith('2026-0804', { address: 'Beispielweg 5, 12345 Musterstadt' })
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('leaves the name of a project Wattro already holds as it is there', async () => {
    // The name here became "Kunde · Leistung"; the crews know the site by the old one.
    h.findUnique.mockResolvedValue(row({ name: 'Muster GmbH · Malern', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'unchanged' })
    expect(h.patch).not.toHaveBeenCalled()
  })

  it('names a project made in Wattro now the way it is named here', async () => {
    h.findUnique.mockResolvedValue(row({ name: 'Muster GmbH · Malern' }))
    h.create.mockResolvedValue(record())
    await pushProjectToWattro('p1', 'created')
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Muster GmbH · Malern' }))
  })

  it('keeps the name when a new Projektnummer renames the project\'s ID there', async () => {
    h.findUnique.mockResolvedValue(row({ name: 'Muster GmbH · Malern', jobNumber: '1234567', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(null)
    h.fetchById.mockResolvedValue(record({ humanId: '2026-0804' }))
    h.patch.mockResolvedValue(record({ humanId: '1234567' }))
    expect(await pushProjectToWattro('p1', 'updated')).toEqual({ ok: true, result: 'renamed' })
    expect(h.patch).toHaveBeenCalledWith('2026-0804', { human_id: '1234567' })
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

describe('what the Trello sync moved', () => {
  const running = () => row({ status: 'IN_PROGRESS' })

  it('creates the site of a job moved to "In Ausführung" in Trello, and says where it came from', async () => {
    h.findUnique.mockResolvedValue(running())
    expect(await pushImportedProjects([{ id: 'p1', change: 'status', linked: false }], 'trello')).toEqual({ sent: 1, held: 0 })
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ human_id: '2026-0804', finished: false }))
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.wattroPush', newValue: 'import created 2026-0804' }))
  })

  it('marks a site finished when its card moves to a done list', async () => {
    h.findUnique.mockResolvedValue(row({ status: 'COMPLETED', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    expect(await pushImportedProjects([{ id: 'p1', change: 'status', linked: true }], 'trello')).toEqual({ sent: 1, held: 0 })
    expect(h.patch).toHaveBeenCalledWith('2026-0804', { finished: true })
    expect(h.create).not.toHaveBeenCalled()
  })

  it('goes on with the rest when Wattro refuses one', async () => {
    h.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ ...running(), id: where.id, number: where.id }))
    h.create.mockRejectedValueOnce(new WattroApiError('upstream', 'refused', 400))
    const changes = ['a', 'b', 'c'].map((id) => ({ id, change: 'status' as const, linked: false }))
    expect(await pushImportedProjects(changes, 'trello')).toEqual({ sent: 2, held: 0 })
    expect(h.create).toHaveBeenCalledTimes(3)
  })

  it('creates none when a whole list moved at once, notes it, and still updates the sites Wattro has', async () => {
    h.findUnique.mockResolvedValue(row({ status: 'COMPLETED', links: [{ id: 'l1', externalId: '77' }] }))
    h.fetchByNumber.mockResolvedValue(record())
    const many = Array.from({ length: MAX_CREATED_PER_IMPORT + 1 }, (_, i) => ({ id: `n${i}`, change: 'status' as const, linked: false }))
    const outcome = await pushImportedProjects([...many, { id: 'p1', change: 'status', linked: true }], 'trello')
    expect(outcome).toEqual({ sent: 1, held: MAX_CREATED_PER_IMPORT + 1 })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.findUnique).toHaveBeenCalledTimes(1)
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.wattroPushHeld' }))
  })

  it('does nothing while the switch is off', async () => {
    h.enabled = false
    expect(await pushImportedProjects([{ id: 'p1', change: 'status', linked: false }], 'trello')).toEqual({ sent: 0, held: 0 })
    expect(h.findUnique).not.toHaveBeenCalled()
  })
})

describe('catching up', () => {
  it('tries an older project again where a push of it failed lately, and never the stock from before', async () => {
    h.failed.mockResolvedValue([{ entityId: 'old1' }])
    h.findMany.mockResolvedValue([{ id: 'old1' }])
    h.findUnique.mockResolvedValue(row({ id: 'old1', status: 'IN_PROGRESS' }))
    expect(await pushPendingProjects()).toBe(1)

    expect(h.failed).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: 'project.wattroPushFailed' }) }))
    const where = h.findMany.mock.calls[0][0].where
    // New since the switch, or failed lately — and in both cases only what Wattro lacks.
    expect(where.OR).toEqual([{ createdAt: { gte: new Date('2026-10-19T08:00:00.000Z') } }, { id: { in: ['old1'] } }])
    expect(where.links).toEqual({ none: { system: 'wattro' } })
    expect(where.archivedAt).toBeNull()
    expect(h.create).toHaveBeenCalledTimes(1)
  })

  it('stops for this round when Wattro does not answer', async () => {
    h.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    h.findUnique.mockResolvedValue(row({ status: 'IN_PROGRESS' }))
    h.fetchByNumber.mockRejectedValue(new WattroApiError('network', 'down'))
    expect(await pushPendingProjects()).toBe(0)
    expect(h.fetchByNumber).toHaveBeenCalledTimes(1)
  })
})
