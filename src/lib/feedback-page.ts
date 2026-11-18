// What comment mode works out about the page it runs on — pure, so it is
// tested without a browser. The element types are structural: a test hands in
// plain objects, the browser its own elements.

/** Readable browser and system, from the user agent and the client hints. */
export function describeEnvironment(
  userAgent = '',
  hints: { brands?: { brand: string; version?: string }[]; platform?: string; touchPoints?: number } = {}
): { browser: string; os: string } {
  const brands = Array.isArray(hints.brands) ? hints.brands : []
  const known = ['Microsoft Edge', 'Opera', 'Brave', 'Google Chrome']
  const brand = known.map((name) => brands.find((b) => b.brand === name)).find(Boolean)
  // The specific browsers first: they all carry Chrome's and Safari's tokens too.
  const patterns: [string, RegExp][] = [
    ['Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]
  let browser = 'Unknown browser'
  for (const [name, pattern] of patterns) {
    const match = userAgent.match(pattern)
    if (match) {
      browser = `${name} ${match[1].split('.')[0]}`
      break
    }
  }
  if (brand) browser = `${brand.brand.replace('Google ', '').replace('Microsoft ', '')} ${String(brand.version ?? '').split('.')[0]}`.trim()
  let os = /iPad|iPhone|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(userAgent)
          ? 'macOS'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'Unknown OS'
  // An iPad asks for the desktop site and says it is a Mac; only its touch gives it away.
  if (os === 'macOS' && (hints.touchPoints ?? 0) > 1) os = 'iPadOS'
  return { browser, os }
}

/** Phone, tablet or desktop — approximate, from the same signals. */
export function deviceClass(userAgent = '', touchPoints = 0): 'Mobile' | 'Tablet' | 'Desktop' {
  if (/iPad|Tablet/i.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'Tablet'
  if (/Mobi|Android/i.test(userAgent)) return /Mobi/i.test(userAgent) ? 'Mobile' : 'Tablet'
  return 'Desktop'
}

type Rect = { left: number; top: number; width: number; height: number }
type Size = { width: number; height: number }

export type ScreenshotTarget = {
  /** The click, as a share of the viewport (0–1). */
  point: { x: number; y: number }
  /** The element's box inside the viewport, as shares (0–1). */
  bounds: { x: number; y: number; width: number; height: number }
  viewport: Size
}

/**
 * Where the picked element and the click land in a viewport screenshot. Null
 * when the click point is outside the viewport: then there is nothing to mark,
 * and no marker is invented.
 */
export function screenshotTarget(rect: Rect | null, anchor: { x: number; y: number } | null, viewport: Size | null): ScreenshotTarget | null {
  if (!rect || !anchor || !viewport || viewport.width <= 0 || viewport.height <= 0 || rect.width <= 0 || rect.height <= 0)
    return null
  const x = rect.left + rect.width * anchor.x
  const y = rect.top + rect.height * anchor.y
  if (![x, y, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null
  if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) return null
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  const right = Math.min(viewport.width, rect.left + rect.width)
  const bottom = Math.min(viewport.height, rect.top + rect.height)
  return {
    point: { x: x / viewport.width, y: y / viewport.height },
    bounds: {
      x: left / viewport.width,
      y: top / viewport.height,
      width: (right - left) / viewport.width,
      height: (bottom - top) / viewport.height,
    },
    viewport: { width: viewport.width, height: viewport.height },
  }
}

type PlanNode = {
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number }
  parentElement: PlanNode | null
  querySelectorAll(selector: string): Iterable<PlanNode>
  nodeType?: number
}

/**
 * Which elements a viewport screenshot has to clone. What is in view, and
 * every parent of it, in full; whatever is off screen only as its empty box —
 * removing it would shift everything below it. Inline boxes keep their
 * content, their width depends on it.
 */
export function planViewportCapture<N extends PlanNode>(
  elements: N[],
  root: N,
  viewport: Size,
  getDisplay: (node: N) => string = () => 'block'
) {
  const kept = new Set<PlanNode>([root])
  const visible = new Set<N>()
  const buffer = 48
  for (const node of elements) {
    const box = node.getBoundingClientRect()
    if (
      box.width > 0 &&
      box.height > 0 &&
      box.right >= -buffer &&
      box.left <= viewport.width + buffer &&
      box.bottom >= -buffer &&
      box.top <= viewport.height + buffer
    ) {
      visible.add(node)
      // A fixed or sticky child can be in view outside its parent's box.
      for (let parent: PlanNode | null = node; parent && !kept.has(parent); parent = parent.parentElement) kept.add(parent)
    }
  }
  for (const node of elements) {
    if (!kept.has(node) && node.parentElement && kept.has(node.parentElement)) {
      const display = getDisplay(node)
      if (display.startsWith('inline') || display === 'contents') {
        kept.add(node)
        for (const child of node.querySelectorAll('*')) kept.add(child)
      }
    }
  }
  const boxes = new Set<PlanNode>(elements.filter((n) => !kept.has(n) && n.parentElement && kept.has(n.parentElement)))
  return {
    visible,
    retainedElements: kept.size + boxes.size,
    include: (node: { nodeType?: number; parentElement: PlanNode | null }) =>
      node.nodeType === 1
        ? kept.has(node as PlanNode) || boxes.has(node as PlanNode)
        : !!node.parentElement && kept.has(node.parentElement),
  }
}

type SelectorNode = {
  id?: string
  tagName: string
  parentElement: SelectorNode | null
  children?: ArrayLike<SelectorNode>
}

/**
 * A CSS selector that finds the element again: from the nearest id down, by
 * tag and position. `escape` is CSS.escape in the browser.
 */
export function selectorFor(element: SelectorNode, stopAt: SelectorNode | null, escape: (s: string) => string = (s) => s): string {
  const parts: string[] = []
  for (let node: SelectorNode | null = element; node && node !== stopAt; node = node.parentElement) {
    // Ids React makes up («r1») change from render to render: no anchor.
    if (node.id && !/[:«»]/.test(node.id)) {
      parts.unshift(`#${escape(node.id)}`)
      break
    }
    const siblings = node.parentElement?.children ? Array.from(node.parentElement.children) : [node]
    const same = siblings.filter((child) => child.tagName === node!.tagName)
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${same.indexOf(node) + 1})`)
  }
  return parts.join(' > ') || 'body'
}
