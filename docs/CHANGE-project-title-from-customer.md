# CHANGE: A project is named after its customer and its trades

## What changed

Nobody types a project name any more. A project is called by its customer
followed by the work it is for — the trades ("Leistungen", the configurable
work categories in Einstellungen):

- "Muster GmbH · Malern"
- "Muster GmbH · Malern, Trockenbau" (several trades in the order Settings
  lists them)

The rule lives in one pure helper, `src/lib/project-title.ts`
(`projectTitle`, unit-tested). The trades are written with their **German**
names in either language of the app — they are the office's own words, and the
name is one stored text that the schedule, PDFs, notifications, the API and
Wattro all read.

**Where the name is kept.** The result is stored in `Project.name`, as before,
so every place that showed a project's name shows the new one without being
touched: board, list, project page, card sheet, schedule, search, `/my`,
notifications, work orders and PDFs, the API and the MCP tools, Wattro.
`src/lib/project-title-db.ts` (`refreshProjectTitles`, `titleFor`) keeps it
current wherever a part of it changes:

| What changes | Where |
| --- | --- |
| a project made | the form, "Karte hinzufügen", card templates, a checklist item turned into a card, copy, inbox draft, API / MCP, Trello import |
| its trades | the form, the card's labels, a template's labels, merge, API / MCP (`trades`), Trello import |
| its customer | the form, the card's "Kundenname" field, Trello import |
| a customer renamed | Kunden → bearbeiten, API / MCP `update_customer`, the master-data import |
| a trade renamed | Einstellungen → Leistungen |

Wattro keeps the name a project was made there with: the new names never
reach a project Wattro already holds — not by the migration, not when a name
is refreshed, not on the next push (part 3). A project made in Wattro from now
on gets its name as it is here at that moment.

**The old title is kept.** A new column, `Project.sourceTitle`, holds what the
project was called before: the Trello card's title, the name typed in until
now, the words an automation sent, a checklist item a card was made from. It is

- the name while the project has **no trade yet** (most of the imported
  projects today), and failing that the customer alone;
- shown **small and grey under the name** on the board card, the card sheet
  and the project page while it differs from the name (`formerTitle`), so the
  detail of a Trello title — the place, "Garage Musterdorf" — is not lost;
- searched by the board, the list, the archive, Baustellen and the API;
- what the year-plan matching (Auswertungen → Planumsatz) compares the
  sheet's lines with, since the sheet names jobs the way the cards were titled.

**The forms.** The name field is gone from the project form (a line says the
name comes from customer and trades). "Karte hinzufügen" at a list's foot asks
for the customer and offers the trades as chips. The board's "Umbenennen"
(menu and key `t`) and the click-to-edit title on the card are gone. A card
template no longer asks for a title; its trade (when kept) names the card.

