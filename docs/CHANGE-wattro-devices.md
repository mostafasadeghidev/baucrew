# CHANGE: Wattro device sync (first stage, read-only)

## What changed

The Devices page can now read the customer's Wattro tool-tracking system.
Wattro is where the machines are managed in the field; until now the device
list in this app was hand-maintained and could drift from what the crews see
in Wattro. A management-only button, "Mit Wattro abgleichen", pulls every
Wattro asset (active and inactive) into the local device list:

- **Matched by identity, never by name.** A device already linked to Wattro
  (stored `externalSystem: "wattro"` + `externalId`) is refreshed by that id.
  A hand-filled device is *adopted* when its inventory number equals the
  Wattro "human id" — but only when exactly one unlinked row wears the number;
  ambiguous or already-owned numbers are reported as conflicts instead of
  guessed — and likewise when Wattro wears the same number on several
  machines. Names alone never match. Everything else is created as a new device
  with `source: "wattro"`.
- **Four fields are Wattro's**: name, inventory number, storage location,
  active. Everything else (category, notes, video link, the hand-outs) stays
  this app's own and survives every sync. Nothing is ever deleted; a device
  Wattro no longer sends simply stays.
- **The stamp moves only on success.** The last successful run is stored in
  `AppSetting` (`wattro.lastSyncAt`, `wattro.lastSyncResult`) inside the same
  transaction as the writes, so the Devices page always shows how fresh the
  list is, and a failed run leaves the old stamp standing.
- **Wattro is only ever read.** No hand-outs, returns, project or assignment
  changes travel to Wattro in this stage. Wattro's `current_assignment`
  (bare references, undocumented `assignee_type`) is kept on the record in
  memory for later phases but written nowhere.

