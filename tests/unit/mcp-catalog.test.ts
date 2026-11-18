import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: () => undefined }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => null }))

import {
  AGENT_FEEDBACK_STATUS,
  assistantToolNamesFor,
  FINANCIAL_KEYS,
  forbiddenInput,
  inputSchemaFor,
  isWriteTool,
  mayUse,
  outputFor,
  TOOL_NAMES,
  TOOL_SPECS,
  toolNamesFor,
  withoutFinancials,
} from '@/lib/mcp-catalog'
import { recordUrl } from '@/lib/record-url'

const admin = { role: 'ADMIN', canViewFinancials: false }
const manager = { role: 'MANAGER', canViewFinancials: false }
const managerWithMoney = { role: 'MANAGER', canViewFinancials: true }
const siteManager = { role: 'SITE_MANAGER', canViewFinancials: true }
const crew = { role: 'EMPLOYEE', canViewFinancials: true }

describe('who may use which tool', () => {
  it('gives the crew nothing at all, whatever flag their account carries', () => {
    expect(toolNamesFor(crew)).toEqual([])
    expect(mayUse(crew, 'staff')).toBe(false)
    expect(mayUse({ role: 'SOMETHING_NEW', canViewFinancials: true }, 'staff')).toBe(false)
  })

  it('keeps customers and money from a site manager, but not their projects or the schedule', () => {
    const names = toolNamesFor(siteManager)
    expect(names).toContain('list_projects')
    expect(names).toContain('update_project')
    expect(names).toContain('plan_assignment')
    expect(names).not.toContain('search_customers')
    expect(names).not.toContain('create_customer')
    expect(names).not.toContain('update_customer')
    // The financial flag only counts for a manager — a site manager never sees money.
    expect(names).not.toContain('revenue_by_month')
    expect(names).not.toContain('plan_gaps')
  })

  it("lets a site manager read and add to a job's needs, as on the card", () => {
    const names = toolNamesFor(siteManager)
    expect(names).toEqual(expect.arrayContaining(['list_catalog', 'get_project_needs', 'add_project_needs']))
  })

  it('gives a manager the master data, and the money only with the flag', () => {
    expect(toolNamesFor(manager)).toContain('update_customer')
    expect(toolNamesFor(manager)).not.toContain('revenue_by_month')
    expect(toolNamesFor(managerWithMoney)).toContain('revenue_by_month')
  })

  it('gives an admin every tool, money included', () => {
    expect(toolNamesFor(admin)).toEqual(TOOL_NAMES)
  })

  it('marks every tool that changes something as a write, so the assistant asks first', () => {
    const writes = TOOL_NAMES.filter(isWriteTool)
    expect(writes).toEqual(
      expect.arrayContaining([
        'create_project',
        'update_project',
        'set_project_status',
        'move_project_to_column',
        'add_comment',
        'add_defect',
        'set_defect_resolved',
        'create_customer',
        'update_customer',
        'plan_assignment',
        'move_schedule_entry',
        'update_schedule_entry',
        'cancel_schedule_entry',
        'add_project_needs',
      ])
    )
    for (const name of TOOL_NAMES) {
      const reads = name.startsWith('list_') || name.startsWith('get_') || name.startsWith('search_')
      if (reads) expect(isWriteTool(name), name).toBe(false)
    }
    expect(isWriteTool('no_such_tool')).toBe(false)
  })

  it('describes every tool with an object schema', () => {
    for (const name of TOOL_NAMES) {
      expect(TOOL_SPECS[name].description.length, name).toBeGreaterThan(10)
      expect(TOOL_SPECS[name].inputSchema.type, name).toBe('object')
    }
  })
})

describe('money in the input', () => {
  it('offers the price field only to somebody who may see money', () => {
    const without = inputSchemaFor('update_project', manager).properties as Record<string, unknown>
    const withMoney = inputSchemaFor('update_project', managerWithMoney).properties as Record<string, unknown>
    expect(without).not.toHaveProperty('price')
    expect(without).toHaveProperty('city')
    expect(withMoney).toHaveProperty('price')
    expect(inputSchemaFor('create_project', siteManager).properties).not.toHaveProperty('price')
  })

  it('names a price that was sent anyway, so the tool refuses it', () => {
    expect(forbiddenInput('update_project', manager, { project: 'x', price: 1000 })).toEqual(['price'])
    expect(forbiddenInput('update_project', manager, { project: 'x', city: 'Musterstadt' })).toEqual([])
    expect(forbiddenInput('update_project', managerWithMoney, { project: 'x', price: 1000 })).toEqual([])
  })
})

