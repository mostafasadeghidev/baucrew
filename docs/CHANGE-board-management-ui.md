# CHANGE: One window for the boards

## Why

A board could be made or changed in four places, each able to do a different
part of it: the small "+" after the tabs (name, colour, starting lists), the
arrow on the open tab (name, colour, photo, left/right, delete), the long
page Einstellungen → Boards (every board stacked as a form, nine status
rows each, its own preset card) and the board itself (renaming, adding and
dragging lists). Column order could only be dragged on the board, board
order only moved one step at a time, and the rule lists were named by their
rule ("Regel", "Trello-Liste") rather than by what they show. On the
settings page a board with rule columns also showed its statuses twice or
three times (the rows were built from every column, rule columns included —
React warned about duplicate keys), each with the title of the wrong column.

## What changed

- **One window** (`src/app/(admin)/projects/board-settings.tsx`), for
  administrators as before. Left: every board, dragged by its grip into the
  order of the tabs (saved on the drop), and **Neues Board**. Right: the
  chosen board — **Name**, **Farbe** (the tab's swatch; a photo instead is
  still possible), a **Vorschau** of the board as it will look, and the
  **Spalten**: one row per column with a grip (drag, or arrow keys on the
  grip), its own name (blank is the status's), the status it shows (fixed for
  a rule column), × to remove it, and one sentence that says what the column
  shows and what dragging a card into it does. **Spalte hinzufügen** at the
  foot offers the missing statuses and the special lists, each explained.
  Two columns showing the same thing are marked and block the save.
- **Nothing is written until "Speichern"** — the whole board (name, colour,
  columns with order, names and statuses) in one server action
  (`saveBoardSettings`) and one transaction (`saveBoardDraft`). Leaving a
  board or closing the window with changes not saved asks first.
- **A new board starts with a choice** — the usual run of a job (six statuses
  from *Anfrage* to *Abgeschlossen*), the client's Trello board, or a copy of
  another board — filled into the same editor, changed as wanted, then made;
  it opens at once.
- **Delete** asks in a dialog that says the projects stay; the last board
  still cannot be deleted.
- **Entry points**: a gear on the open tab (was an arrow), **+ Neues Board**
  after the tabs (text from xl, icon below), *Boards verwalten* and *Neues
  Board* in the board menu, *Boards verwalten* in a list's menu. The window
  lives in the address as `?boardSettings=<id|new>`, set with
  `history.replaceState` (no server round trip); changing board drops it.
- **Einstellungen → Boards** is the same window as a page (`?board=<id|new>`).
- A **Trello column** says that it comes from the Trello sync and that the
  sync adds it again while its Trello board is switched on — removing one is
  not prevented, only explained.
- The lists on the board itself (rename, add, remove, drag — the office's)
  are unchanged.
- **A colour per column**, the way Trello lets a list wear one: a pale tint
  of one of the ten label colours (`LABEL_COLORS` in `src/lib/board-cards.ts`,
  tints in `LIST_TINT` in `src/components/swatches.ts`) behind the list's
  cards, or none for the plain grey. Picked in the window (a tile beside each
  column's status; the preview shows it; saved with the board) and in a
  list's menu on the board under **Farbe** (saved at once, the office's like
  renaming — `colorColumn`). Copying a board copies its colours; the Trello
  import and sync leave them alone. Migration
  `20261031150000_board_column_color` adds the nullable column
  `BoardColumn.color` (a key; null and unknown keys are the plain grey).

## Touched files

- `src/lib/board-draft.ts` — new (pure): the draft, its defaults, presets and
  copies, `addableColumns`, `duplicateColumns`, `cleanBoardDraft`,
  `planColumnSave`, `cleanBoardOrder`, `moveItem`;
  `tests/unit/board-draft.test.ts` — new
- `src/lib/boards-db.ts` — `saveBoardDraft` added; `createBoardFromPreset`,
  `saveBoardColumns` removed; `tests/db/boards.test.ts` follows
- `src/lib/boards.ts` — `columnsFromForm`, `startingLists`,
  `BoardColumnDef` removed (their tests in `tests/unit/boards.test.ts` too)
- `src/lib/projects-view.ts` — `boardViewHref` drops `boardSettings`;
  `tests/unit/projects-view.test.ts`
- `src/app/(admin)/settings/boards/actions.ts` — `saveBoardSettings`,
  `reorderBoards`; `removeBoard` and the photo actions kept;
  `createBoard`, `updateBoard`, `createPresetBoard`, `deleteBoard`,
  `createBoardFromBar`, `renameBoard`, `setBoardBackground`, `moveBoard`
  removed
- `src/app/(admin)/settings/boards/page.tsx` — the window as a page;
  `board-image.tsx` removed
- `src/app/(admin)/projects/board-settings.tsx` — new;
  `board-admin.tsx` removed
- `src/app/(admin)/projects/board-tabs.tsx` — gear, "Neues Board", the window
- `src/app/(admin)/projects/board-menu.tsx`, `kanban.tsx` — open the window
  instead of linking to the settings page (`manageBoards` instead of
  `settingsHref`)
- `src/app/(admin)/projects/page.tsx` — passes the columns (administrators
  only) and `manageBoards`
- `messages/de.json`, `messages/en.json` — `projects.boardNew`,
  `projects.boardSettings*`, `projects.columnColor*`; the keys of the old
  popovers and settings form removed
- Column colour: `prisma/schema.prisma` and
  `prisma/migrations/20261031150000_board_column_color/` (`BoardColumn.color`);
  `src/app/(admin)/projects/column-color.tsx` — new (the swatches and
  `listGround`); `src/components/swatches.ts` (`LIST_TINT`);
  `src/lib/boards-db.ts` (`setBoardColumnColor`, colour in `getBoards` and
  `saveBoardDraft`); `src/app/(admin)/projects/actions.ts` (`colorColumn`);
  `kanban.tsx` (the list's ground, *Farbe* in its menu);
  `board-settings.tsx` (tile per row, preview); `page.tsx` and
  `settings/boards/page.tsx` pass the colour on
- `docs/BENUTZERHANDBUCH.md`, `AGENTS.md`

## Rollback

Boards saved with the new window are ordinary `Board` / `BoardColumn` rows.
The one schema change is the column colour; it can stay in the database
(nothing else reads it), or go with a migration of its own.

To take back only the colours, revert the commit that added the migration:

```sh
git switch -c revert-column-colors
change=$(git log --diff-filter=A --format=%H -- prisma/migrations/20261031150000_board_column_color/migration.sql | head -n 1)
test -n "$change" && git revert "$change"
```

To take back the whole window, revert both commits, colours first:

```sh
git switch -c revert-board-management-ui
for file in prisma/migrations/20261031150000_board_column_color/migration.sql docs/CHANGE-board-management-ui.md; do
  change=$(git log --diff-filter=A --format=%H -- "$file" | head -n 1)
  test -n "$change" && git revert --no-edit "$change"
done
npm run typecheck && npx eslint src prisma tests && npm test && npm run build
```

A revert leaves the `color` column in databases that already ran the
migration — harmless, as nothing reads it. To drop it as well, add a new
migration (never edit an applied one):
`ALTER TABLE "BoardColumn" DROP COLUMN "color";`.

Old links with `?boardSettings=…` are then ignored by the page. Review the
revert through a pull request, as CONTRIBUTING asks.
