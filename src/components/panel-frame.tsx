/**
 * The edge of the main panel on a desktop: the same eight pixels of canvas,
 * the same border and the same rounded corners the sidebar stands in, so the
 * rail and the page read as two panels of one set.
 *
 * The page still scrolls the window — every sticky bar, the scroll lock and
 * the board's wheel handling depend on that — so the panel cannot be a box
 * with its own scrollbar. Instead this frame is held over the content: a
 * rounded, bordered window whose outside is painted with the canvas (the
 * spread of its shadow), so whatever scrolls past the panel's edge disappears
 * behind the canvas instead of running to the edge of the screen. It takes no
 * room (the negative margin gives its height back) and no clicks.
 *
 * `z-[45]` sits over the page's sticky bars (z-20) and under everything that
 * floats: dialogs, sheets, menus and tooltips all stand at z-50 and above.
 */
export function PanelFrame() {
  return (
    <div
      aria-hidden
      className="pointer-events-none sticky top-0 z-[45] -mb-[100vh] hidden h-screen shrink-0 overflow-hidden md:block print:hidden"
    >
      <div className="absolute inset-y-2 left-0 right-2 rounded-xl border border-border shadow-[0_0_0_100vmax_var(--background)]" />
    </div>
  )
}