**The Trello field "Art der Arbeit".** The importer already turned the card
field into trades, but only where the words were a trade's exact name; most
were not ("Malerarbeiten", "Innenputz", "Fassade streichen", "IP"). The
matcher (`matchTrades` in `src/lib/trello-fields.ts`) now knows the office's
own words for each trade (`TRADE_WORDS`). On the client's open job cards of
2026-10-17 it finds a trade for 155 of the 171 cards that have the field
(before: 39). The server's hourly Trello sync adds them to the
projects by itself (trades are added, never taken away), and the names follow.
Cards without the field (about 130 open ones, and the office's to-do boards)
keep their Trello title as their name.

**API / MCP.** `create_project` and `update_project` (and `POST/PATCH
/api/v1/projects`, `PUT …/by-link/…`) take `trades: ["Malern"]`; an unknown
trade is refused. `name` is still accepted and kept as the old title — no
automation breaks. New read tool `list_trades`. Projects come back with
`trades` and `sourceTitle` beside `name`. See `docs/API.md`.

## Part 2: "Art der Arbeit" in full — the work note

The client's rule: **a job type that comes up again and again is a trade;
everything else goes into a free field the office fills in itself.** Trello
stays read-only — nothing is ever written back.

**The free field.** New column `Project.workNote`, labelled "Art der Arbeit
(frei)" / "Type of work (free text)". It follows the trades in the name:

- "Muster GmbH · Malern, Küche" — trades, then the note;
- "Muster GmbH · Küche" — a note and no trade;
- the old title only while there is neither, then the customer alone.

The office changes it on the card's back in the "Felder" grid, beside "Art der
Arbeit" (typed into in place, saved on Enter or on leaving the box), and in the
project form's basic card; the project page shows it under the trades. The
board card's front shows it in the type of work's one line, after the trades,
as Trello did. Saving it renames the project (`refreshProjectTitle`). The API
and the MCP tools return `workNote` and take it on create and update.

**The import.** What "Art der Arbeit" names that matches no trade becomes the
work note — only while the project's note is empty, like the other fields the
import fills in. The import no longer appends "Art der Arbeit: …" to the
description; the next sync writes the card's own description again, without
that line, and the words land in the note (or in the trades, where the matcher
now knows them).

**The matcher** (`src/lib/trello-fields.ts`):

- `splitWorkTypes`: a word cut short with a hyphen belongs to the one after it
  ("Innen- und Außenputz" is one entry, Putz — it used to leave "Innen-"
  over); pieces without a letter are dropped.
- New office words: spachtel → Malern; ausbau, rigips → Trockenbau; flies,
  parkett → Bodenbeläge; fugenl., stucco → Fugenloses Bad (not with "boden":
  a seamless floor is the floor's); any "…schaden", komplett, alles, divers →
  Renovierung, only where nothing else is named.
- An entry that starts with one trade's name no longer hides the next one:
  "Putz- und Malerarbeiten" is Putz and Malern, "WDVS Fassade" WDVS and
  Außenfassade. A trade's name written whole is that trade alone.

**A new trade, "Fugenloses Bad"** (EN "Seamless bathroom", indoors), added by
the migration after the trades there are, only where no trade of that name
exists; a fresh database gets it from `prisma/seed-data.json`.

**On the client's Trello data of 2026-10-17** (the 778 cards linked to
projects): 424 have "Art der Arbeit". 403 of them now get at least one trade
(393 fully, 10 with words left for the note), 21 get only a note; 9 are a
seamless bathroom. 29 distinct leftover words in 32 uses go into notes.

Migration `20261031170000_project_work_note`: adds `Project.workNote`; inserts
"Fugenloses Bad". No name changes — nobody has a note yet; the sync fills them
and renames the projects concerned.

Touched in part 2: `prisma/schema.prisma`, `prisma/seed-data.json`, the
migration; `src/lib/project-title.ts`, `src/lib/project-title-db.ts`,
`src/lib/trello-fields.ts`, `src/lib/trello/import.ts`,
`src/lib/board-cards.ts`, `src/lib/api-service.ts`, `src/lib/mcp-catalog.ts`;
`src/app/(admin)/projects/actions.ts`, `project-form.tsx`, `page.tsx`,
`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/project-detail.tsx`,
`[id]/card-fields-grid.tsx`; `messages/de.json`, `messages/en.json` (new:
`projects.workNote`, `workNotePlaceholder`, `cardField_workNote`; changed:
`nameFromCustomer`); `docs/API.md`; tests `tests/unit/trello-fields.test.ts`,
`tests/unit/project-title.test.ts`, `tests/db/project-title.test.ts`,
`tests/db/trello-work-note.test.ts` (new).

## Part 3: what is no work, and Wattro's names

**No work, no name.** The client's boards also hold cards that are no job on a
site — its own marketing and organisation, filed under "Art der Arbeit" values
that became trades: "Lead Anzeige", "Kundengewinnung (SM)", "Kundengewinnung
(B2B)", "Mitarbeitergewinnung", "Systematisierung", "Beispiele/Inspirationen
(Teilnehmer Edition)". Those stay on their projects, as labels, but no longer
name them: `NOT_WORK` in `src/lib/project-title.ts` (a part of the name, any
case: lead, anzeige, gewinnung, systematisier, beispiel, inspiration) is left
out of the trades and the work note in the title. A project with nothing else
keeps its old title. The Trello matcher drops such words instead of keeping
them as a work note (`matchTrades`). "Gestaltung / Technik" and "Individuell"
count as work; no project carries them today.

On the real-data copy (01.11.2026, 790 projects): 12 projects were named
after one of them before, 0 after. Afterwards every name equals what the code
works out; checked inside a transaction that was rolled back.

Migration `20261103090000_project_title_not_work` names the projects that carry
such a trade (or a note that says one) again, the same way the code does —
`tests/db/project-title.test.ts` runs the migration and checks that
`refreshProjectTitles` finds nothing left to change.

**Wattro keeps its names.** Production sends projects to Wattro
(`WATTRO_PROJECT_PUSH=1`), and the crews pick their site there by name. A
project's name is now sent once, when it is made in Wattro: `projectPatch`
(`src/lib/wattro/projects.ts`) never sends `name`, so neither the migrations
(SQL, never sent) nor `refreshProjectTitles` (no longer pushes; part 1's
`pushProjectsInBackground` is gone) nor any later push renames a project Wattro
holds, adopted ones included. A new Projektnummer still renames the project's
ID there (`human_id`), and address, contact, phone and `finished` still follow.

Touched in part 3: `src/lib/project-title.ts` (`NOT_WORK`, `isWork`),
`src/lib/trello-fields.ts`, `src/lib/project-title-db.ts`,
`src/lib/wattro/projects.ts`, `src/lib/wattro/project-push.ts`, the migration,
`docs/CHANGE-wattro-project-push.md`; tests `tests/unit/project-title.test.ts`,
`tests/unit/trello-fields.test.ts`, `tests/unit/wattro-projects.test.ts`,
`tests/unit/wattro-project-push.test.ts`, `tests/db/project-title.test.ts`.

## Migration

`20261031160000_project_title_from_customer`:

1. adds `Project.sourceTitle`;
2. copies every project's `name` into it — nothing is lost;
3. sets `name` to "customer · trades" for every project that has a trade.
   Projects without a trade keep their name (= their old title).

Run with `npm run db:deploy` (never `db:migrate` against real data).

## Touched files

- `prisma/schema.prisma`, `prisma/migrations/20261031160000_project_title_from_customer/`
- `src/lib/project-title.ts` (new), `src/lib/project-title-db.ts` (new)
- `src/lib/trello-fields.ts` (office words for trades), `src/lib/trello/import.ts`
- `src/lib/api-service.ts`, `src/lib/mcp-catalog.ts`, `src/lib/mcp-tools.ts`
- `src/lib/wattro/project-push.ts` (`pushProjectsInBackground`, removed again in part 3)
- `src/lib/import-master-server.ts`
- `src/app/(admin)/projects/actions.ts`, `project-form.tsx`, `new/page.tsx`,
  `[id]/edit/page.tsx`, `[id]/project-detail.tsx`, `[id]/card-title.tsx`
  (new; replaces `[id]/editable-title.tsx`), `kanban.tsx`, `trade-picker.tsx`
  (new), `card-templates.tsx`, `board-keys.tsx`, `page.tsx`
- `src/app/(admin)/customers/actions.ts`, `src/app/(admin)/settings/actions.ts`
- `src/app/(admin)/reports/plan/actions.ts`, `src/app/(admin)/reports/plan/page.tsx`
- `src/app/(admin)/sites/page.tsx`
- `messages/de.json`, `messages/en.json` (new: `projects.formerTitle`,
  `projects.nameFromCustomer`, `projects.kanbanAddTrades`,
  `assistant.tools.list_trades`; gone: `projects.titleEdit`, `cardRename`,
  `keysRename`, `kanbanAddName`, `kanbanAddErrorName`, `templateCardTitle`,
  `copyName`)
- `docs/API.md`, `AGENTS.md`
- Tests: `tests/unit/project-title.test.ts`, `tests/unit/trello-fields.test.ts`,
  `tests/db/project-title.test.ts`

## Rollback

**Part 3 alone**: revert its commit, then refresh the names it changed (the
SQL cannot tell which names it set, so the code does it: saving a project, or
the next Trello sync). Nothing to undo in Wattro — it was not written to; after
the revert a push sends names again. The migration row may stay or go:

```sql
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261103090000_project_title_not_work';
```

**Part 2 alone** (the work note and "Fugenloses Bad"), after a backup:

```sql
-- The note back into the description, where the import used to write it.
UPDATE "Project" SET "description" = CONCAT_WS(E'\n\n', NULLIF("description", ''), 'Art der Arbeit: ' || "workNote")
WHERE "workNote" IS NOT NULL;
ALTER TABLE "Project" DROP COLUMN "workNote";
-- Only while no project carries it; otherwise leave it, it is a trade like any other.
DELETE FROM "WorkCategory" WHERE "id" = 'work-category-fugenloses-bad'
  AND NOT EXISTS (SELECT 1 FROM "ProjectWorkCategory" WHERE "workCategoryId" = 'work-category-fugenloses-bad');
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261031170000_project_work_note';
```

Then revert the part-2 commit and refresh the names (saving a project, or the
next Trello sync, does it per project).

**Everything:**

1. Revert the code: `git revert <merge commit>`.
2. Put the old names back and drop the column — on each database, after a
   backup:

   ```sql
   UPDATE "Project" SET "name" = "sourceTitle" WHERE "sourceTitle" IS NOT NULL;
   ALTER TABLE "Project" DROP COLUMN "sourceTitle";
   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261031160000_project_title_from_customer';
   ```

   (Part 2 first, as above, where it was deployed.)

   Projects made after the change have no old title; they keep "customer ·
   trades" as their typed name, which can be edited again once the form is back.
3. Trades the sync added from "Art der Arbeit" stay on the projects — they are
   correct data. To take them away too, compare `ProjectWorkCategory` with a
   backup from before the deploy.
4. Wattro: since part 3 no project there was renamed, so there is nothing to
   put back. (Before part 3, a refreshed name was sent; on a database that ran
   part 1 without part 3, the next push after the rollback sends the old name
   again.)