The sync stays hidden until the server has an API key: `WATTRO_API_KEY`
(server-side environment variable, `.env`), optionally `WATTRO_BASE_URL`
(default `https://api-dev.wattro.io/api/v1`). See `.env.example`. Without the
key the Devices page shows "Wattro ist nicht eingerichtet" instead of the
button. Requests go through `src/lib/wattro/client.ts` only — bearer auth,
15 s timeout, bounded retries (429/5xx/network only), zod-validated responses,
key never logged. The writes run in one transaction (120 s limit, not
Prisma's 5 s) behind a Postgres advisory lock, so two office users clicking
at once write one after the other. The button and its server action are behind
`requireManagement`; runs are audited (`device.wattroSync` /
`device.wattroSyncFailed`).

The link itself needed no migration: `Device.externalSystem` / `externalId`
(unique together) and `Device.source` already existed. Showing what Wattro
knows (second stage, 06.10.) added one nullable column, `Device.externalData`
(migration `20261006130000_device_external_data`) — see below.

## Touched files

- `src/lib/wattro/assets.ts` — new (pure: types, field mapping, match
  planning, pagination walker, run-result types)
- `src/lib/wattro/client.ts` — new (server-only HTTP client: auth, timeouts,
  retries, zod validation, `WattroApiError`)
- `src/lib/wattro/sync.ts` — new (orchestration: both active states, one
  transaction, AppSetting stamp, `getLastSync`)
- `src/app/(admin)/devices/wattro-actions.ts` — new (`syncWattroDevicesAction`,
  office-only, audited)
- `src/app/(admin)/devices/wattro-sync-button.tsx` — new (client button with
  loading/result/error states; hidden with a hint when unconfigured)
- `src/app/(admin)/devices/page.tsx` — Wattro line (badge, last sync, button)
  and a Wattro badge on imported devices
- `src/lib/format.ts` — `formatDateTime` added (date-time variant of
  `formatDate`, same locale map, shown in the office's time zone
  `Europe/Berlin` — a moment, not a UTC calendar day)
- `messages/de.json`, `messages/en.json` — new `devices.wattro*` keys
- `.env.example` — `WATTRO_API_KEY` / `WATTRO_BASE_URL` placeholders
- `src/lib/wattro/details.ts` — new (pure: the stored shape of what Wattro
  knows, built from an asset plus the employee/project lists, read back
  checked; tab logic)
- `src/app/(admin)/devices/wattro-where.tsx`, `wattro-card.tsx` — new (the
  place icon and name; the "Aus Wattro" card on a device's page)
- `src/app/(admin)/devices/[id]/page.tsx` — Wattro card, Wattro's location
  first under "Wo ist es?"
- `prisma/schema.prisma`, `prisma/migrations/20261006130000_device_external_data/`
  — `Device.externalData Json?`
- Tests: `tests/unit/format.test.ts` (`formatDateTime`, `formatOfficeDate`,
  `officeDaysAgo`), `tests/unit/wattro-details.test.ts`,
  `tests/unit/wattro-assets.test.ts`,
  `tests/unit/wattro-client.test.ts`, `tests/unit/wattro-action.test.ts`,
  `tests/db/wattro-sync.test.ts`

## Rollback

1. `git revert` the commit that introduced this file (or check out
   `src/app/(admin)/devices/page.tsx`, `src/lib/format.ts`, `messages/*.json`
   and `.env.example` from the commit before it).
2. Delete the four new files under `src/lib/wattro/`, the four new files under
   `src/app/(admin)/devices/` (`wattro-actions.ts`,
   `wattro-sync-button.tsx`, `wattro-where.tsx`, `wattro-card.tsx`) and the
   five new test files.
   To drop only the second stage (the shown details) and keep the sync, see
   "Second stage" below.
3. Optionally remove the two `AppSetting` rows `wattro.lastSyncAt` /
   `wattro.lastSyncResult` (they are harmless if left). Devices imported or
   adopted by the sync keep their `externalSystem: "wattro"` marks; they are
   ordinary rows and need no cleanup unless Wattro import itself should be
   undone.

## Review fixes (30.09.2026)

Found in review before the first real sync; all pinned by tests.

- **Pagination stopped early** when a full page held an unusable record —
  the short-page check counted only valid records, so everything after that
  page was silently skipped. Now it counts what Wattro sent.
- **Retries had no pause**: a missing `Retry-After` header read as 0 s. Now
  the own backoff (0.5 s, 1.5 s) applies; a `Retry-After` above 30 s ends the
  run as "rate limited" instead of retrying early.
- **One free row could be adopted by two Wattro assets** sharing an inventory
  number (the second silently took the link). Now both are reported as
  conflicts.
- **An asset read in both lists** (switched off between the active and the
  inactive read) was counted twice or reported as a conflict; now its newest
  record wins. The `duplicateId` conflict reason is gone.
- **Optional asset fields left out** of Wattro's JSON (allowed by its spec)
  made the record invalid; now they read as "none", a missing `active` as
  Wattro's default `true`.
- **Transaction**: 120 s timeout instead of Prisma's 5 s, the local rows are
  read inside it, creates go in one `createMany`, an advisory lock serialises
  concurrent runs, and a database failure comes back as the `database`
  outcome (message `devices.wattroErrorDatabase`, audited) instead of an
  error page.
- **"Zuletzt abgeglichen" showed UTC**, 1–2 hours behind; now Berlin time.
- **DB test** used fixed Wattro ids 6001–6006 and its cleanup deleted any
  device with those ids (with their hand-outs) and the real sync stamp. It now
  uses random ids far above real ones and restores the stamp.
- The Wattro badges lost their all-caps letter-spaced style to match the
  neighbouring "inaktiv" badge.

## Second stage: everything Wattro knows, shown (06.10.2026)

The first stage imported four fields and threw the rest away, so the Devices
page said "im Lager" for every machine while Wattro knew 71 were with
employees and 33 on sites. Now every field Wattro sends about a machine is
stored and shown, read-only:

- **Sync** also reads Wattro's employee and project lists (`GET /employee/`,
  `GET /project/`, finished projects included) to turn the bare ids into
  names; store names come inline with the machines' home stores (Wattro has
  no store list). Of a person only id and name are kept — no e-mail, phone or
  NFC id. Per machine the result is one JSON value, `Device.externalData`
  (shape in `src/lib/wattro/details.ts`), compared key-order-free so an
  unchanged machine is not rewritten. A run fails whole if a list fails.
