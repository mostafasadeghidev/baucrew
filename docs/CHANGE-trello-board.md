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
- **The card back** (the sheet over the board) is laid out like Trello's: the
  cover across the top; title, status, members, labels, dates; the "add to
  card" row; then, one under the other, the description, a folded line
  "Projektdaten" holding the four fact cards (opened by a click, by
  "Bearbeiten" and by the add-to-card buttons), the files, checklists, tasks,
  defects, forms, the planned days, and a folded line "Weitere Angaben"
  (material, devices, time, add-ons, invoices). The comments stay in the
  right column, with the card's **history** under them — the audit log in
  plain words (`src/lib/card-history.ts`; invoice lines only for whoever sees
  money). The sheet is narrower (`max-w-5xl`). The project's full page keeps
  its side-by-side layout.

## Touched files

- `prisma/schema.prisma` — `Project.boardPosition`, `Project.archivedAt` (+
  index), `Project.coverDocumentId` ↔ `Document.coverOf`
- `prisma/migrations/20260924090000_trello_board/migration.sql` — the
  columns, the index, the foreign key; boards without a ground get `blue`
- `src/lib/board-order.ts` — new (pure): `positionBetween`, `tooClose`,
  `orderCards`, `renumbered`, `insertIndex`, `sortedBy`, `COLUMN_SORTS`
- `src/lib/boards-db.ts` — `renameBoardColumn`, `addBoardColumn`,
  `removeBoardColumn`
- `src/lib/backup.ts` — covers in a second pass
- `src/app/(admin)/projects/actions.ts` — `changeStatus` shared by
  `setProjectStatus` and the new `moveCard`; `sortColumn`, `archiveProject`,
  `renameColumn`, `addColumn`, `removeColumn`
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
   ALTER TABLE "Project" DROP CONSTRAINT "Project_coverDocumentId_fkey";
   DROP INDEX "Project_coverDocumentId_key";
   DROP INDEX "Project_archivedAt_idx";
   ALTER TABLE "Project" DROP COLUMN "boardPosition", DROP COLUMN "archivedAt", DROP COLUMN "coverDocumentId";
   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260924090000_trello_board';
   ```

   The boards keep the blue ground they were given; set it back to none under
   Einstellungen → Boards if wanted.
3. `npx prisma generate`.
