# CHANGE: Project boards — one board becomes several

## What changed

The projects page had one board, and which statuses stood as its columns was
a single setting (`AppSetting` key `projectBoard`, ticked under Einstellungen).
It now has **boards**: each a name and its columns, kept in two tables, and
the projects page shows one of them at a time with a tab per board above the
search, the way Trello lines its boards up.

Rules that hold:

- **A column is a status.** Dragging a card into another column changes the
  project's status and nothing else — scheduling, the CRM and the webhooks
  read the status they always read. A board is a view of the projects, never a
  second place they are kept.
- A column may carry a **name of its own** on its board (`title`), e.g.
  "Angebot fertig" for `QUOTED`, the way the list was called on the Trello
  board. Without one it is called by the status.
- A project stands on **every board** that has a column for its status.
- **Which columns** a board has is chosen under Einstellungen → Boards
  (administrators); **the order** they stand in is dragged on the board itself
  (management), as before, and saved on that board.
- Which board is open lives in the address (`?board=<id>`) and is remembered
  per browser in the cookie `project-board`; without either, the first board.
- The **last board cannot be deleted**; a projects page without a board is a
  page with nothing on it.

The migration makes the first board, **Alle**, out of the old setting — the
same columns in the same dragged order, every status when nothing had been
chosen — and deletes the setting.

## Touched files

- `prisma/schema.prisma` — `Board`, `BoardColumn`
- `prisma/migrations/20260916234934_project_boards/migration.sql` — tables, the
  first board from the old setting, the setting deleted
- `src/lib/boards.ts` — new (pure): `moveColumn` (moved from
  `board-columns.ts`), `columnsFromForm`, `cleanColumnOrder`, `pickBoard`,
  `columnLabel`, `cleanBoardName`, the cookie name
- `src/lib/boards-db.ts` — new: `getBoards`, `saveColumnOrder`,
  `saveBoardColumns`
- `src/lib/board-columns.ts`, `src/lib/board-columns-db.ts` — removed
- `src/lib/projects-view.ts` — the list/board switch keeps `board`
- `src/lib/backup-tables.ts` — the two tables in the backup
- `src/app/(admin)/projects/page.tsx` — picks the board, draws its columns,
  shows the board tabs
- `src/app/(admin)/projects/board-tabs.tsx` — new (client): the tabs, the
  cookie, the link to the settings page
- `src/app/(admin)/projects/kanban.tsx` — takes `boardId`; a new board is a new
  component
- `src/app/(admin)/projects/actions.ts` — `setBoardOrder(boardId, statuses)`,
  `rememberBoard`
- `src/app/(admin)/settings/boards/page.tsx`, `actions.ts` — new: the boards
  and their columns (create, rename, columns and names, order, delete)
- `src/app/(admin)/settings/page.tsx`, `actions.ts` — the column card becomes
  a link to the boards page; `updateProjectBoard` removed
- `src/components/ui/tabs.tsx` — `TabLink` takes `onClick`
- `messages/de.json`, `messages/en.json` — `settings.boards*`,
  `projects.boardTabs`, `projects.boardsManage`; `settings.boardTitle`,
  `boardHint`, `boardStatuses` removed
- `tests/unit/boards.test.ts` — new; `tests/unit/board-columns.test.ts` removed
- `docs/BENUTZERHANDBUCH.md`, `AGENTS.md`

## Rollback

1. `git revert` the commit.
2. Roll the database back: the old setting is gone, so write it again from the
   first board before dropping the tables —

   ```sql
   INSERT INTO "AppSetting" ("key", "value")
   SELECT 'projectBoard', json_build_object('statuses', json_agg(c."status" ORDER BY c."sortOrder"))::text
   FROM "BoardColumn" c
   WHERE c."boardId" = (SELECT "id" FROM "Board" ORDER BY "sortOrder", "createdAt" LIMIT 1);
   DROP TABLE "BoardColumn";
   DROP TABLE "Board";
   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260916234934_project_boards';
   ```

3. `npx prisma generate`.
