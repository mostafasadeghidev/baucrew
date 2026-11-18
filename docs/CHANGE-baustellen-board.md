# CHANGE: Baustellen is the running-jobs board

## What changed

**Baustellen** (`/sites`) was a list of its own: the projects in progress and
the ones starting within 14 days, each with flags (overdue tasks or defects,
open forms, no crew, nothing planned) and its next and last schedule day.
The client keeps the running jobs on a board of their own, mirrored from
Trello ("Aktuell laufende Baustellen": AUFTRÄGE, Baustellenbeginn, Baustelle
läuft, Baustellenunterbrechung / Pause, Abschlagszahlungen, Fertigstellung,
Rechnungsstellung, Erledigt …). Baustellen now **is that board**: the
projects page's board view, fixed to one board.

- **Which board** is a setting on the board, not a match on its name: the
  tick **"Dieses Board unter Baustellen zeigen"** in the board window (gear on
  the open tab, Einstellungen → Boards). One board at most carries it; saving
  the tick on one takes it off every other in the same transaction
  (`saveBoardDraft` in `src/lib/boards-db.ts`). The window says which board
  has it now and that the tick moves it. Column `Board.showOnSites`.
- **The migration** (`20261103120000_board_show_on_sites`) ticks the board
  named "Aktuell laufende Baustellen" (case and outer spaces ignored; the
  first in the tabs' order should there be two) when it exists; otherwise no
  board has it.
- **No board ticked**: `/sites` says so; an administrator gets the link to
  Einstellungen → Boards, everybody else is told an administrator sets it.
- **`/sites` renders the projects page itself** (`ProjectsBoard` in
  `src/app/(admin)/projects/projects-board.tsx`, formerly the body of
  `projects/page.tsx`) with `base="/sites"` and the ticked board fixed: the
  same cards, drag and drop, list menus, card templates, filters, search,
  year, archive, activity, board/list switch and list view. Left out there:
  the board tabs, "Alle Projekte", "Neues Board" and the boards' window (in
  the board's menu and in a list's menu). In their place the board's name
  with its colour; an administrator's gear beside it leads to
  Einstellungen → Boards for that board. Every link the page makes to itself
  stays on `/sites` and carries no `board=`.
- **The card** opens over Baustellen at `/sites/card/<id>` in a `@modal`
  slot of its own (`src/app/(admin)/sites/layout.tsx`, `@modal/(.)card/[id]`),
  the same sheet as over the projects page (`CardModal` in
  `src/app/(admin)/projects/card-modal.tsx`); a save returns to
  `/sites?card=<id>`, closing goes back to the board. A cold load of
  `/sites/card/<id>` shows the project's full page, as `/projects/card/<id>`
  does. The card URL helpers take the page as `base`
  (`src/lib/card-url.ts`: `cardPath`, `cardHref`, `cardReturnTo`,
  `boardBaseOf`, `cardIdOf`; `projectsViewHref` in `src/lib/projects-view.ts`).
- **One board in two places**: a move under Baustellen is a move under
  Projekte — nothing is stored twice; the board is the same rows.
- **Projekte is unchanged**: every board stays a tab, the running-jobs board
  included.
- **The flags moved onto the cards** as small amber markers before the
  card's other marks: "Mängel überfällig", "Aufgaben überfällig",
  "Unterschrift offen", and on a running job (`IN_PROGRESS`) "Kein Team" and
  "Nichts geplant". Also beside the name in the list view. **They show on
  Projekte too**: it is one card, and a card that looked different depending
  on which page opened it would be confusing; "Kein Team" and "Nichts
  geplant" only ever appear on running jobs, so the sales boards stay quiet.
  The rule is `siteFlags` in `src/lib/sites.ts` (pure, tested); the board
  page reads the overdue tasks and defects, the unsigned forms, the team
  count and — for running jobs only — the next schedule day.
- **What the old list showed and the board does not**: the "starting within
  14 days" grouping (the board's own columns say where a job stands), the
  last schedule day, and the counts of photos and checklists as links (the
  card carries its checklist progress, files, tasks and defects already).
  `sortSites`, `countDue`, `checklistProgress`, `SOON_DAYS` and `SiteRow`
  went with the list.
