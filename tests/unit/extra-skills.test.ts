import { describe, expect, it } from 'vitest'
import {
  addExtraSkill,
  cleanSkill,
  mergeSkills,
  parseExtraSkills,
  serializeExtraSkills,
} from '@/lib/extra-skills'

describe('cleanSkill', () => {
  it('trims and squeezes the spaces out of the middle', () => {
    expect(cleanSkill('  Fassade   streichen ')).toBe('Fassade streichen')
  })

  it('cuts an essay down to a skill', () => {
    expect(cleanSkill('x'.repeat(200))).toHaveLength(100)
  })
})

describe('parseExtraSkills', () => {
  it('reads nothing out of nothing', () => {
    expect(parseExtraSkills(null)).toEqual([])
    expect(parseExtraSkills('')).toEqual([])
    expect(parseExtraSkills('not json')).toEqual([])
    expect(parseExtraSkills('{"a":1}')).toEqual([])
  })

  it('keeps the names and drops anything that is not one', () => {
    expect(parseExtraSkills('["Gerüst", 7, null, "  Putz  "]')).toEqual(['Gerüst', 'Putz'])
  })

  it('treats two spellings that differ only in case as one, first one wins', () => {
    expect(parseExtraSkills('["Putz", "putz", "PUTZ"]')).toEqual(['Putz'])
  })

  it('survives a round trip', () => {
    expect(parseExtraSkills(serializeExtraSkills(['Gerüst', 'Putz']))).toEqual(['Gerüst', 'Putz'])
  })
})

describe('mergeSkills', () => {
  it('puts the ones nobody has yet in at a count of nothing', () => {
    expect(mergeSkills([{ name: 'Putz', count: 3 }], ['Gerüst'])).toEqual([
      { name: 'Gerüst', count: 0 },
      { name: 'Putz', count: 3 },
    ])
  })

  it('does not list a skill twice once somebody has it', () => {
    expect(mergeSkills([{ name: 'Putz', count: 1 }], ['putz'])).toEqual([{ name: 'Putz', count: 1 }])
  })

  it('sorts them the way a German list is sorted', () => {
    const out = mergeSkills([{ name: 'Übergang', count: 1 }], ['Anstrich', 'Zaun'])
    expect(out.map((s) => s.name)).toEqual(['Anstrich', 'Übergang', 'Zaun'])
  })
})

describe('addExtraSkill', () => {
  it('adds one', () => {
    expect(addExtraSkill(['Putz'], [], 'Gerüst').names).toEqual(['Putz', 'Gerüst'])
  })

  it('refuses an empty name', () => {
    expect(addExtraSkill([], [], '   ').error).toBe('nameRequired')
  })

  it('refuses one that is already written down', () => {
    expect(addExtraSkill(['Putz'], [], 'putz').error).toBe('skillExists')
  })

  it('refuses one that somebody already has', () => {
    expect(addExtraSkill([], ['Putz'], 'PUTZ').error).toBe('skillExists')
  })

  it('cleans the name before it stores it', () => {
    expect(addExtraSkill([], [], '  Neue   Fähigkeit ').names).toEqual(['Neue Fähigkeit'])
  })
})
