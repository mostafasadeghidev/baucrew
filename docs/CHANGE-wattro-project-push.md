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
one (76 → 77). It was not deleted: it stays in Wattro as a finished project
(Wattro id 77) and can be removed by hand there. The app's database side
(links, audit, catch-up) is covered by mocked tests; it has not run against a
real database yet.

## Touched files

- `src/lib/wattro/projects.ts` — new (pure: which projects, the payload, the diff)
- `src/lib/wattro/project-push.ts` — new (create / adopt / update, queue per
  project, audit, catch-up)
- `src/lib/wattro/client.ts` — `isProjectPushEnabled`, `fetchProjectByHumanId`,
  `createWattroProject`, `patchWattroProject`
- `src/lib/wattro/timer.ts` — the catch-up every 15 minutes
- `src/lib/project-events.ts` — calls the push after created / status / updated
- `.env.example`, `docker-compose.yml`, `DEPLOYMENT.md`, `AGENTS.md`
- Tests: `tests/unit/wattro-projects.test.ts`,
  `tests/unit/wattro-project-push.test.ts`, `tests/unit/wattro-client.test.ts`

## Rollback

Unset `WATTRO_PROJECT_PUSH` (or set it to anything but `1`): nothing is written
any more. To remove the code: revert the commit. Projects already created in
Wattro stay there (delete them in Wattro by hand if wanted); their
`ProjectLink` rows with `system = "wattro"` are harmless, and the two
`AppSetting` keys are too.
