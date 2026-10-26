# Trello re-sync — runbook

How the client's Trello boards are brought into BauCrew again, as often as
needed until the cutover, without doubling anything. Written so that somebody
who has never done it can follow it. No customer names, card texts or key
values belong in this file.

## 0. What you need

- **The Trello import app** (a Power-Up registered under the client's
  Trello workspace at trello.com/power-ups/admin, "Trello Auth"). It gives an
  **API key** and a **token**. The token is a personal one for the account
  that created it, read *and* write; the import only ever reads.
- **Where key and token live:** in `.env` as `TRELLO_API_KEY` and
  `TRELLO_TOKEN` — on the owner's Mac for pulling, on the server only for the
  file step (section 4) and only for as long as that step runs. Never in git,
  never in the checklist, never in a chat.
- `local/trello-boards/` on the owner's Mac: one JSON file per board. `local/`
  is git-excluded (`.git/info/exclude`); it holds real client data.
- An admin login on the BauCrew instance you import into.

## 1a. The server does it (since 1.53.0)

With `TRELLO_API_KEY` and `TRELLO_TOKEN` in the server's `.env`, **Einstellungen
→ Trello** lists every board of the account. Switch a board on and the server
pulls it from the API and runs the importer by itself: every
`TRELLO_SYNC_INTERVAL_MINUTES` (60 by default) and on *Jetzt abgleichen*, then
the files, a few rounds per run. Nothing is uploaded and nothing mapped: the
lists become the board's columns, a list's status comes from its name (the
rule in `suggestStatus`), and a board whose cards name no customer and carry
no job number files under one customer. Per board the page offers: the
customer rule (read off the cards / one per card / all under one), archived
cards, the board with its columns. A list can still be pinned to a status in
the row's `listStatus` (`{"<list id>": "QUOTED"}`), by SQL for now.

The sync runs the boards in the order Trello lists them. Where a job number
stands on two boards, switch the site board on first and let it run once
before the sales board, as section 2 explains. Sections 1 to 4 below are the
hand path for a board the account does not see, or for a copy of production.
On the day Trello is frozen: switch every board off, remove the two lines from
`.env`, `docker compose up -d`, delete the Trello app (section 6).

## 1. Pull the boards by hand

```bash
node --env-file=.env scripts/trello-pull.mjs --dry   # lists the boards, writes nothing
node --env-file=.env scripts/trello-pull.mjs         # all boards → local/trello-boards/<slug>.json
node --env-file=.env scripts/trello-pull.mjs kundenmanagement-prozess   # one board, by slug, id or short link
```

Each file is the board as Trello's own "Export as JSON" gives it (lists,
cards, Power-Up fields, attachments, checklists, members, labels) **plus every
comment**, paged back through the API with `before=` — Trello's own export
stops at the last 1,000 actions. The importer reads both shapes the same way.
A board renamed in Trello still lands in the file its id had before.

Only GET requests are made. Nothing in Trello changes.

## 2. Import a board

Settings → *Import aus Trello*, one board file at a time. Order matters where
a job number appears on two boards: **the site board first**, then the sales
board, then the subcontractor board. The first card bearing a number claims a
project that so far was known by its number alone (section 5).

| Board (Trello name) | Lists → status | Archived cards | Board | One customer |
| --- | --- | --- | --- | --- |
| Aktuell laufende Baustellen | the suggestions; the closed list to any status, else its archived cards are skipped | on | on | off |
| Kundenmanagement Prozess | the suggestions; set *Angebot Bestätigt* and *Auftrag bestätigt …* to **Approved**, the closed lists to **Lead** / **Approved** | on | on | off |
| SUB Unternehmer Aufträge | every list **Approved** (the lists are the subcontractors) | on | on | off |
| Zubearbeiten, Betriebsablauf/Checklisten, Preislisten | any status | on | on | **on** |
| The applicant boards | — not without the client's decision: third-party personal data (checklist #31) | | | |

Leave *Felder*, *Checklisten* and *Kommentare* ticked. *Checklisten als
Vorlagen* only on the first import of a board whose checklists you want as
templates.

After the SUB board, mark its projects as subcontractor jobs once (the import
does not set the flag):

```sql
UPDATE "Project" p SET "isSub" = true
FROM "ProjectLink" l, "BoardColumn" c, "Board" b
WHERE l."projectId" = p.id AND l.system = 'trello' AND c.rule = 'trello:' || l."externalListId"
  AND c."boardId" = b.id AND b.name = 'SUB Unternehmer Aufträge' AND NOT p."isSub";
```

