import { describe, expect, it } from 'vitest'
import { PROJECT_SECTIONS, savedSections } from '@/lib/project-sections'

describe('the cards a project save writes', () => {
  it('writes every card when the form names none — the add and edit pages', () => {
    expect([...savedSections(null)]).toEqual([...PROJECT_SECTIONS])
  })

  it('writes only the cards the form names', () => {
    expect([...savedSections('description')]).toEqual(['description'])
    expect([...savedSections('planning,basic')]).toEqual(['basic', 'planning'])
  })

  it('writes nothing when the form names no open card, and ignores names it does not know', () => {
    expect(savedSections('').size).toBe(0)
    expect([...savedSections('price,assignment,basic;drop')]).toEqual(['assignment'])
  })
})