- **Devices list**: tabs in the head — Alle · Im Lager · Bei Mitarbeitern ·
  Auf Baustellen, with counts. "Wo ist es?" shows Wattro's place (icon,
  name, "seit …"; the storage location under a store; "Projekt
  abgeschlossen" when Wattro lists the site as finished). A new column
  "Zuletzt gesehen": "vor n Tagen" up to 30 days, the date beyond, and how
  (RFID-Scan, Code-Scan, GPS-Ortung, von Hand). Brand and model on the name's
  second line. The search reaches brand, model, serial number, tags, holder,
  site and address. The per-row Wattro badge is gone (nearly every row had
  it); the source shows on the device's page. "Ausgegebene Geräte" shows
  only when this app has open hand-outs (or no Wattro data at all) — its
  empty state "Alle Geräte sind im Lager" contradicted Wattro.
- **Device page**: an "Aus Wattro" card — Gerät (brand, model, serial number,
  purchased on, purchase price only with `canViewFinancials`, Wattro's notes,
  nameplate photo), Zugehörigkeit (home store, home employee), Zuletzt
  gesehen (when, how, by whom or which terminal, last position as an
  OpenStreetMap link, GPS tracking), Termine (inspection, reserved until),
  tags, and Wattro's number and dates. Empty rows and groups are not drawn.
  "Wo ist es?" leads with Wattro's place; this app's hand-out panel stays.
- A hand-out made in this app wins the tab over Wattro's place (someone acted
  on it here); the row then shows both.
- `has_meta_tag` is not shown (the meta tag is among the tags already).

Rollback of the second stage only: restore `sync.ts`, `client.ts`,
`assets.ts`, `devices/page.tsx`, `devices/[id]/page.tsx` and the message
files from before it, delete `details.ts`, `wattro-where.tsx`,
`wattro-card.tsx` and `tests/unit/wattro-details.test.ts`, then drop the
column with a migration (`ALTER TABLE "Device" DROP COLUMN "externalData";`)
and remove the field from `schema.prisma`. Nothing else reads the column; the
next sync of the first stage simply leaves it out.

## Automatic sync (06.10.2026)

- Wattro is read every hour without a click. One interval
  (`WATTRO_SYNC_INTERVAL_MINUTES`, default 60 in production, 0 = off, minimum
  15; off on a development server unless set) and one rule
  (`src/lib/wattro/schedule.ts`): a run that comes before the interval is up
  is skipped, so clicks, restarts or a second server do not read Wattro twice.
- `src/instrumentation.ts` starts `src/lib/wattro/timer.ts` beside the
  webhook worker; it looks every five minutes whether a run is due. It runs
  in the long-running server of the Docker container (production is Docker
  on Hetzner). A Vercel cron route and `vercel.json` that came with the first
  version were removed again on 10.10. — not needed there.
- Automatic runs are audited like clicks, without a user and marked
  `timer` (`recordSyncRun` in `src/lib/wattro/auto-sync.ts`, used by
  the button's action too). The Devices page says "gleicht jede Stunde von
  selbst ab" next to the last sync.
- Files: `src/lib/wattro/schedule.ts`, `auto-sync.ts`, `timer.ts` (new),
  `src/instrumentation.ts`, `devices/wattro-actions.ts`,
  `devices/page.tsx`, `messages/*.json`, `.env.example`, `DEPLOYMENT.md`,
  `tests/unit/wattro-schedule.test.ts`, `tests/unit/wattro-auto-sync.test.ts`.
- Rollback: set `WATTRO_SYNC_INTERVAL_MINUTES=0` to stop it at once; to remove
  it, delete the new files and the two lines in `instrumentation.ts`.

## The head drawn like the projects head; the map view (06.10.2026)

- **Head** (`devices/page.tsx`): the name, then the places as the projects
  page draws its boards — quiet pills (`projectControl.boardTab*`) with the
  place's colour as a dot (Im Lager green, Bei Mitarbeitern blue, Auf
  Baustellen amber; `PLACE_COLOURS` in `wattro-where.tsx`, the same as the
  icons and pins) and a count; "Alle Geräte" after a short hairline, as "All
  projects" stands after the boards; a hairline; the three views as icon
  pills right beside them (`projectControl.view*`): board, list, map. On the
  right only "Neues Gerät" with its plus, like "Neues Projekt".