describe('money in the output', () => {
  const project = {
    id: 'p1',
    name: 'Musterhof Fassade',
    price: 12000,
    orderValue: 13500,
    invoices: [{ part: 1, amount: 6000 }],
    customer: { id: 'c1', name: 'Muster GmbH' },
    planLines: [{ month: 3, amount: 4000 }],
    schedule: [{ id: 'e1', date: '2026-11-02' }],
  }

  it('strips every money field however deep it sits', () => {
    const list = { items: [project], total: 1 }
    const clean = withoutFinancials(list)
    expect(clean.total).toBe(1)
    expect(clean.items[0]).toEqual({
      id: 'p1',
      name: 'Musterhof Fassade',
      customer: { id: 'c1', name: 'Muster GmbH' },
      schedule: [{ id: 'e1', date: '2026-11-02' }],
    })
    expect(JSON.stringify(clean)).not.toMatch(/12000|13500|6000|4000/)
  })

  it('leaves the output alone for somebody who may see money, and cleans it for everybody else', () => {
    expect(outputFor(managerWithMoney, project)).toBe(project)
    expect(outputFor(manager, project)).not.toHaveProperty('price')
    expect(outputFor(siteManager, project)).not.toHaveProperty('orderValue')
    // An admin always sees money, the flag or not.
    expect(outputFor(admin, project)).toBe(project)
  })

  it('does not take the paging total or plain values for money', () => {
    expect(FINANCIAL_KEYS.has('total')).toBe(false)
    expect(withoutFinancials('text')).toBe('text')
    expect(withoutFinancials(null)).toBeNull()
    expect(withoutFinancials([1, 2])).toEqual([1, 2])
  })
})

describe('the link under a change', () => {
  it("is the record's own page, its project's, or the project it names", () => {
    expect(recordUrl({ id: 'p1', url: '/projects/p1' })).toBe('/projects/p1')
    expect(recordUrl({ project: { url: '/projects/p2' } })).toBe('/projects/p2')
    expect(recordUrl({ projectId: 'p3', created: 2 })).toBe('/projects/p3')
    expect(recordUrl({ id: 'c1', url: '/customers/c1' })).toBe('/customers/c1')
  })

  it('is never an address outside the app', () => {
    expect(recordUrl({ url: 'https://example.com/x' })).toBeNull()
    expect(recordUrl({ url: '//example.com/x' })).toBeNull()
    expect(recordUrl({ url: 'javascript:alert(1)' })).toBeNull()
    expect(recordUrl({ projectId: '../../etc' })).toBeNull()
    expect(recordUrl(null)).toBeNull()
    expect(recordUrl('x')).toBeNull()
  })
})

describe('the feedback tools of a coding agent', () => {
  const feedbackTools = TOOL_NAMES.filter((name) => (TOOL_SPECS[name] as { group?: string }).group === 'feedback')

  it('are exactly what a feedback key is offered, and nothing else', () => {
    expect(feedbackTools).toEqual([
      'list_feedback',
      'get_feedback',
      'get_feedback_image',
      'add_feedback',
      'add_feedback_note',
      'record_feedback_proposal',
      'set_feedback_status',
    ])
    expect(toolNamesFor(admin, 'feedback')).toEqual(feedbackTools)
    expect(toolNamesFor(manager, 'feedback')).toEqual(feedbackTools)
    // A full key still has everything, the feedback tools among it.
    expect(toolNamesFor(admin)).toEqual(TOOL_NAMES)
  })

  it('leave the proposal and the status to the office, and give the crew nothing', () => {
    expect(toolNamesFor(siteManager, 'feedback')).toEqual(['list_feedback', 'get_feedback', 'get_feedback_image', 'add_feedback', 'add_feedback_note'])
    expect(toolNamesFor(crew, 'feedback')).toEqual([])
  })

  it('are not offered to the in-app assistant', () => {
    const names = assistantToolNamesFor(admin)
    for (const name of feedbackTools) expect(names).not.toContain(name)
    expect(names).toContain('list_projects')
  })

  it('never let an agent mark an item done or closed', () => {
    expect(AGENT_FEEDBACK_STATUS).not.toContain('DONE')
    expect(AGENT_FEEDBACK_STATUS).not.toContain('CLOSED')
    const schema = TOOL_SPECS.set_feedback_status.inputSchema as unknown as { properties: { status: { enum: string[] } } }
    expect(schema.properties.status.enum).toEqual([...AGENT_FEEDBACK_STATUS])
  })

  it('mark every change as a write', () => {
    expect(feedbackTools.filter(isWriteTool)).toEqual(['add_feedback', 'add_feedback_note', 'record_feedback_proposal', 'set_feedback_status'])
  })
})
