# CHANGE: UI overhaul — one inset panel, flat surfaces, tabs in the head

## What changed

The admin area follows Untitled UI's application shell: a quiet grey canvas
with two white panels on it, the sidebar and the page, both with the same
8px of canvas around them, the same border and the same rounded corners.
Nothing lying on the page casts a shadow any more; only what floats
(menus, popovers, dialogs, toasts) does.

1. **The page is a panel.** `main` is white; `PanelFrame` holds a rounded,
   bordered frame over it whose outside is painted in the canvas colour, so
   the page scrolls *inside* the panel while the window keeps scrolling (every
   sticky bar, the scroll lock and the board's wheel handling depend on window
   scrolling — none of that changed).
2. **One head per page, one row.** `StickyHead` is the panel's head, edge to
   edge, 56px, with one rule under it. The page bar lost its box. `PageBar`
   takes `tabs`: the page's name, a hairline, its tabs, and the actions on
   the right — all in one line (Auswertungen, Einstellungen, Einsatzplanung,
   Projekte). Only a screen too narrow for it wraps it.
3. **Pill tabs.** `TabsList`/`TabLink` are quiet pills in the manner of
   Framer, Webflow and Trello: plain text, a soft grey pill behind the one you
   are on, no track, no border, no underline. The board tabs and the
   board/list switch use the same pills (`projectControl.boardTab*`,
   `view*`).
4. **Einsatzplanung.** Woche/Monat/Karte moved from the sheet into the head
   row (`ScheduleHeader` takes `nav`); `ScheduleControls` is one row; the sheet's
   frame is gone, the day columns stand on the panel.
5. **Projects board.** No coloured or photo ground behind the lists. A
   board's colour (or photo) is now a swatch in its tab. The head reads like
   every other page's, on one row: the name, the boards as pills, the
   board/list switch, and the actions on the right. Lists are grey wells, cards white with a
   hairline (no Trello shadow). The `onGround` prop of `ProjectsKanban` is
   gone. The board settings still store the background; it drives the swatch.
6. **Tokens.** `globals.css` uses Untitled UI's grey scale; a new
   `--border-strong` (`border-border-strong`) frames controls (buttons,
   inputs, selects). Buttons and selects have fixed heights (36px, small
   32px, extra small 28px) so a head's controls line up; "Drucken / PDF" is
   an outline button now. The font is Inter (was Geist). The default accent is
   unchanged — the company colour from Settings still overrides it.
7. **Sweeps across the code base** (mechanical, one class each):
   `shadow-sm` removed everywhere; `uppercase tracking-wide` removed from
   labels and table heads (sentence case); form inputs white with
   `border-border-strong` and `rounded-lg` instead of the canvas grey;
   segmented "selected" pills use a ring instead of a shadow.

8. **Auswertungen, second pass.** The paragraph under the head that said
   what a tab answers is behind an "i" beside the tabs; the chart card's
   click hint joined its "i" too, so its title is one line. The year plan in
   the monthly chart is a solid ink target mark ringed in white (was a dashed
   line) and its legend reads "Jahresplanung (Ziel)". The months' order on
   Planumsatz is one toggle button (`month-order-toggle.tsx`, 0→1 / 1→0)
   instead of a two-item select; the grid/lanes switch uses the pill look.
   "Planumsatz nach Stand" stays: it is not the comparison chart's data but
   the same months split by how certain the money is.
9. **Board tabs.** The pending line that flashed under a board tab while the
   next board loaded is gone (`project-nav-link.tsx`); the screen-reader
   status stays.

## Files

Structural: `src/app/globals.css`, `src/app/layout.tsx`,
`src/app/(admin)/layout.tsx`, `src/components/panel-frame.tsx` (new),
`src/components/ui/page-panel.tsx`, `src/components/ui/tabs.tsx`,
`src/components/ui/button.tsx`, `src/components/ui/card.tsx`,
`src/components/ui/select.tsx`, `src/components/sidebar.tsx`,
`src/app/(admin)/reports/page.tsx`, `src/app/(admin)/settings/page.tsx`,
`src/app/(admin)/schedule/schedule-header.tsx`, `schedule-board.tsx`,
`month-board.tsx`, `map/page.tsx`, `src/app/(admin)/projects/page.tsx`,
`projects-toolbar.tsx`, `board-tabs.tsx`, `toolbar-styles.ts`,
`board-card.ts`, `kanban.tsx`, `card-templates.tsx`,
`src/components/print-button.tsx`, `src/components/revenue-chart.tsx`,
`src/components/revenue-layout-picker.tsx`, `src/components/live-search.tsx`
(`useParamUpdater` exported), `src/app/(admin)/reports/month-order-toggle.tsx`
(new), `src/app/(admin)/projects/project-nav-link.tsx`, `messages/*.json`
(`legendPlan`).

The sweeps in point 7 touched class strings in about a hundred further files
under `src/` — no logic.

## Rollback

Before the overhaul the working tree was saved, uncommitted work included,
as the local branch `snapshot/pre-ui-overhaul` (never pushed). The overhaul's
own changes are exactly `git diff snapshot/pre-ui-overhaul -- src docs messages AGENTS.md`
(untracked files show up in that diff as deleted; they are not).

To undo it completely, restore every file the overhaul touched from the
snapshot and delete the one file it added:

```bash
git diff --name-only snapshot/pre-ui-overhaul -- src docs messages AGENTS.md | while read f; do git cat-file -e "snapshot/pre-ui-overhaul:$f" 2>/dev/null && git show "snapshot/pre-ui-overhaul:$f" > "$f"; done
rm src/components/panel-frame.tsx "src/app/(admin)/reports/month-order-toggle.tsx" docs/CHANGE-ui-overhaul.md
```

Once the overhaul is either committed or undone, the snapshot branch can go:
`git branch -D snapshot/pre-ui-overhaul`.
