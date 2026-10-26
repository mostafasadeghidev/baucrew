# Change: the server brings the Trello boards in by itself

**Date:** 2026-10-17 · **Release:** 1.53.0

## What changed

While the office still works in Trello, the app has to follow it, as often as
needed and without anybody uploading files or mapping lists. Now the server
does it, the way the Wattro sync reads Wattro: with the Trello key on the
server, *Einstellungen → Trello* lists every board of the account; a board
switched on is pulled from Trello's API and run through the importer by the
server — every `TRELLO_SYNC_INTERVAL_MINUTES` (60 in production) and on the
button — and the files the cards carry are fetched afterwards, a few rounds
per run. One way only, Trello → BauCrew.

Nothing is mapped by hand: the lists become the board's columns (the mirror
columns of `docs/CHANGE-trello-list-columns.md`), a list's status comes from
its name by the same rule the wizard proposes (`suggestStatus`), and a board
whose cards name no customer and carry no job number files under one customer
named after the board. The page offers per board: on/off, the customer rule
(read off the cards / one per card / all under one), archived cards, the board
with its columns. The file wizard stays for a board the account does not see.

## Files

- `src/lib/trello/import.ts` — **new**: the importer itself, moved out of the
  wizard's server action unchanged in what it does (`runTrelloImport`,
  `importSummary`); `userId` is null for the timer.
- `src/app/(admin)/settings/import-trello/actions.ts` — the wizard reads its
  form and calls `runTrelloImport`; `PreviewState.done` carries the result.
- `src/lib/trello/pull.ts` — **new**: Trello's API, read only — the boards of
  the account, one board as the export shape with every comment paged.
- `src/lib/trello/sync-options.ts` — **new**, pure: the importer options a
  board runs with (statuses by name, pins, the customer rule off the cards).
- `src/lib/trello/auto-sync.ts` — **new**: discover the boards into
  `TrelloSyncBoard`, run the ones switched on, fetch files, audit
  (`trello.sync`), the due check (reuses `src/lib/wattro/schedule.ts`).
- `src/lib/trello/timer.ts` — **new**, started from `src/instrumentation.ts`.
- `src/lib/trello-files.ts` — `fetchTrelloFiles` takes a null user.
- `prisma/schema.prisma`, `prisma/migrations/20261017180000_trello_sync_board/`
  — **new table** `TrelloSyncBoard` (one row per board of the account).
- `src/app/(admin)/settings/trello/{page,actions,sync-button}.tsx` — **new**
  page; `src/app/(admin)/settings/page.tsx` links it.
- `messages/de.json`, `messages/en.json` — namespace `trelloSync`.
- `tests/unit/trello-sync-options.test.ts`, `tests/unit/trello-auto-sync.test.ts`.
- `DEPLOYMENT.md`, `.env.example`, `docs/TRELLO-RESYNC.md` §1a, `AGENTS.md`.

## Rollback

1. Delete the files marked **new** above and the `TrelloSyncBoard` model; the
   migration is additive — leave it, or drop the table by hand
   (`DROP TABLE "TrelloSyncBoard"`).
2. Restore the wizard's `actions.ts` from before this change (the importer
   body moves back into `importTrello`), or keep `src/lib/trello/import.ts`
   and only remove the page and the timer — the refactor alone changes
   nothing a user sees.
3. Remove the two `startTrelloTimer` lines from `src/instrumentation.ts`, the
   `trelloSync` namespace from both message files and the link on the
   settings page.