The import page ends with counts: created, updated, customers, comments,
attachments kept as links, columns added, members it could not match (make
those employees and run the board again to assign them).

## 3. What a second import does

Matching, in this order: the card's own link (`ProjectLink`, system
`trello`); else a project of the same job number (`Project.externalId`) that
**no card is linked to yet**; else a new project. A project linked to another
card of the same number is left to that card — the new card gets a project of
its own, as Trello has two cards. A project of the same *name* that no import
made is never touched.

| Overwritten from the card, every time | Filled only where empty here | Never touched |
| --- | --- | --- |
| status (from the list), name, description, Trello link, source date, due day, start day, board position, archived state, the card's list | price, address, execution wish, site-visit date, customer number, trades from the fields | planned end (except the one old imports wrote from the due day), everything typed into other fields, schedule, team added here, files uploaded here, notes written here |
| the customer, where the card names one (the project moves to it; a customer the title guessed is removed once empty and never edited) | | |

Comments are matched by their Trello time, checklists by name, attachments
by URL or file name — none is written twice. Cards deleted in Trello stay
here (no tombstones; checklist #30).

## 4. Fetch the files on the server

The board file names the attachments; Trello hands the files only to a known
account. On the server, once per cutover:

1. Put `TRELLO_API_KEY` and `TRELLO_TOKEN` into the server's `.env`
   (`docker-compose.yml` passes them through) and `docker compose up -d`.
2. Run the imports (section 2), then press **Dateien abholen** on the import
   page and leave the tab open. The files come in rounds of 20, roughly 30
   files a minute; a file Trello refuses stays as a link on its card.
3. Remove the two lines from `.env`, `docker compose up -d` again.
4. In Trello, delete the app (trello.com/power-ups/admin → the app → *App
   löschen*): that revokes key and token. Create a new app for the next run if
   one is needed.

## 5. Verify

Before and after every import, the same counts (replace the container name;
on the server `docker compose exec -T db psql -U baucrew -d baucrew -At -c "…"`):

```sql
select 'projects='||count(*) from "Project" union all
select 'projects_trello='||count(*) from "Project" where "externalSystem"='trello' union all
select 'projects_other='||count(*) from "Project" where "externalSystem" is distinct from 'trello' union all
select 'trello_links='||count(*) from "ProjectLink" where system='trello' union all
select 'by_number_only='||count(*) from "Project" p where p."externalSystem"='trello'
  and not exists (select 1 from "ProjectLink" l where l."projectId"=p.id and l.system='trello') union all
select 'doubles='||count(*) from (select "externalId" from "Project" where "externalSystem"='trello'
  group by 1 having count(*) > count(distinct "externalId")) d union all
select 'customers='||count(*) from "Customer" union all
select 'users='||count(*) from "User" union all
select 'schedule_entries='||count(*) from "ScheduleEntry" union all
select 'notes='||count(*) from "Note" union all
select 'documents='||count(*) from "Document" union all
select 'files_pending='||count(*) from "CardLink" where url like 'https://trello.com/1/cards/%/download/%';
```

What must hold: `projects_other`, `users`, `schedule_entries` unchanged;
`by_number_only` 0 after the site board; `doubles` 0; a second import of the
same file creates 0 projects and 0 customers.

Proven on 2026-10-17 on a copy of the production database of 10 Oct (224
projects, 208 of them from Trello, 131 known by number only, 77 links): after
the three boards 658 projects, 642 from Trello and every one linked to its
card, 0 known by number only; the 16 hand-made projects, the 77 schedule
entries and the 7 users byte-for-byte as before; 555 customers, 1,390 notes,
2,061 attachment links. The second run of the site board and the sales board
created 0 projects and 0 customers and left every count the same. The DB
test `tests/db/trello-import.test.ts` keeps those rules.

`doubles` counts job numbers shared by several projects. A number that stands
on two cards (an offer archived and the job made anew) gives two projects on
purpose; 9 such numbers were on the boards on 2026-10-17. A number twice with
the *same* card would be a fault.

## 6. Cutover

On the day BauCrew becomes the system of record:

1. Tell the office: Trello is frozen from now on, nothing is typed there any more.
2. Pull (section 1), import every board in order (section 2), fetch the files (section 4).
3. Verify (section 5), take a backup of database and files.
4. Remove key and token from the server, delete the Trello app.
5. No further import. A later import would bring back what was deleted here
   since, and move projects back to the Trello state.
