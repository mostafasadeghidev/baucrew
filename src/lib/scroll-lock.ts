/**
 * Keeping the page still behind a dialog.
 *
 * Every modal here used to lock scrolling with `overflow: hidden` on <body>.
 * That only works while <html> leaves overflow alone, because then the root
 * hands body's overflow on to the window. Since the root keeps its scrollbar
 * permanently (`overflow-y: scroll` in globals.css), body's `hidden` no longer
 * reaches the window: body becomes a scroll box of its own, and every sticky
 * element on the page — the page bar, the sidebar — starts sticking to body
 * instead of the window. Body does not scroll, so the moment a dialog opened
 * they scrolled away with the rest of the page.
 *
 * So the lock goes on the root. `overflow: hidden` there stops the window
 * itself, and sticky elements keep the window as the thing they stick to. The
 * scrollbar goes while the dialog is open, but `scrollbar-gutter: stable` keeps
 * its room, so nothing behind the dialog moves sideways.
 *
 * Locks nest. The phone's sidebar drawer and a dialog can both hold one; the
 * page is let go only when the last holder lets go, and gets back exactly the
 * inline styles it had before the first.
 *
 * No DOM import — the root is passed in (the document's by default), so the
 * rules above are testable without a browser.
 */

type StyleLike = {
  overflow: string
  getPropertyValue(property: string): string
  setProperty(property: string, value: string): void
  removeProperty(property: string): string
}

type Root = { style: StyleLike }

const GUTTER = 'scrollbar-gutter'

let holders = 0
let saved: { overflow: string; gutter: string } | null = null

/** Locks the page; returns the function that lets go of this one lock. */
export function lockPageScroll(root: Root = document.documentElement): () => void {
  if (holders === 0) {
    saved = { overflow: root.style.overflow, gutter: root.style.getPropertyValue(GUTTER) }
    root.style.overflow = 'hidden'
    root.style.setProperty(GUTTER, 'stable')
  }
  holders += 1

  let released = false
  return () => {
    // Letting go twice must not let go of somebody else's lock.
    if (released) return
    released = true
    holders -= 1
    if (holders > 0 || !saved) return
    root.style.overflow = saved.overflow
    if (saved.gutter) root.style.setProperty(GUTTER, saved.gutter)
    else root.style.removeProperty(GUTTER)
    saved = null
  }
}
