/**
 * Picking a thing up off the page and carrying it.
 *
 * Every board in this app moves something by dragging it — a project between
 * statuses, an assignment between days, a card on the dashboard — and each had
 * grown its own version of the gesture. The browser's own drag and drop was
 * doing the mouse half of it, which starts the moment the mouse moves, drags
 * the page's *text* along with it, and leaves the thing being dragged sitting
 * exactly where it was. So a drag looked like an accident: half the screen
 * highlighted blue, and nothing visibly in hand.
 *
 * What is carried is a copy of the element, taken out of the page's flow and
 * laid on top of it: full opacity, a real shadow under it, tipped a degree and
 * a half and a little larger, so it reads as a thing lifted rather than a
 * thing highlighted. The original stays behind at 40%, so where it falls back
 * to if it is let go is never in doubt.
 *
 * DOM in, DOM out — no React, so every board can use it, and the arithmetic
 * that has no DOM in it is testable on its own.
 */

/** How far a mouse travels before a press is a drag rather than a click. */
export const DRAG_THRESHOLD = 6

/** How long a finger rests on a thing before it picks it up. */
export const LONG_PRESS_MS = 250

/** How far a finger may stray in that time before it counts as scrolling. */
export const LONG_PRESS_SLOP = 10

/** The degree and a half of tilt that says "in hand" rather than "on the page". */
export const CARRY_TILT = 1.5

/** Where the carried copy sits, given how far the pointer has come. */
export function carryTransform(dx: number, dy: number, tilt = CARRY_TILT): string {
  return `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(1.03)`
}

/**
 * Lifts `el`: returns the copy that follows the pointer, and dims the original.
 *
 * `tilt` is the angle it is carried at — a tall column is carried flat, since
 * a tipped thing the height of the window pokes out of the window.
 */
export function lift(el: HTMLElement, tilt = CARRY_TILT): HTMLElement {
  // Whatever the browser managed to highlight before anyone knew this was a
  // drag: a thing carried across a page of blue text is not a thing carried.
  window.getSelection()?.removeAllRanges()

  const ghost = el.cloneNode(true) as HTMLElement
  const rect = el.getBoundingClientRect()
  ghost.setAttribute('aria-hidden', 'true')
  ghost.style.cssText = [
    'position:fixed',
    `left:${rect.left}px`,
    `top:${rect.top}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    'margin:0',
    'pointer-events:none',
    'user-select:none',
    'z-index:60',
    'will-change:transform',
    'box-shadow:0 16px 32px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.18)',
    `transform:${carryTransform(0, 0, tilt)}`,
  ].join(';')
  document.body.appendChild(ghost)
  el.style.opacity = '0.4'
  return ghost
}

/** Moves the carried copy to where the pointer has got to. */
export function carry(ghost: HTMLElement | null, dx: number, dy: number, tilt = CARRY_TILT) {
  if (ghost) ghost.style.transform = carryTransform(dx, dy, tilt)
}

/** Puts everything back: the copy goes, the original is itself again. */
export function drop(ghost: HTMLElement | null, el?: HTMLElement | null) {
  ghost?.remove()
  if (el) el.style.opacity = ''
}

/**
 * Keeps a finger's drag a drag. A thing is picked up by a finger resting on
 * it, and it is marked `touch-action: pan-x pan-y` so that a finger which does
 * not rest still scrolls the board. But once the thing is in hand the browser
 * cannot tell the finger's next move from a scroll either: it starts one,
 * cancels the pointer, and the thing falls back where it was — picked up on a
 * phone, and never carried anywhere. A touchmove listener that is not passive
 * turns that scroll down while `carrying()` says something is in hand; it is
 * there from the start, since Safari takes no notice of one added while the
 * finger is already down. The long press's own menu (a link's preview) is
 * turned down the same way.
 *
 * Returns the function that takes the listeners off again.
 */
export function holdTouchDrag(carrying: () => boolean, target: EventTarget = window): () => void {
  const onTouchMove = (e: Event) => {
    if (e.cancelable && carrying()) e.preventDefault()
  }
  const onMenu = (e: Event) => {
    if (carrying()) e.preventDefault()
  }
  target.addEventListener('touchmove', onTouchMove, { passive: false })
  target.addEventListener('contextmenu', onMenu)
  return () => {
    target.removeEventListener('touchmove', onTouchMove)
    target.removeEventListener('contextmenu', onMenu)
  }
}

/** The element of `selector` under a point, and the id it carries. */
export function zoneAtPoint(x: number, y: number, selector: string, dataKey: string): string | null {
  const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>(selector)
  return zone?.dataset[dataKey] ?? null
}
