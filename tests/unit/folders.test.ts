import { describe, expect, it } from 'vitest'
import {
  FOLDER_NAME_MAX,
  canChangeFolder,
  childrenOf,
  cleanFolderName,
  depthOf,
  flattenTree,
  folderCounts,
  folderPath,
  isFolderItem,
  nameTaken,
  parentsFirst,
  planFolderDelete,
  subtreeIds,
} from '@/lib/folders'

// Pläne / Statik / alt, Fotos, Angebote — invented, like a project's tree.
const tree = [
  { id: 'plaene', parentId: null, name: 'Pläne' },
  { id: 'statik', parentId: 'plaene', name: 'Statik' },
  { id: 'alt', parentId: 'statik', name: 'alt' },
  { id: 'fotos', parentId: null, name: 'Fotos' },
  { id: 'angebote', parentId: null, name: 'Angebote' },
]

describe('folder names', () => {
  it('keeps one trimmed line without path signs', () => {
    expect(cleanFolderName('  Pläne  ')).toBe('Pläne')
    expect(cleanFolderName('Fotos\nvorher')).toBe('Fotos vorher')
    expect(cleanFolderName('Statik/alt')).toBe('Statik-alt')
    expect(cleanFolderName('   ')).toBeNull()
    expect(cleanFolderName(7)).toBeNull()
    expect(cleanFolderName('x'.repeat(200))).toHaveLength(FOLDER_NAME_MAX)
  })

  it('finds a name taken by a sibling, whatever its capitals', () => {
    expect(nameTaken(tree, null, 'pläne')).toBe(true)
    expect(nameTaken(tree, 'plaene', 'Pläne')).toBe(false)
    expect(nameTaken(tree, 'plaene', 'STATIK')).toBe(true)
    // Renaming a folder to its own name in other capitals is no clash.
    expect(nameTaken(tree, null, 'FOTOS', 'fotos')).toBe(false)
  })
})

describe('the tree', () => {
  it('lists a folder’s children by name', () => {
    expect(childrenOf(tree, null).map((f) => f.name)).toEqual(['Angebote', 'Fotos', 'Pläne'])
    expect(childrenOf(tree, 'plaene').map((f) => f.id)).toEqual(['statik'])
  })

  it('walks the path down to a folder', () => {
    expect(folderPath(tree, 'alt').map((f) => f.name)).toEqual(['Pläne', 'Statik', 'alt'])
    expect(folderPath(tree, null)).toEqual([])
    expect(folderPath(tree, 'gone')).toEqual([])
    expect(depthOf(tree, 'alt')).toBe(3)
    expect(depthOf(tree, null)).toBe(0)
  })

  it('survives a loop it should never meet', () => {
    const loop = [
      { id: 'a', parentId: 'b', name: 'A' },
      { id: 'b', parentId: 'a', name: 'B' },
    ]
    expect(folderPath(loop, 'a').map((f) => f.id)).toEqual(['a', 'b'].reverse())
    expect(parentsFirst(loop)).toHaveLength(2)
  })

  it('finds every folder inside one', () => {
    expect([...subtreeIds(tree, 'plaene')].sort()).toEqual(['alt', 'plaene', 'statik'])
    expect([...subtreeIds(tree, 'fotos')]).toEqual(['fotos'])
  })

  it('counts what a folder holds, its subfolders included', () => {
    const counts = folderCounts(tree, ['alt', 'statik', 'plaene', 'fotos', 'fotos', null, null])
    expect(counts.get('plaene')).toBe(3)
    expect(counts.get('statik')).toBe(2)
    expect(counts.get('alt')).toBe(1)
    expect(counts.get('fotos')).toBe(2)
    expect(counts.get('angebote')).toBe(0)
  })

  it('flattens the tree for the move list, each folder under its parent', () => {
    expect(flattenTree(tree).map((f) => `${f.depth}:${f.name}`)).toEqual(['0:Angebote', '0:Fotos', '0:Pläne', '1:Statik', '2:alt'])
  })

  it('puts parents before children for a restore', () => {
    const shuffled = [tree[2], tree[1], tree[4], tree[0], tree[3]]
    const order = parentsFirst(shuffled).map((f) => f.id)
    expect(order.indexOf('plaene')).toBeLessThan(order.indexOf('statik'))
    expect(order.indexOf('statik')).toBeLessThan(order.indexOf('alt'))
    expect(order).toHaveLength(5)
  })
})

describe('deleting a folder', () => {
  it('moves what it holds one level up', () => {
    expect(planFolderDelete(tree, 'statik')).toEqual({ target: 'plaene', renames: [] })
    expect(planFolderDelete(tree, 'plaene')).toEqual({ target: null, renames: [] })
    expect(planFolderDelete(tree, 'nope')).toBeNull()
  })

  it('numbers a subfolder whose name is taken where it lands', () => {
    const clash = [...tree, { id: 'fotos2', parentId: 'plaene', name: 'Fotos' }]
    expect(planFolderDelete(clash, 'plaene')).toEqual({ target: null, renames: [{ id: 'fotos2', name: 'Fotos (2)' }] })
  })
})

describe('who may change a folder', () => {
  it('lets the office change any and everybody else their own', () => {
    expect(canChangeFolder({ id: 'a', role: 'ADMIN' }, { createdById: 'c' })).toBe(true)
    expect(canChangeFolder({ id: 'm', role: 'MANAGER' }, { createdById: null })).toBe(true)
    expect(canChangeFolder({ id: 'c', role: 'EMPLOYEE' }, { createdById: 'c' })).toBe(true)
    expect(canChangeFolder({ id: 'c', role: 'EMPLOYEE' }, { createdById: 'm' })).toBe(false)
    expect(canChangeFolder({ id: 's', role: 'SITE_MANAGER' }, { createdById: 'm' })).toBe(false)
    expect(canChangeFolder({ id: 's', role: 'SITE_MANAGER' }, { createdById: null })).toBe(false)
  })
})

describe('moved things', () => {
  it('knows a file or an entry and nothing else', () => {
    expect(isFolderItem({ kind: 'document', id: 'abc' })).toBe(true)
    expect(isFolderItem({ kind: 'entry', id: 'abc' })).toBe(true)
    expect(isFolderItem({ kind: 'project', id: 'abc' })).toBe(false)
    expect(isFolderItem({ kind: 'entry', id: '' })).toBe(false)
    expect(isFolderItem(null)).toBe(false)
  })
})
