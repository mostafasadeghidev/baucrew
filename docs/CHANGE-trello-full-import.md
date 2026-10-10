# Trello import: everything a card carries

The Trello import (Settings → Import from Trello) used to bring a card's
title, description, list, due day and a line of labels. It now brings what the
board export holds, so a Trello board can be moved over whole and the import
run again at any time without doubling anything. Nothing is ever written to
Trello: the import reads a file, and the file step only downloads.

## What comes over

| In Trello | Here |
| --- | --- |
| Card, its list | Project, `ProjectLink` with the list (`externalListId`) |
| Board and its open lists | A board of the same name, one mirror column per list (optional) |
| Archived card | Archived project (`archivedAt` = Trello's `dateClosed`) |
| Place in the list | `boardPosition` |
| Due day | `dueDate` (was `plannedEnd`; a project whose planned end is exactly the old import's due day is put right on the next import) |
| Start day | `plannedStart` |
| Amazing Fields: Kundenname, Kundennummer | The customer (found by number, then by name; made if missing) |
| Amazing Fields: Auftragswert | `price` |
| Amazing Fields: Baustellenadresse | `street`, `postalCode`, `city`, and the town's place on the map (looked up once per town) |
| Amazing Fields: Ausführungswunsch, Termin Besichtigung, Erstellungsdatum | `executionWish`, `inspectionDate`, `sourceCreatedAt` (the date field only; typed text falls back to the card's own creation time) |
| Amazing Fields: Art der Arbeit | The trades it names, matched by either name (`matchTrades`); a word no trade answers to is a line in the description |
| Labels | Trades (`WorkCategory`), added where missing |
| Members | Team (`ProjectEmployee`), by the employee's full name; names nobody answers to are listed after the import |
| Checklists | `ProjectChecklist` with items (ticked → in order, `checkedAt` set; due day and assignee kept); one of the same name already on the project is left alone |
| Comments | `Note`, office-only (`visibility: MANAGEMENT`), at Trello's time, the Trello author as a bold prefix where no user matches; told apart from one already here by that time |
| Attached web addresses | `CardLink` |
| Attached files | `CardLink` to Trello first, then `Document` (`source: 'trello'`) once fetched; the card's cover is set from Trello's |

The fields are read by `src/lib/trello-fields.ts`: a field is known by its
name, folded (umlauts undone, spaces dropped, a few synonyms), so a board
that defines the same field twice reads as one; a list field's option ids
become the option texts; a typed amount is read with the German thousands
dot (`src/lib/amount.ts`); texts are capped at 200 characters.

## Options in the wizard

- **Archivierte Karten** (on): closed cards too, as archived projects.
- **Board anlegen** (on): a mirror column per open list on a board of the
  Trello board's name.
- **Ein Kunde** (off): a board that holds no customer jobs (price lists,
  applicants) files every card under one customer named after the board.
- **Felder übernehmen** (on, shown when any card has fields), **Checklisten**
  (on), **Kommentare** (on): each part of a card comes along only where
  ticked.
- **Checklisten als Vorlagen** (off): one `ChecklistTemplate` per checklist
  name across the imported cards, with every item that name ever had; a
  template of the same name already there is left alone.

## The second import

A card's own line — status, name, description, list placement, due and start
day, position, archive state — follows Trello on every import. What the
fields put into a project (price, address, Ausführungswunsch, Termin
Besichtigung, trades) fills a **new** project whole, but an **existing**
project only where the column is still empty; trades are added, never taken
away. So what the office has typed into BauCrew since the last import
stays. Checklists, comments, links and columns are told apart from what is
already there, as above, and are never doubled.

## Two things the export cannot do

1. **Old comments.** Trello's own export holds the last 1000 actions of a
   board. For a board with more history, put the file together from the API:
   the board's export with its `actions` replaced by every `commentCard`
   action (`GET /1/boards/{id}/actions?filter=commentCard&limit=1000&before=…`,
   paged). The importer reads both shapes the same way.
2. **The files themselves.** The export names them; Trello hands them only to
   a known account. Set `TRELLO_API_KEY` and `TRELLO_TOKEN` (a read-only token
   is enough) and press "Dateien abholen" after an import. Until then every
   file is a link to Trello on its card; a file Trello refuses stays one.

## Files touched

- `src/lib/trello.ts` — the parser reads members, checklists (board-level,
  with each card's id), comments, attachment details, cover, archive date,
  position, lists in the board's order; `trelloDownload`,
  `checklistTemplatesOf`.
- `src/lib/trello-fields.ts` — the one Amazing-Fields parser (LZ-compressed
  Power-Up data, package `lz-string`): `powerUpFields`, `cardFields`,
  `splitAddress`, `matchTrades`, `hasFields`.
- `src/lib/amount.ts` — `parseAmount`, a typed sum of money.
- `src/lib/trello-files.ts` — pending files, fetching them in rounds.
- `src/app/(admin)/settings/import-trello/actions.ts` — the import writes all
  of the above; `fieldData` (fill only where empty); `mirrorBoard`; the
  templates; `fetchTrelloFilesAction`.
- `src/app/(admin)/settings/import-trello/import-wizard.tsx` — the options
  above, counts, the file step.
- `messages/de.json`, `messages/en.json` — `importTrello.*`.
- `tests/unit/trello.test.ts`, `tests/unit/trello-fields.test.ts`.
- `package.json` — `lz-string`.

No migration (the `ProjectLink.externalListId` column belongs to
`docs/CHANGE-trello-list-columns.md`).

## The file step on a server

`TRELLO_API_KEY` and `TRELLO_TOKEN` are read from the environment only. Both
are documented in `.env.example` and passed through by `docker-compose.yml`
(`${TRELLO_API_KEY:-}` / `${TRELLO_TOKEN:-}`, empty when unset, which every
reader treats as "not configured"). Set them for the import window only and
revoke the token afterwards — or fetch the files locally and copy them into
the files volume. `DEPLOYMENT.md` lists the optional variables.

## Rollback

1. `git revert` the commit (or drop the working-tree changes) and
   `npm uninstall lz-string`.
2. Data an import of this kind brought stays valid without the code. To take
   it out again: `DELETE FROM "Note" WHERE "authorId" IS NULL AND visibility = 'MANAGEMENT' AND "projectId" IN (SELECT "projectId" FROM "ProjectLink" WHERE system = 'trello');`
   removes the comments without an author here; `DELETE FROM "CardLink" WHERE url LIKE 'https://trello.com/1/cards/%';`
   the file links; `DELETE FROM "BoardColumn" WHERE rule LIKE 'trello:%';` the
   mirror columns (see `docs/CHANGE-trello-list-columns.md`).
