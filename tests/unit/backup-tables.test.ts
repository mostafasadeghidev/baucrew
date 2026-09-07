import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, NOT_BACKED_UP, delegateName } from '@/lib/backup-tables'

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1])

describe('the backup', () => {
  it('covers every table the app has, except the ones left out on purpose', () => {
    const covered = new Set(BACKUP_TABLES.map((t) => t.model))
    const missing = models.filter((m) => !covered.has(m) && !NOT_BACKED_UP.includes(m))
    expect(missing).toEqual([])
  })

  it('names only tables that exist', () => {
    const unknown = BACKUP_TABLES.filter((t) => !models.includes(t.model)).map((t) => t.model)
    expect(unknown).toEqual([])
    expect(new Set(BACKUP_TABLES.map((t) => t.key)).size).toBe(BACKUP_TABLES.length)
  })

  it('lists parents before children', () => {
    const order = new Map(BACKUP_TABLES.map((t, i) => [t.model, i]))
    // Every `@relation(fields: [..], references: [..])` points at a parent.
    for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      if (!order.has(model)) continue
      for (const [, parent] of body.matchAll(/^\s+\w+\s+(\w+)\??\s+@relation\(/gm)) {
        if (!order.has(parent)) continue
        expect(order.get(parent)!, `${parent} must come before ${model}`).toBeLessThan(order.get(model)!)
      }
    }
  })

  it('knows how the client calls a model', () => {
    expect(delegateName('ApiKey')).toBe('apiKey')
    expect(delegateName('User')).toBe('user')
  })
})