- **Map** (`?view=map`, `devices/devices-map.tsx`): every device Wattro has
  a position for, one numbered pin per spot (positions rounded to three
  decimals, about 100 m — `clusterByPosition` in `src/lib/wattro/details.ts`),
  the biggest spot first, named and coloured after the place most of its
  devices belong to. Beside the map the same spots as a list; a click flies
  the map there, opens the pin's bubble (the first eight devices, linked) and
  unfolds the spot's devices in the list. Devices without a position are
  listed last ("Ohne Position"), not pinned. Tabs and search narrow it. The
  position is where Wattro last saw a device — mostly where it was scanned —
  which the list's first line says.
- Rollback: restore `devices/page.tsx`, `devices/wattro-where.tsx`,
  `src/lib/wattro/details.ts`, the message files and
  `tests/unit/wattro-details.test.ts`; delete `devices/devices-map.tsx`.

## A Wattro device's page shows Wattro only; the devices board (06.10.2026)

- **Device page**: a device Wattro keeps shows one read-only panel and
  nothing else (`devices/wattro-device.tsx`): where it is and when it was
  last seen at the top, then Gerät (inventory number, brand, model, serial
  number, purchase date, price with `canViewFinancials`, GPS tracking,
  nameplate), Zugehörigkeit, Termine, Wattro's notes, tags, the map of its
  last position (`devices/device-map.tsx`, Leaflet + OpenStreetMap tiles as
  on the scheduling map; the wheel scrolls the page, not the map) and
  Wattro's number and dates. The form (name, kind, video, notes …), the
  hand-out panel and the history are not shown for such a device — changes
  are made, and machines handed out, in Wattro. Devices of this app's own
  keep the page as it was. (On 06.10. no Wattro device had a kind, video,
  notes or hand-out, so nothing became invisible.)
- **Enforced in the actions**, not only by the page: `updateDevice` ignores
  name, inventory number, storage place and active for a Wattro device;
  `deleteDevice` refuses one (the next sync would recreate it without its
  history); `handOutDevice` refuses one (`error: 'wattro'`).
- **Project page and schedule dialog** ("Benötigte Geräte"): a Wattro
  device shows "laut Wattro: <place>" instead of a hand-out button
  (`getProjectDevices` → state `wattro`; `project-devices.tsx`).
- **Board** (the view the page opens in since 1.52.0; `?view=board` still
  works, the list is `?view=list`; the board/list switch in the head, drawn like
  the projects board — `devices/devices-board.tsx`): one grey list per place
  — stores first, then every person, then every site (site numbers sorted as
  numbers), each card a machine with its inventory number, brand and "seit
  …". In a store by name; with a person or on a site the longest there
  first. Read-only: a machine moves when the crew scans it in Wattro. The
  tabs (Alle · Im Lager · Bei Mitarbeitern · Auf Baustellen) and the search
  narrow it. A Wattro machine Wattro places nowhere stands in "Ohne Ort in
  Wattro", not in the store. Grouping: `groupByHolder` in
  `src/lib/wattro/details.ts`.
- Files: `devices/[id]/page.tsx`, `devices/page.tsx`, `devices/actions.ts`,
  `devices/wattro-device.tsx` (new, replaces `wattro-card.tsx`),
  `devices/device-map.tsx` (new), `devices/devices-board.tsx` (new),
  `devices/wattro-where.tsx`, `projects/[id]/project-devices.tsx`,
  `schedule/actions.ts` (type), `src/lib/wattro/details.ts`,
  `messages/*.json`, `tests/unit/device-wattro-guard.test.ts` (new),
  `tests/unit/wattro-details.test.ts`.
- Rollback: restore those files; nothing in the database changed.