- **Roles**: unchanged rules. A site manager sees on Baustellen only the
  projects they are named on (`projectScope`, `requireStaff`) and never a
  price (`canViewFinancials`); the sidebar entry stays `site: true`.
- **Old links**: `/sites` keeps working (it is the board now); `?q=` searches
  the board as before.

## Files

- `prisma/schema.prisma` — `Board.showOnSites`
- `prisma/migrations/20261103120000_board_show_on_sites/migration.sql` — new
- `src/lib/boards.ts` — `sitesBoard`
- `src/lib/boards-db.ts` — `BoardRow.showOnSites`, `getBoards` selects it,
  `saveBoardDraft` saves it and keeps it on one board
- `src/lib/board-draft.ts` — `showOnSites` in `BoardDraft`/`CleanBoard`,
  `draftFromBoard`, `blankDraft`, `draftFromPreset`, `cleanBoardDraft`
- `src/lib/card-url.ts` — `BoardBase`, `boardBaseOf`, `cardIdOf`, `base` on
  `cardPath`/`cardHref`/`cardReturnTo`, `isCardPath` knows `/sites/card/`
- `src/lib/projects-view.ts` — `base` on `projectsViewHref`
- `src/lib/sites.ts` — rewritten: `SiteFacts`, `siteFlags`, `needsNextDate`
- `src/app/(admin)/projects/page.tsx` → `projects-board.tsx` (renamed; the
  page's body as `ProjectsBoard` with `base` and `fixedBoardId`, the site
  markers); `page.tsx` new, renders `ProjectsBoard`
- `src/app/(admin)/projects/card-modal.tsx` — new, the body of the card
  route's modal page, with `base`
- `src/app/(admin)/projects/@modal/(.)card/[id]/page.tsx` — renders `CardModal`
- `src/app/(admin)/projects/sites-board-name.tsx` — new
- `src/app/(admin)/projects/kanban.tsx` — `KanbanCard.flags` and their
  markers; card links by the page they stand on
- `src/app/(admin)/projects/projects-toolbar.tsx` — `base`
- `src/app/(admin)/projects/board-settings.tsx` — `SettingsBoard.showOnSites`,
  the tick and its hint
- `src/app/(admin)/projects/pending-card-sheet.tsx`,
  `src/app/(admin)/projects/[id]/sheet-menu.tsx`,
  `src/components/checklist.tsx`, `src/components/search-palette.tsx` — a
  card opened from `/sites` stays on `/sites`
- `src/app/(admin)/settings/boards/page.tsx` — passes `showOnSites`
- `src/app/(admin)/settings/boards/actions.ts` — revalidates `/sites`
- `src/app/(admin)/sites/page.tsx` — rewritten: the board, or the empty state
- `src/app/(admin)/sites/layout.tsx`, `sites/@modal/default.tsx`,
  `sites/@modal/page.tsx`, `sites/@modal/(.)card/[id]/page.tsx`,
  `sites/@modal/(.)card/[id]/loading.tsx`, `sites/card/[id]/page.tsx` — new
- `messages/de.json`, `messages/en.json` — `sites.*` trimmed to the title and
  the flags, plus `boardSettings`, `noBoard*`; `projects.boardSettingsShowOnSites*`
- `tests/unit/sites.test.ts` (rewritten), `tests/unit/boards.test.ts`,
  `tests/unit/board-draft.test.ts`, `tests/unit/card-url.test.ts`,
  `tests/unit/projects-view.test.ts`, `tests/db/boards.test.ts`,
  `tests/db/sites-board.test.ts` (new: one board only, site manager's scope)
- `AGENTS.md` — this file's line

## Rollback

1. Revert the commit (`git revert <hash>`). That restores the old list page,
   `src/lib/sites.ts` and its test, the projects page as one file and the
   messages.
2. The column may stay: nothing reads it after the revert. To drop it as
   well, on a database that has run the migration:
   ```sql
   ALTER TABLE "Board" DROP COLUMN "showOnSites";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261103120000_board_show_on_sites';
   ```
   and delete the migration's folder if it is still there.
