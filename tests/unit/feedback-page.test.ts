import { describe, expect, it } from 'vitest'
import { describeEnvironment, deviceClass, planViewportCapture, screenshotTarget, selectorFor } from '@/lib/feedback-page'

describe('describeEnvironment', () => {
  it('names the specific browser before the Chrome and Safari it pretends to be', () => {
    const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68'
    expect(describeEnvironment(edge)).toEqual({ browser: 'Edge 130', os: 'Windows' })
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    expect(describeEnvironment(safari)).toEqual({ browser: 'Safari 18', os: 'iOS' })
    expect(describeEnvironment('')).toEqual({ browser: 'Unknown browser', os: 'Unknown OS' })
  })

  it('prefers the client hints and finds the iPad behind the Mac', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    expect(describeEnvironment(mac, { touchPoints: 5 }).os).toBe('iPadOS')
    expect(describeEnvironment(mac, { brands: [{ brand: 'Google Chrome', version: '131.0.1' }] }).browser).toBe('Chrome 131')
  })

  it('tells phones, tablets and desktops apart roughly', () => {
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148')).toBe('Mobile')
    expect(deviceClass('Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit Safari')).toBe('Tablet')
    expect(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('Tablet')
    expect(deviceClass('Mozilla/5.0 (Windows NT 10.0)')).toBe('Desktop')
  })
})

describe('screenshotTarget', () => {
  const viewport = { width: 1000, height: 500 }

  it('marks the click and the element as shares of the viewport', () => {
    expect(screenshotTarget({ left: 100, top: 50, width: 200, height: 100 }, { x: 0.5, y: 0.5 }, viewport)).toEqual({
      point: { x: 0.2, y: 0.2 },
      bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      viewport,
    })
  })

  it('clips an element hanging out of the viewport', () => {
    const t = screenshotTarget({ left: -100, top: 400, width: 300, height: 200 }, { x: 0.5, y: 0.25 }, viewport)
    expect(t?.bounds).toEqual({ x: 0, y: 0.8, width: 0.2, height: 0.2 })
  })

  it('invents no marker for a click outside the viewport', () => {
    expect(screenshotTarget({ left: 0, top: 900, width: 10, height: 10 }, { x: 0, y: 0 }, viewport)).toBeNull()
    expect(screenshotTarget(null, { x: 0, y: 0 }, viewport)).toBeNull()
    expect(screenshotTarget({ left: 0, top: 0, width: 0, height: 10 }, { x: 0, y: 0 }, viewport)).toBeNull()
  })
})

type FakeNode = {
  name: string
  box: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  parentElement: FakeNode | null
  children: FakeNode[]
  display?: string
  nodeType: number
  getBoundingClientRect(): FakeNode['box']
  querySelectorAll(selector: string): FakeNode[]
}

function node(name: string, top: number, parent: FakeNode | null, display = 'block'): FakeNode {
  const n: FakeNode = {
    name,
    box: { left: 0, right: 100, top, bottom: top + 50, width: 100, height: 50 },
    parentElement: parent,
    children: [],
    display,
    nodeType: 1,
    getBoundingClientRect: () => n.box,
    querySelectorAll: () => {
      const all: FakeNode[] = []
      const walk = (x: FakeNode) => x.children.forEach((c) => (all.push(c), walk(c)))
      walk(n)
      return all
    },
  }
  parent?.children.push(n)
  return n
}

describe('planViewportCapture', () => {
  it('clones what is in view in full and keeps only the boxes of what is not', () => {
    const root = node('html', 0, null)
    const visible = node('visible', 10, root)
    const deep = node('deep', 20, visible)
    const far = node('far', 5000, root)
    const farChild = node('farChild', 5010, far)
    const inline = node('inline', 6000, root, 'inline')
    const inlineChild = node('inlineChild', 6000, inline)
    const all = [visible, deep, far, farChild, inline, inlineChild]
    const plan = planViewportCapture(all, root, { width: 1000, height: 800 }, (n) => n.display ?? 'block')
    expect(plan.visible.has(visible)).toBe(true)
    expect(plan.visible.has(far)).toBe(false)
    expect(plan.include(deep)).toBe(true)
    expect(plan.include(far)).toBe(true) // its empty box holds the layout
    expect(plan.include(farChild)).toBe(false)
    expect(plan.include(inlineChild)).toBe(true) // an inline box keeps its content
    expect(plan.include({ nodeType: 3, parentElement: visible })).toBe(true)
    expect(plan.include({ nodeType: 3, parentElement: far })).toBe(false)
  })
})

describe('selectorFor', () => {
  it('walks down from the nearest stable id by tag and position', () => {
    const body = { tagName: 'BODY', parentElement: null, children: [] as never[] } as unknown as Parameters<typeof selectorFor>[0]
    const main = { id: 'content', tagName: 'MAIN', parentElement: body, children: [] as unknown[] }
    const first = { tagName: 'BUTTON', parentElement: main }
    const second = { tagName: 'BUTTON', parentElement: main }
    const span = { tagName: 'SPAN', parentElement: second, children: [] as unknown[] }
    main.children.push(first, second)
    ;(second as { children?: unknown[] }).children = [span]
    expect(selectorFor(span as never, body)).toBe('#content > button:nth-of-type(2) > span:nth-of-type(1)')
  })

  it('ignores the ids React makes up', () => {
    const body = { tagName: 'BODY', parentElement: null }
    const div = { id: '«r3»', tagName: 'DIV', parentElement: body, children: [] as unknown[] }
    ;(body as { children?: unknown[] }).children = [div]
    expect(selectorFor(div as never, body as never)).toBe('div:nth-of-type(1)')
  })
})
