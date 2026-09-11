import { describe, expect, it } from 'vitest'
import { lockPageScroll } from '@/lib/scroll-lock'

/** A root element with just enough of a style declaration to lock. */
function fakeRoot(initial: { overflow?: string; gutter?: string } = {}) {
  const props = new Map<string, string>()
  if (initial.gutter) props.set('scrollbar-gutter', initial.gutter)
  const style = {
    overflow: initial.overflow ?? '',
    getPropertyValue: (p: string) => props.get(p) ?? '',
    setProperty: (p: string, v: string) => {
      props.set(p, v)
    },
    removeProperty: (p: string) => {
      const v = props.get(p) ?? ''
      props.delete(p)
      return v
    },
  }
  return { style, gutter: () => props.get('scrollbar-gutter') }
}

describe('lockPageScroll', () => {
  it('stops the root, not body, and keeps the scrollbar room', () => {
    const root = fakeRoot()
    const unlock = lockPageScroll(root)
    expect(root.style.overflow).toBe('hidden')
    expect(root.gutter()).toBe('stable')
    unlock()
  })

  it('gives the root back exactly what it had', () => {
    const root = fakeRoot()
    lockPageScroll(root)()
    expect(root.style.overflow).toBe('')
    expect(root.gutter()).toBeUndefined()

    const styled = fakeRoot({ overflow: 'auto', gutter: 'auto' })
    lockPageScroll(styled)()
    expect(styled.style.overflow).toBe('auto')
    expect(styled.gutter()).toBe('auto')
  })

  it('stays locked until the last holder lets go', () => {
    const root = fakeRoot()
    const drawer = lockPageScroll(root)
    const dialog = lockPageScroll(root)
    drawer()
    expect(root.style.overflow).toBe('hidden')
    dialog()
    expect(root.style.overflow).toBe('')
  })

  it('does not let go of somebody else’s lock when one is released twice', () => {
    const root = fakeRoot()
    const first = lockPageScroll(root)
    const second = lockPageScroll(root)
    first()
    first()
    expect(root.style.overflow).toBe('hidden')
    second()
    expect(root.style.overflow).toBe('')
  })
})
