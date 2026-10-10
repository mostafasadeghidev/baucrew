# Trello lists as board columns (mirror rule)

A board here can carry a Trello board list for list: a column per Trello
list, the same names in the same order. A column is still a status — but a new
kind of rule binds it to one Trello list, and a card stands in the column of
the list its Trello card is in.

## What changed

- **`prisma/schema.prisma`** — `ProjectLink.externalListId String?`: where the
  record stands in the source system (the Trello list a card is in).
  Migration `20261002090509_project_link_external_list_id`.
- **`src/lib/board-rules.ts`** — rule strings may now be `trello:<list id>`
  beside the four fixed rules. `trelloRuleId` reads the id, `ruleMatchesRaw`
  matches it against the new `RuleFacts.trelloListId`, `columnFor` and
  `dropPatch` work on raw rule strings (a drop into a mirror list keeps the
  card's list, a drop out clears it; the id itself lives on the link, not the
  project).
- **`src/lib/board-query.ts`** — the SQL of a mirror column:
  `links: { some: { system: 'trello', externalListId } }`; a board's plain
  columns are recognised by `rule === null` now, not by "no fixed key".
- **`src/lib/card-move-places.ts`** — rows carry `trelloListId` into the facts.
- **`src/app/(admin)/projects/page.tsx`**, **`src/app/(admin)/projects/@modal/(.)card/[id]/page.tsx`** —
  both load the Trello link for the facts and hand raw rules to drops; a
  mirror column's label is its own title.
- **`src/app/(admin)/projects/actions.ts`** — `moveCard` keeps the mirror id on
  the link, `applyListRule` sets it for a card created in a mirror list,
  `addColumn` accepts `trello:<id>` rules.
- **`src/lib/boards-db.ts`**, **`src/app/(admin)/settings/boards/page.tsx`** —
  a mirror column counts as a rule column (the settings form must not delete
  it), and a mirror column may sit over any status.
- **`src/app/(admin)/settings/import-trello/actions.ts`** — the import writes
  the card's list onto the link.
- **`messages/de.json` / `messages/en.json`** — `rule_trello` ("Trello-Liste").

## Data

The mirror columns and the `externalListId` values are written by the Trello
import itself (`docs/CHANGE-trello-full-import.md`, option "Board anlegen"):
one column per open list of the imported board, `trello:<list id>` as its
rule, and each card's list on its project's link. The first import of this
kind set up three boards with 33 mirror columns from 32 distinct lists and
608 linked projects; the file is only a matter of counts here — no names from
the boards go into the repository.

## Rollback

1. `git revert` the commits of this change (or drop the working-tree changes).
2. `DELETE FROM "BoardColumn" WHERE rule LIKE 'trello:%';`
3. `UPDATE "ProjectLink" SET "externalListId" = NULL;`
4. The `externalListId` column may stay (harmless) or go via a new migration.
   Reversing steps 1–3 returns the board to plain status columns; imported
   projects remain and stand in the plain columns of their status.
