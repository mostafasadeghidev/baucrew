# CHANGE: Projects written to Wattro

## What changed

Until now Wattro was only read (`CHANGE-wattro-devices.md`). Wattro also has
projects — the sites a machine is booked to; the crews pick one in the Wattro
app when they take a tool out. A project made in this app now reaches Wattro
by itself, so nobody types it twice.

- **Off unless `WATTRO_PROJECT_PUSH=1`** (and a key and base URL are set).
  Reading and writing are separate switches.
- **Which projects**: a project is *created* in Wattro when it is created or
  moved to a status of APPROVED, PLANNED or IN_PROGRESS (`PUSH_STATUSES` in
  `src/lib/wattro/projects.ts`). Leads and offers stay out (the app holds
  hundreds; Wattro's project list is what the crews scroll through). A plain
  edit never creates a project in Wattro; it only updates one that is there.
- **Identity is the project number**: the client's Projektnummer when the
  project has one (`docs/CHANGE-project-job-number.md`), the app's own number
  (`2026-0804`) otherwise → Wattro's `human_id` (50 characters, unique). When
  the number changes, the same Wattro project is renamed, found by the Wattro
  id kept in the link. A project Wattro already holds
  under that number is *adopted*, never created twice. Names never match.
  The link is stored as a `ProjectLink` with `system = "wattro"` and Wattro's
  numeric id — no migration.
- **What travels**: name (100 characters), number, address ("Straße, PLZ Ort"),
  contact, phone (left out when longer than Wattro's 20 characters) and
  `finished` (true for completed, invoiced, paid, cancelled or archived).
  Never: price, offers, internal notes, customer data. A field somebody filled
  in Wattro is not emptied by an empty field here.
  The name is sent only when the project is made in Wattro; afterwards Wattro
  keeps it (since `CHANGE-project-title-from-customer.md` part 3 — names here
  became "Kunde · Leistung", and the crews know their sites by the old ones).
- **Never destructive**: only `POST /project/` and `PATCH
  /project/by_human_id/{number}`. No delete, no `PUT`, nothing about machines,
  hand-outs or people. Finishing a job marks it `finished`; it is not removed.
- **A save never waits for Wattro and never fails because of it.** The push
  runs in the background after the project event; a failure lands in the audit
  log (`project.wattroPushFailed`) and the server tries again every 15 minutes
  — but only for projects created after the switch was first turned on
  (`AppSetting wattro.projectPushFrom`). The roughly 230 approved/planned/
  running jobs that exist today are *not* sent by themselves; that backfill is
  a deliberate, separate step.
- Writes are not retried inside a request (a repeated POST could book twice);
  the push looks the number up first, so a repeat finds what is there.
- Not done: the project manager (`employee_id`) — Wattro's employees are
  matched by id, ours by name; and Wattro → app (a project made in Wattro does
  not appear here).

## Verified against the client's Wattro (19.10.2026)

One test project, `TEST-WATTRO-MUSTER` ("Testprojekt test-wattro-muster –
bitte ignorieren"), was created through the same client and mapping code,
read back, renamed and given a new address with one PATCH, and marked
`finished`. Wattro kept every field as sent; the project count grew by exactly
one. It was not deleted: it stays in Wattro as a finished project
(Wattro id 77) and can be removed by hand there. The app's database side
(links, audit, catch-up) is covered by mocked tests; it has not run against a
real database yet.

## Backfill of existing projects (24.10.2026)

The automatic push sends new projects and projects moved into Beauftragt,
Geplant or In Ausführung. The ones that existed before it were left out on
purpose: the crews had made many of their sites in Wattro by hand, and sending
everything would have doubled them. `scripts/wattro-backfill-projects.mjs` sends
a **hand-picked list** of existing projects:

- Dry run by default (writes nothing); `--apply` creates them. At most 15 per
  run; only the projects named (`--keys=` takes Projektnummern, or the app's
  number where a project has none).
- Skips a project that is not one the push creates, is already linked, whose
  number Wattro already holds, or that **looks like a project Wattro already
  has** (same name, or two words in common) — whether it is the same site is a
  person's call. Only `POST /project/` is ever written; each created project
  gets its Wattro link and an audit entry (`project.wattroPush`,
  "backfill created <number>").
- Runs inside the production container (its own DATABASE_URL, WATTRO_*):
  `docker cp` the file in, `docker compose exec -T app node …`. The field
  rules are a copy of `src/lib/wattro/projects.ts`; `tests/unit/wattro-backfill-script.test.ts`
  keeps the two the same. Tried end to end on a throwaway database against a
  fake Wattro server.

## Jobs moved in Trello reach Wattro too (10.11.2026)

The client reported that running sites did not arrive in Wattro. The push hung
on the app's own project events (a form saved, a card dragged on the app's
board). The Trello sync writes a card's list straight into the project and
tells nobody — and the office still works in Trello, so nearly every job
became "In Ausführung" that way and Wattro never heard of it. Only projects
*new* since the switch got through, by the catch-up timer.

- **The sync hands over what it moved** (`runTrelloImport` → `pushImportedProjects`
  in `src/lib/wattro/project-push.ts`, rule `wattroChangeOf` in
  `src/lib/wattro/projects.ts`): a project whose status the run changed is
  sent like one moved in the app — created when the new status is Beauftragt,
  Geplant or In Ausführung, marked finished when a site Wattro has is done.
  A site Wattro has also hears of a new number, address, contact or phone and
  of being archived. Audit: `project.wattroPush`, "import created <number>".
- **Still not sent by itself**: a project whose status stood still. The stock
  from before stays a hand-picked backfill (above) — this change sends what
  moves from now on, nothing retroactively.
- **A whole list moved at once is held back**: more than 20 new sites out of
  one run (`MAX_CREATED_PER_IMPORT`) is a list given another status or a board
  read anew, not somebody moving cards. None of them is created; the audit log
  gets `project.wattroPushHeld`. Send them with the backfill script after a
  look.
- **A failed push of an older project is tried again**: the catch-up timer
  also takes projects whose push failed within the last 7 days
  (`project.wattroPushFailed`), not only projects created since the switch.
  Not retried, as before: a failed *update* of a site Wattro already has.
- Rollback of this part: revert the commit; the push falls back to the app's
  own events.

## The stock sent, the old hand-made sites closed (12.11.2026)

The client decided: every job from Beauftragt on belongs in Wattro, a double
with a site the crews made by hand is accepted for a while, and the old
hand-made sites with no machine on them leave the crews' list.

- **`--allow-similar` on the backfill script** sends a project although Wattro
  has a look-alike, and names it (`NOTE …`). Needed for the doubles the client
  accepted — and because projects are named after the customer and the trades
  since 1.58.0: two trades in common ("Malern", "Putz") already count as a
  look-alike, also of a site an earlier run created. Without the flag nothing
  changes.
- **`scripts/wattro-close-sites.mjs`** marks a hand-picked list of Wattro
  sites finished (`--numbers=P4,P6`, Wattro's IDs; dry run by default,
  `--apply`, at most 15 per run). It leaves a site alone that is finished
  already, that a project here is linked to (the app says when its own sites
  are done), or that has a machine booked to it (`unfinished_deployment_count`,
  read again right before the write; unknown counts as "has one"). Only
  `PATCH … { finished: true }` is written; each closed site gets an audit
  entry (`wattro.siteClosed`). Nothing is deleted, the bookings stay in the
  site's history. Runs like the backfill script, inside the container.
- Rollback of this part: open the project again in Wattro (the API takes
  `finished: false` the same way); the scripts change nothing by being there.

## Touched files

- `src/lib/wattro/projects.ts` — new (pure: which projects, the payload, the diff)
- `src/lib/wattro/project-push.ts` — new (create / adopt / update, queue per
  project, audit, catch-up)
- `src/lib/wattro/client.ts` — `isProjectPushEnabled`, `fetchProjectByHumanId`,
  `createWattroProject`, `patchWattroProject`
- `src/lib/wattro/timer.ts` — the catch-up every 15 minutes
- `src/lib/project-events.ts` — calls the push after created / status / updated
- `src/lib/trello/import.ts` — hands what a run moved to the push (10.11.2026)
- `.env.example`, `docker-compose.yml`, `DEPLOYMENT.md`, `AGENTS.md`
- `scripts/wattro-backfill-projects.mjs` (24.10.2026, `--allow-similar`
  12.11.2026), `scripts/wattro-close-sites.mjs` (12.11.2026), with
  `tests/unit/wattro-backfill-script.test.ts` and
  `tests/unit/wattro-close-sites-script.test.ts`
- Tests: `tests/unit/wattro-projects.test.ts`,
  `tests/unit/wattro-project-push.test.ts`, `tests/unit/wattro-client.test.ts`,
  `tests/db/trello-import.test.ts`

## Rollback

Unset `WATTRO_PROJECT_PUSH` (or set it to anything but `1`): nothing is written
any more. To remove the code: revert the commit. Projects already created in
Wattro stay there (delete them in Wattro by hand if wanted); their
`ProjectLink` rows with `system = "wattro"` are harmless, and the two
`AppSetting` keys are too.
