# CHANGE: The project board drawn the way Trello draws one

## What changed

The projects page's board looked like a board; the client wanted it to look
and move like the Trello board they had used. It now does, and three things a
Trello card has and a project did not — a place in its list, an archive, a
picture on its front — exist on the project.

Rules that hold:

- **The board fills the page.** As a board the projects page is edge to edge
  on its own ground (every board has one now; the ones that had none were
  given Trello's blue), with a bar across the top: the boards as light tabs,
  the search, the filter, the year, list/board, "Neues Projekt" and the
  board's menu (…). The office's other doors — drafts, templates, checklists,
  forms, the board settings — are in that menu. The list view is unchanged.
- **A card shows what a Trello card shows**: its labels, its picture, its
  name, and small marks for what hangs on it (a description, the dates, the
  checklist, open tasks and defects, files, comments) with the people on it.
  The customer, the place, the number, the day it was made and the value are
  shown with **Kartendetails** (board menu), remembered per browser, off by
  default.
- **A card keeps its place.** `Project.boardPosition` is where it stands in
  its column; a card that was never placed follows the placed ones, newest
  first, so an untouched board reads as before. A drop between two cards
  takes the midpoint of their positions (`src/lib/board-order.ts`); where a
  neighbour was never placed or the gap is used up, the column is numbered
  afresh once. Dragging shows a grey slot where the card will land and moves
  the slot ahead of the pointer; Escape puts the card back. A list can be
  sorted from its menu (name, number, planned start, created), which writes
  positions for the whole column.
- **A list is handled like a Trello list**: its head is its handle (dragging
  it moves the list; the ground between the lists slides the board), its name
  is typed over in place, its menu (…) adds a card, sorts, folds it to a strip
  (per browser), renames it, takes it off the board (never the last one), and
  "+ Weitere Liste" at the right end adds a list for a status the board does
  not show yet. Renaming, adding, taking off and sorting are the office's
  (`requireManagement`); the site manager role drags cards only.
- **A card can be archived** (`Project.archivedAt`): off the board and the
  list, the sites page and the pipeline, still a project everywhere else —
  the schedule, the reports, its own page, which says so in a banner. The
  board menu opens **Archivierte Karten**, a panel over the right of the
  board, each with "Wiederherstellen". Archiving from the sheet over the board
  closes the sheet.
- **A card can wear a picture** (`Project.coverDocumentId`, one of the
  project's own photos, chosen with "Titelbild" under the photo in the files
  card). A deleted photo takes the cover with it (`SetNull`).
- **The backup** restores projects without their covers and writes the covers
  once the documents are in — the one pair of tables that point at each other.
- **A list may follow a rule** (`BoardColumn.rule`, `src/lib/board-rules.ts`),
  so a board can have the client's lists that were not a status: **Pause**
  (running jobs on hold — `Project.pausedAt`), **Nächstes Jahr** (orders whose
  planned start lies in a later year), **Warteliste** (orders with low
  priority), **Abschlag gestellt** (running sites whose first invoice was
  marked ready). A rule list shows the cards of its status the rule picks;
  the plain list of that status shows the rest. Columns are told apart by
  their id now (two lists can share a status), the order is saved as ids, and
  a rule list is added and removed on the board itself ("+ Weitere Liste"),
  never from the settings form, which touches plain lists only. Dropping a
  card into a rule list does what the rule says (on hold, low priority, planned
  for 1 January next year when it had no later date) and dropping it out
  undoes it, except next year's list, whose dates are the office's; the invoice
  list refuses a drop — it fills by itself.
- **The client's board with one click**: Einstellungen → Boards has "Board
  wie in Trello anlegen", which makes "Aktuell laufende Baustellen" with the
  ten lists of the Trello board (`src/lib/board-presets.ts`), three of them
  rule lists. "Aufträge für <year>" is titled for next year at creation, as
  the Trello list was.
- **The filter asks when a card is due**, as Trello's does: overdue, due in
  the next week or month (by "Fällig am"), or without a day at all (neither
  planned start nor due date) — `due=` in the address, in both views.
- **The cards slide** rather than jump when the slot passes, a card is
  dropped, a move is undone or the server answers: a FLIP pass in a layout
  effect puts every card that moved back where it was and lets it travel
  (160 ms); the copy in hand glides into the slot before it goes. Lists' own
  scroll and the board's are taken out of the measure.
- **The archive panel** is searched as it is typed into (`aq=`) and offers
  the administrator "Löschen" beside "Wiederherstellen" — gone for good,
  after the usual question; the panel stays open.
- **A card can be copied** ("Karte kopieren" in its quick menu): the same
  customer, place, trades, people, vehicles, material, machines and
  checklists, in the same list right under the original, with a fresh number
  and no dates, money, files or talk; the copy opens for its touch-up
  (`copyProject`, audit `project.copy`, a history line).
- **Light is where the app opens.** The theme was the system's unless chosen;
  it is light unless chosen — dark and "system" stay a click away and are
  kept as choices — because the client's Trello was light and the board is
  what they see first.
- **The card back** (the sheet over the board) is laid out like Trello's: the
  cover across the top; title, status, members, labels, dates; the "add to
  card" row; then, one under the other, the description, a folded line
  "Projektdaten" holding the four fact cards (opened by a click, by
  "Bearbeiten" and by the add-to-card buttons), the files, checklists, tasks,
  defects, forms, the planned days, and a folded line "Weitere Angaben"
  (material, devices, time, add-ons, invoices). The comments stay in the
  right column, with the card's **history** under them — the audit log in
  plain words (`src/lib/card-history.ts`; invoice lines only for whoever sees
  money). The sheet keeps its width (`max-w-7xl`, 1280px); the fact cards under
  "Projektdaten" stand two abreast from xl and one under the other below.
  The project's full page keeps its side-by-side layout.

## Touched files

- `prisma/schema.prisma` — `Project.boardPosition`, `Project.archivedAt` (+
  index), `Project.coverDocumentId` ↔ `Document.coverOf`
- `prisma/migrations/20260924090000_trello_board/migration.sql` — the
  columns, the index, the foreign key; boards without a ground get `blue`
- `prisma/migrations/20260924120000_board_rule_columns/migration.sql` —
  `BoardColumn.rule`, the unique (board, status) dropped for an index,
  `Project.pausedAt`
- `src/lib/board-order.ts` — new (pure): `positionBetween`, `tooClose`,
  `orderCards`, `renumbered`, `insertIndex`, `sortedBy`, `COLUMN_SORTS`
- `src/lib/board-rules.ts` — new (pure): `COLUMN_RULES`, `RULE_STATUS`,
  `ruleMatches`, `columnFor`, `dropPatch`; `tests/unit/board-rules.test.ts`
- `src/lib/board-presets.ts` — new (pure): the sites board;
  `tests/unit/board-presets.test.ts`; `boards-db.ts` `createBoardFromPreset`;
  `settings/boards/actions.ts` `createPresetBoard`
- `src/lib/board-cards.ts` — `DUE_FILTERS`, `dueFilterRange`, `due` in the
  filter; `board-filter.tsx`, `projects-view.ts`
- `src/lib/boards.ts` — `cleanColumnOrder` takes column ids
- `src/lib/boards-db.ts` — `renameBoardColumn`, `addBoardColumn`,
  `removeBoardColumn`
- `src/lib/backup.ts` — covers in a second pass
- `src/app/(admin)/projects/actions.ts` — `changeStatus` shared by
  `setProjectStatus` and the new `moveCard`; `sortColumn`, `archiveProject`,
  `renameColumn`, `addColumn`, `removeColumn`, `copyProject`,
  `deleteArchivedProject`
- `src/app/layout.tsx`, `src/components/theme-toggle.tsx` — light by default
- `src/app/(admin)/projects/[id]/file-actions.ts` — `setProjectCover`
- `src/app/(admin)/projects/kanban.tsx` — the board: the slot while dragging,
  the head as handle, the list menu, folding, renaming, "+ Weitere Liste",
  the card's front with cover and marks, details on request
- `src/app/(admin)/projects/board-prefs.ts` — new (client): the labels, the
  details and the folded lists, per browser
- `src/app/(admin)/projects/board-menu.tsx` — new (client): the board's menu
- `src/app/(admin)/projects/archive-button.tsx` — new (client)
- `src/app/(admin)/projects/board-tabs.tsx` — `onGround`
- `src/app/(admin)/projects/page.tsx` — the board's frame and bar, the archive
  panel, archived cards left out, cards in their placed order
- `src/app/(admin)/projects/[id]/project-detail.tsx` — archive/restore in the
  bar, the banner, the card back's order, the cover band, the history;
  `[id]/files-card.tsx` — "Titelbild"
- `src/app/(admin)/projects/project-form.tsx` — `fold`: the description first
  and the four fact cards folded; `card-sheet.tsx` — narrower
- `src/lib/card-history.ts` — new (pure), `tests/unit/card-history.test.ts`
- `src/app/(admin)/sites/page.tsx`, `src/lib/reports.ts` — archived cards
  left out
- `messages/de.json`, `messages/en.json` — `projects.kanban*`,
  `projects.board*`, `projects.card*`, `projects.sheet*`, `files.*Cover`,
  the `history` group
- `tests/unit/board-order.test.ts` — new; `tests/unit/backup-tables.test.ts`
  — the two-way pair
- `docs/BENUTZERHANDBUCH.md`

## Rollback

1. `git revert` the commit(s).
2. Roll the database back:

   ```sql
   ALTER TABLE "Project" DROP COLUMN "pausedAt";
   ALTER TABLE "BoardColumn" DROP COLUMN "rule";
   DROP INDEX "BoardColumn_boardId_idx";
   CREATE UNIQUE INDEX "BoardColumn_boardId_status_key" ON "BoardColumn"("boardId", "status");
   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260924120000_board_rule_columns';
   ALTER TABLE "Project" DROP CONSTRAINT "Project_coverDocumentId_fkey";
   DROP INDEX "Project_coverDocumentId_key";
   DROP INDEX "Project_archivedAt_idx";
   ALTER TABLE "Project" DROP COLUMN "boardPosition", DROP COLUMN "archivedAt", DROP COLUMN "coverDocumentId";
   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260924090000_trello_board';
   ```

   The boards keep the blue ground they were given; set it back to none under
   Einstellungen → Boards if wanted.
3. `npx prisma generate`.

## Addendum (2026-09-27): the card front and back as the client's Trello draws them

Built after the client's own Trello board was exported and compared with ours.

**What changed**
- The card front shows its field lines — customer, site address, order value
  (green), type of work, execution wish, site visit (lime), created (red),
  customer number — in the client's order, empty ones left out, on by default
  (`useCardDetails` reads "off" only when the browser stored `0`); the trades
  stand in the "Art der Arbeit" line instead of as labels while the lines show.
  `cardFieldLines()` / `CARD_FIELD_TONE` in `src/lib/board-cards.ts`,
  `FIELD_CHIP` in `src/components/swatches.ts`. Covers up to `max-h-64`.
- Two project fields: `Project.inspectionDate` (DATE) and
  `Project.executionWish` (TEXT) — form (planning card), card back, card
  front, API (create/PATCH/body), webhook snapshot (`WATCHED_FIELDS`).
- The card back: the list the card stands in beside the title, opening
  "Karte verschieben" (board, list, position; `card-move.tsx`, fed by
  `movePlaces` in `projects/page.tsx`, moving through `moveCard`); a fields
  grid under the description (`[id]/card-fields-grid.tsx`, via the form's new
  `afterDescription` slot, each cell opening the form card that holds it); a
  long description folds (`components/ui/clamp-text.tsx`); files dropped
  anywhere on it are attached (`[id]/card-drop-zone.tsx`).
- Attachments: Outlook e-mails (`application/vnd.ms-outlook`, `.msg`) and
  `.eml` are accepted; a type the browser does not know is found by the name
  (`resolveUploadType`); several files at once; the files card lists them the
  way Trello does (`[id]/attachment-list.tsx`, `[id]/files-card.tsx`); files
  dropped on a board card are attached to it (`kanban.tsx`).
- Comments: the author edits (`Note.editedAt`, "(bearbeitet)"), anybody
  answers ("Antworten" puts the author's @name in the box) and reacts
  (`NoteReaction`, one of each emoji per person; `REACTIONS` in
  `src/lib/comments.ts`); `editProjectComment`, `toggleCommentReaction`.
- The list menu: "Alle Karten dieser Liste verschieben" (`moveCards`) and
  "… archivieren" (`archiveCards`), office only.
- The ground `snow` (Trello's blue gradient) in `BOARD_BACKGROUNDS`; the
  one-click sites board uses it.

**Migration:** `prisma/migrations/20260927090000_trello_card_fields`.

**Rollback**
1. Revert the commit.
2. In the database:
   ```sql
   DROP TABLE "NoteReaction";
   ALTER TABLE "Note" DROP COLUMN "editedAt";
   ALTER TABLE "Project" DROP COLUMN "executionWish";
   ALTER TABLE "Project" DROP COLUMN "inspectionDate";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260927090000_trello_card_fields';
   ```
   A board already set to the ground `snow` falls back to the app's own
   ground once the key is gone (`boardBackgroundKey` returns null).

### The card's back as Trello's card modal (same addendum)

- `card-sheet.tsx`: the sheet is a white modal up to 1080 px wide; from `lg`
  it is as tall as the window allows and its two columns scroll on their own;
  on a phone the whole sheet scrolls. `ROUND_BUTTON`, `SheetClose round`.
- `project-detail.tsx` returns a separate layout for the sheet: a cover band
  (the picture contained, its blurred self behind it) or a slim bar, the list
  picker on the left and the round buttons on the right — `[id]/cover-picker.tsx`
  (choose, upload, remove; `components/ui/popover.tsx`), `[id]/sheet-menu.tsx`
  (work order, offer e-mail, full page, edit everything, reopen, archive,
  delete) — then the card on the left (`[id]/sheet-title.tsx` keeps a slim
  title bar once the title scrolls away; `SheetAddBar`/`SheetAddMenu` in
  Trello's buttons; sections drawn flat) and on the right
  `ProjectComments` in its `panel` mode: the box first, newest first, the
  card's history mixed in behind "Details anzeigen" (`ActivityRow`).
- `ProjectBarActions idle={false}`: save and cancel only while "Alles
  bearbeiten" is on. The project page keeps its own layout.

Rollback: part of the same commit; no data of its own.
