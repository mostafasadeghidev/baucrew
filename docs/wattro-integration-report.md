# Wattro integration — first stage report

**Date:** 29 September 2026 · **Branch:** `feat/reporting-cleanup` (uncommitted work alongside the reporting cleanup) · **Status:** implemented and tested, waiting on the Wattro API key to go live

> **Update 6 October 2026:** the key is configured and the sync has run against the client's own Wattro instance: the whole tool shed (a few hundred machines) imported on 2 October. A second stage now stores and shows everything Wattro sends per machine — where it is (with an employee, on a site, in the store), last scan, brand, model, tags, position — on the Devices page and each device's page. Sections 6 and 12 below describe the first stage; the second is documented in `docs/CHANGE-wattro-devices.md` ("Second stage").

---

## 1. Executive summary

The first working stage of the Wattro integration is built: **Wattro devices can now be read into the client's BauCrew Devices page.** Everything is implemented, tested and verified end to end except one thing — the real API key is not yet configured on the server, so no authenticated call against Wattro has been made from the app itself. That is a configuration step, not a missing feature.

What exists today:

- A **server-side Wattro API client** (bearer auth, timeouts, retries, response validation) — the API key never reaches the browser.
- A **manual sync button** on the Devices page ("Mit Wattro abgleichen"), visible only to the office (Admin/Manager). It imports and updates devices, survives repeated runs without duplicates, preserves locally entered data, and handles inactive devices explicitly.
- **Clear failure behaviour**: a failed sync changes nothing, the page keeps showing the last good data, and the page always says how fresh that data is.
- **A full test suite**: 45 new unit tests (42 Wattro, 3 for the date-time format) plus 5 database tests — all passing, together with the entire existing suite (765 tests with the DB) and the production build. A review on 30 September fixed several defects before any real sync ran; see section 10a.

What is *not* done (on purpose, in this stage): no writes to Wattro (no hand-out, return, or project changes), no scheduled background sync, no employee/project/site matching. These are later phases with open questions in section 13 and 14.

## 2. Business goal and first milestone

The client, a plastering and painting company, manages its machines (grinders, compressors, saws…) in **Wattro**, a tool-tracking system the crews use in the field. This app (BauCrew) has its own Devices page where the office records the same machines by hand — two lists describing one reality, drifting apart.

The agreed first milestone: **read Wattro's devices into the app's Devices page, reliably and without creating duplicate or conflicting records.** Read-only, manual, small. Everything else (deployments, inspections, hand-outs) builds on this foundation.

Why start read-only? Every write to another company's live system is irreversible in ways local data is not. Until we know the data quality of both sides and which system "owns" which field, the safe direction of flow is Wattro → here.

## 3. Existing application architecture (what the integration plugs into)

For someone new to the codebase, the pieces that matter:

| Piece | Technology | Where |
| --- | --- | --- |
| Web framework | Next.js 16 (App Router), React 19, TypeScript | `src/app` |
| Database access | Prisma 7 ORM (an ORM = a library that maps database rows to TypeScript objects) + PostgreSQL | `prisma/schema.prisma`, `src/lib/db.ts` |
| UI text | German (default) + English via next-intl | `messages/de.json`, `messages/en.json` |
| Login / permissions | Custom session cookies; every page/action checks the user's role server-side | `src/lib/auth.ts`, `src/lib/authz.ts` |
| Tests | Vitest; unit tests without a DB (`npm test`), DB-backed tests opt-in (`npm run test:db`) | `tests/unit`, `tests/db` |
| Small key/value settings | `AppSetting` table | used for logo, thresholds, and now the sync stamp |

The Devices screen (`src/app/(admin)/devices/`) is a server-rendered page reading the `Device` table directly, with server actions for create/edit/hand-out/return — all gated by `requireManagement()`, all written to the audit log. The `Device` table already carried three forward-looking columns: `externalSystem`, `externalId` (unique together), and `source`. **No database migration was needed** — the sync fills those columns.

Existing records are real: the dev database contains hand-entered devices (e.g. "1 112", inventory no. 111). The sync treats them as protected — see the matching rules in section 6.

## 4. Verified Wattro capabilities

Sources (fetched 2026-09-29, both public, no key needed):

- Documentation UI: `https://api-dev.wattro.io/api/v1/docs` (Swagger UI)
- The machine-readable contract behind it: `https://api-dev.wattro.io/api/v1/openapi.json` — **"Wattro REST API", version 1.8.0** at first reading, **1.10.0** when re-read on 30 September 2026

**Documented facts (from that spec):**

- **Authentication:** HTTP Bearer token on every endpoint (`ApiKeyAsBearer`). The API key goes in the `Authorization: Bearer <key>` header.
- **Base URL / version:** everything lives under `/api/v1/`. The spec has no `servers` entry; the hostname we were given is `api-dev.wattro.io`.
- **`GET /api/v1/asset/`** (the devices list) — query parameters:
  - `limit` (default 100, min 1) and `offset` (min 0) for pagination
  - `active` (boolean, **defaults to `true`** — inactive assets are invisible unless you ask for them explicitly)
  - `updated_at__gte` / `updated_at__lte`, `created_at__gte` / `created_at__lte` (timestamp filters, useful later for incremental sync)
  - `name`, `serial_number`, `human_id` (case-insensitive substring searches)
  - Response: `{ "items": [ AssetOut… ], "count": <total for this filter> }`
- **`AssetOut`** (the fields we mapped, with nullability):
  - `id` — integer, **Wattro's stable identifier** (nullable in the schema; treated as unusable when missing — the record is skipped and counted)
  - Only `name`, `tags` and `updated_at` are required; the optional fields may be null or left out, and both read as "none" (a missing `active` as Wattro's default `true`)
  - `human_id` — string or null, max 100 chars: **the human-readable inventory number**
  - `name` — string, required; `storage_location` — string or null
  - `active` — boolean
  - `current_assignment` — `{ assignee_id: int, assignee_type: string }` or null: where Wattro says the asset currently is. `assignee_type`'s possible values are **not documented**.
  - `home_employee` (EmployeeShortOut or null), `home_store` (StoreShortOut or null) — where the asset *belongs*
  - `brand`, `model`, `serial_number`, `notes`, `price` (a number sent as a string), `purchased_at`, `updated_at` (required), plus GPS/last-seen fields we do not read.
- **Other endpoints (verified to exist, not used yet):** `GET /api/v1/asset_log/` (movement history), `GET /api/v1/project/` (+ per-project `GET /api/v1/project/by_human_id/{human_id}/deployments`), `GET /api/v1/deployment/` (asset-on-project periods with start/end times and meter readings), `GET /api/v1/employee/` (employees have a **single `name` string**, email, phone, NFC id), `GET /api/v1/inspection/`, `GET /api/v1/issue/`, `GET /api/v1/tag/`, `GET /api/v1/trip/`.
- **Write endpoints exist** (POST/PATCH/DELETE on assets and projects, POST inspections/issues, POST/PATCH users) — **deliberately unused in this stage.**

**Verified live (real HTTP calls, read-only, no credentials):**

- An unauthenticated `GET /api/v1/asset/?limit=1` and one with a deliberately invalid token both return **HTTP 401 with `{"detail": "Unauthorized"}`**. That is the error shape our client tests against.

**Not documented / unknown (treated as assumptions, never built upon):**

- General rate limits, webhooks, the `assignee_type` enum, and the production hostname. See sections 12–13. (Spec 1.10.0 does document one throttle: requests with an offset above 5000 are throttled with 429 and a `Retry-After` header in seconds.)

**A note on `api-dev`:** the hostname says "dev" but that alone does not prove the key belongs to a test organisation — keys and environments are provisioned independently in many systems. Since no authenticated call has been made yet, the first key use should be preceded by confirming which environment the key belongs to (question J1 in section 13).

## 5. Proposed and implemented data flow

```
┌─────────────┐   HTTPS GET /asset/?active=true|false     ┌──────────────────────────────┐
│   Wattro    │ ◄──────────────────────────────────────── │  This app (server-side only) │
│  (read only)│   Authorization: Bearer ***               │                              │
└─────────────┘                                           │  client.ts  HTTP + retries   │
      │  { items: AssetOut[], count }                     │      │                       │
      └──────────────────────────────────────────────────►│      ▼                       │
                                                          │  assets.ts  validate+map     │
                                                          │      │                       │
                                                          │      ▼                       │
                                                          │  sync.ts    match & plan     │
                                                          │      │  one DB transaction:  │
                                                          │      │  update/adopt/create  │
                                                          │      ▼                       │
                                                          │  PostgreSQL: Device rows +   │
                                                          │  AppSetting "last sync"      │
                                                          │      │                       │
                                                          │      ▼                       │
                                                          │  Devices page (office only)  │
                                                          └──────────────────────────────┘

Browser ── click "Mit Wattro abgleichen" ──► server action ──► sync (the key stays on the server)
```

Concrete sequence when somebody clicks the button:

1. The server action checks the user's role (`requireManagement` — Admin or Manager only).
2. The sync fetches **all pages** of `active=true`, then **all pages** of `active=false` (so a deactivated machine is seen, not assumed deleted). Pages of 100 until Wattro's `count` is reached.
3. Each record is validated (zod schema — a runtime type check). Broken records are counted and skipped, not fatal.
4. Every asset is matched against the local devices (rules in section 6) and the writes run in **one database transaction** — all or nothing.
5. Only after success, "last synced" and the run summary are stored (inside that same transaction).
6. The page reloads, shows the new data, the fresh stamp, and a summary line ("Wattro: 2 neu, 1 übernommen, 3 aktualisiert …").

**Partial failure rule:** any network/auth/server error mid-run means *nothing is written*. A missing device in a partial response is never taken as proof that it was deleted — Wattro would have to say so across a *complete* successful run, and even then this stage keeps the local row (deletion is a human decision).

## 6. Field mapping and data ownership

Once a device is imported, the two systems share it. Whoever "owns" a field may overwrite it at every sync; the other side must leave it alone.

| Device field (this app) | Wattro field (`AssetOut`) | Owner after import | Notes |
| --- | --- | --- | --- |
| `name` | `name` | **Wattro** | trimmed |
| `inventoryNo` | `human_id` | **Wattro** | the inventory number people read |
| `storageLocation` | `storage_location` | **Wattro** | free text on both sides |
| `active` | `active` | **Wattro** | Wattro's off-switch wins; the row is kept, never deleted |
| `externalSystem` / `externalId` | `id` | this app | `"wattro"` + Wattro's numeric id, the permanent link |
| `source` | — | this app | `"wattro"` on created rows; adoption keeps the row's original source |
| `category`, `notes`, `videoUrl` | — | **this app** | Wattro has no equivalent; preserved on every sync |
| hand-outs (`DeviceAssignment`), history | — | **this app** | the office's own bookkeeping |
| — | `brand`, `model`, `serial_number`, `notes`, `price` | unmapped | no local column yet; a phase-2 decision |
| — | `current_assignment`, `home_employee`, `home_store` | unmapped | bare ids, `assignee_type` undocumented; needs employee/site matching first |
| — | `tags`, GPS fields | unmapped | no local equivalent |

**How existing devices are matched without duplicates.** Per asset, in order:

1. **Already linked:** a local device with `externalSystem="wattro"` and `externalId = <asset id>` → refreshed in place. This is the path every run after the first takes.
2. **Adoption by inventory number:** an unlinked local device whose `inventoryNo` equals the asset's `human_id` (case/space-insensitive, because people type these by hand) → claimed for Wattro: its Wattro-controlled fields are updated and its identity columns are stamped. Only when **exactly one** unlinked row wears the number **and exactly one** not-yet-linked Wattro asset does. Names are never used for matching — two machines may honestly share a name, and a wrong merge is silent data loss.
3. **Conflict, reported instead of guessed:** the number is worn by several free rows or by several Wattro assets (`inventoryAmbiguous`), or by a row that already belongs to Wattro under another id (`inventoryTaken` — renumbered in Wattro), or by a row of another system (`inventoryTaken`). The run reports these; a person resolves them.
4. **Create:** anything else becomes a new device with `source="wattro"`.

An asset that arrives twice in one run (switched off between the read of the active and the inactive list) counts once, by its newest `updated_at`.

## 7. Files changed and why

New (the integration itself):

- `src/lib/wattro/assets.ts` — pure logic: types, field mapping, match planning, the pagination walker, result types. Pure on purpose: no HTTP, no DB, so every decision is unit-testable in milliseconds.
- `src/lib/wattro/client.ts` — the only place that talks HTTP to Wattro. Server-only (the `'server-only'` import makes a browser import a build error), bearer auth, 15 s timeout, bounded retries, zod response validation, typed errors, and it never logs the key.
- `src/lib/wattro/sync.ts` — orchestration: fetch both active states, plan, write in one transaction, store the stamp; plus `getLastSync()` for the page.
- `src/app/(admin)/devices/wattro-actions.ts` — the server action; office-only, writes an audit entry either way.
- `src/app/(admin)/devices/wattro-sync-button.tsx` — the button with loading spinner, result line and per-failure messages; when the key is missing it renders the explanation instead.
- `tests/unit/wattro-assets.test.ts`, `tests/unit/wattro-client.test.ts`, `tests/unit/wattro-action.test.ts` — mapping/matching/pagination, HTTP behaviour (auth, 429, 5xx, network, malformed responses), action authorization.
- `tests/db/wattro-sync.test.ts` — the real database with Wattro fixtures: idempotency, local-field preservation, deactivation, failure atomicity.
- `docs/CHANGE-wattro-devices.md` — the reversible-decision log entry with exact rollback steps.

Changed:

- `src/app/(admin)/devices/page.tsx` — the Wattro line under the page hint (badge, "Zuletzt abgeglichen: …", button) and a small Wattro badge on imported devices (tooltip explains which fields Wattro owns).
- `src/lib/format.ts` — added `formatDateTime` (date-time variant of the existing `formatDate`).
- `messages/de.json`, `messages/en.json` — new `devices.wattro*` keys, both languages.
- `.env.example` — documented `WATTRO_API_KEY` / `WATTRO_BASE_URL` placeholders (no real values, ever).

## 8. Configuration and local setup

The key was supplied privately to the developer. It must never be committed, logged, or echoed — it lives only in `.env` (which git ignores) on the server.

```bash
# 1. in .env (repo root — this file is NOT in git):
WATTRO_API_KEY="<the key the key's owner supplied>"
# optional, default shown; change only after J1 is answered:
# WATTRO_BASE_URL="https://api-dev.wattro.io/api/v1"

# 2. restart the dev server so Next.js reads the new variable
npm run dev
```

Unset key = the sync stays hidden and the page says "Wattro ist nicht eingerichtet" — the same convention as the existing `INBOUND_API_KEY`. Verify with:

```bash
npm run typecheck && npx eslint src prisma tests && npm test && npm run build
npm run test:db        # needs the dev database (docker compose -f docker-compose.dev.yml up -d)
```

Demo logins (local seed): admin/admin1234, buero/buero1234. The button appears for admin and buero, not for site managers or crew.

## 9. Synchronization behaviour and failure handling

- **Manual only.** No scheduler exists in this stage; nothing runs in the background. (Section 14, phase H, covers the eventual design.)
- **Full read each time.** Both active states, all pages. For a tool shed of a few hundred machines this is one or two requests per state — incremental sync (using `updated_at__gte`) would save nothing worth its complexity yet. If it is added later: fetch with `updated_at__gte = <checkpoint>`, and move the checkpoint forward **only after a fully successful run** — a failed run must re-read the same window. Because the filter is `>=`, the window should overlap (checkpoint minus a safety margin, e.g. one minute) so a record updated during the run is caught twice rather than never; re-reading is harmless because upserts are idempotent.
- **Auth failure (401/403):** no retries — a wrong key does not heal by asking again. The button reports "Wattro hat den API-Schlüssel abgelehnt". Nothing is written.
- **Rate limit (429) / server errors (5xx) / network drops:** retried at most twice, with growing pauses (0.5 s, 1.5 s), or Wattro's `Retry-After` when it sends one. A `Retry-After` above 30 s ends the run as "rate limited" instead of retrying early. Only reads are retried — they cannot double-write.
- **Malformed response:** the envelope (`items` + `count`) must validate or the run stops (`response` error). A single broken record inside is skipped and counted (`invalid`), so one bad row cannot hold the list hostage — but it *is* visible in the summary.
- **Partial run:** writes happen in one transaction at the very end (120 s limit; a Postgres advisory lock makes concurrent clicks write one after the other); a failure anywhere — before it or inside it — leaves the database untouched and the previous "last synced" stamp standing. A database failure is reported as its own message ("konnten nicht gespeichert werden"), not an error page.
- **Stale data:** the Devices page always renders from the local database, so it keeps working when Wattro is down; the "Zuletzt abgeglichen" line says how old the picture is.
- **Auditability:** every sync attempt is written to the audit log with its counts (or its failure kind).

## 10. Tests performed and actual results

All commands were run on 29 September 2026; all green.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | pass |
| Lint (whole repo) | `npx eslint src prisma tests` | pass |
| Unit tests (no DB) | `npm test` | **76 files / 713 tests pass**, incl. 45 new (after the 30.09. review) |
| DB tests (dev Postgres) | `npm run test:db` | **88 files / 765 tests pass**, incl. 5 new |
| Production build | `npm run build` | pass |

What the new tests cover, by behaviour:

- **Mapping:** trimming, null/empty handling, inactive flag. *(unit, fixtures)*
- **Matching:** update by stored id; adoption by inventory number (case/space forgiving); **name never matches**; ambiguous number → conflict; number owned by another system or by another Wattro id → conflict; duplicate Wattro id in one response → conflict. *(unit)*
- **Multiple pages:** pagination walks until `count` is reached, stops at a short page, sums skipped records, and a failed page aborts the run. *(unit)*
- **HTTP behaviour:** correct URL/query/auth header (key asserted present in header, absent from URL); 401/403 → auth error without retry; 404 → no retry; 429 and 5xx and network errors retried then resolved/given up; non-JSON and wrong-shaped envelopes rejected. *(unit, stubbed `fetch`)*
- **Authorization:** employee → redirected to `/my`, site manager → `/projects`, neither reaches the sync; manager runs it and an audit entry is written. *(unit, mocked auth)*
- **Repeated sync without duplicates, local-field preservation, deactivation, failure atomicity:** run against the **real dev database** with Wattro fixtures — first run creates/adopts/updates/conflicts as planned; the identical second run changes nothing and creates nothing; a device Wattro deactivates is deactivated (kept); a device Wattro stops sending is kept; a run whose second page explodes writes nothing at all. *(db tests)* — this suite caught one real bug during development: adopted devices initially did not get their `externalId` stamped, which would have caused re-matching (and potential duplicates) on every later run. Fixed and now pinned by tests.

This test suite also documents the **bug-fix discipline**: the DB test failed, the cause was in `sync.ts` (not the test), the fix went into the sync logic, and the test now guards the behaviour permanently.

## 10a. Review fixes (30 September 2026)

A review before the first real sync found and fixed these; each is now pinned by a test:

- Pagination stopped after a full page that held one unusable record (the short-page check counted only valid records) — the rest of the list was silently skipped.
- A missing `Retry-After` header read as "0 seconds", so retries fired without any pause.
- Two Wattro assets sharing an inventory number could both adopt the same local device; the second silently took the link.
- An asset seen in both the active and the inactive list was counted twice or flagged as a conflict.
- Optional fields left out of Wattro's JSON made the whole record invalid.
- The write transaction had Prisma's 5 s default limit (too short for a first import over a network hop), a database error surfaced as an error page, and two simultaneous clicks could collide.
- "Zuletzt abgeglichen" showed UTC time, 1–2 hours behind Berlin.
- The DB test used fixed Wattro ids and its cleanup could delete real imported devices (with their hand-outs) and the real sync stamp on the dev database.

## 11. What was verified against the real API

Honest separation of evidence:

| Verified | How |
| --- | --- |
| Documentation exists at `/api/v1/docs`, spec at `/api/v1/openapi.json` (v1.8.0) | real public HTTP GET |
| Bearer auth required; error shape `401 {"detail": "Unauthorized"}` | two real unauthenticated/invalid-token GETs to `/asset/?limit=1` (read-only, no credentials, no writes) |
| Response contract (`items`+`count`, asset fields, `active` default) | from the OpenAPI spec — **not yet proven with an authenticated live call** |
| The app's UI and its not-configured state | real browser at `http://localhost:15700/devices`, logged in as admin; page renders the Wattro line, the explanation, and an untouched device table |
| The full sync machinery against a real database | DB tests with fixture pages (mocked at the HTTP boundary only) |
| **An authenticated sync bringing real Wattro data into this app** | **not yet possible — the key is not configured on the server.** Everything is built and rehearsed; this last step is configuration + one click (section 8), and per J1 the key's environment should be confirmed first. |

## 12. Remaining limitations, assumptions, and blockers

**Blocker (the only one):** no `WATTRO_API_KEY` in the server environment → the sync is hidden and unauthenticated live calls are impossible. Owner: the operator/developer, one minute of work plus a dev-server restart.

**Assumptions we deliberately did not build on:**

- That `api-dev` serves test data (unproven — J1).
- That the key has read access to assets at all (unproven until first live call — but the endpoint contract is documented, so failure would be visible immediately and harmlessly).
- That Wattro's list responses are always sorted/complete per `count` (we defend with short-page and empty-page stops and a 200-page runaway cap).

**Known limitations of this stage (accepted):**

- Manual trigger only; no automatic schedule.
- Devices deleted in Wattro stay here (by design — deletion is a human decision); the office sees imported rows via the Wattro badge.
- `brand`/`model`/`serial_number`/`notes`/`price` from Wattro have no local home; if the office wants them, the Device table needs columns first (ownership question T2).
- Wattro's `current_assignment` is stored in memory during the run but written nowhere; the Devices page's "where is it?" stays purely local. So an imported device shows "im Lager" until hand-outs are also matched (phase D/E) — the field-level hint on the badge makes clear which fields come from Wattro.
- Beyond the documented offset-5000 throttle, no rate-limit behaviour known; retries are conservative and the button's 429 message tells the user to try again shortly.

## 13. Questions for Wattro and the office

For the key's owner (Wattro), none of which the docs answer:

- **J1 — Environment of the key:** which organisation and environment (test vs. production) does the supplied key belong to, and what is the correct base URL for each? We will confirm before the first authenticated call.
- **J2 — Rate limits:** is there a documented request limit we should design around?
- **J3 — `current_assignment.assignee_type`:** what values does it take (employee / store / project / …)? Or is `GET /deployment/` the intended way to read "where is the asset now"?
- **J4 — Webhooks:** does Wattro offer change notifications, or is polling the only mechanism?
- **J5 — Deletion semantics:** when an asset is deleted in Wattro, does it disappear from list responses, stay with `active=false`, or appear in `asset_log`? (Today we never delete locally; the answer decides whether a "vanished in Wattro" hint is safe.)
- **J6 — Production hostname** for the eventual rollout (assumed different from `api-dev`).

For the operator (the office), ownership decisions the code cannot make:

- **T1 — Inventory numbers as the linking key:** is `human_id` in Wattro guaranteed to be the same numbering the office types into this app today? Adoption (avoiding duplicates on first import) relies on it.
- **T2 — Field ownership, phase 2:** do brand/model/serial/price live in Wattro from now on (then we add local columns fed by the sync), or does the office keep them here?
- **T3 — Conflict resolution habit:** when the sync reports a number matching several devices, who fixes it, and by renaming which side?
- **T4 — Frequency:** how fresh must the device list be — on demand (today), hourly, nightly? Decides the scheduler design and whether incremental sync is worth it.
- **T5 — Stale policy:** may the office edit Wattro-owned fields (name, inventory number, storage location) on imported devices here? Today the UI does not forbid it, and the next sync overwrites it silently — acceptable, or should imported fields become read-only in the form?

## 14. Prioritized next phases

Each phase states its dependency and its unresolved decision.

| # | Phase | Depends on | Unresolved decision |
| --- | --- | --- | --- |
| A | **Go live with this stage:** set the key (J1 answered), first real sync, review counts/conflicts with the office | the key | J1 |
| B | **Import hygiene:** a small "Wattro conflicts" panel on the Devices page listing ambiguous/taken numbers with links, instead of only the count in the summary line | A | T3 |
| C | **Employee matching:** import `GET /employee/` and store `wattroId` on local employees; match by email, then by exact name with a confirm step (Wattro has one `name` string, ours first+last — automatic merging is unsafe) | A | who owns employee master data (probably Wattro for field data, this app for accounts) |
| D | **Device deployments read-only:** fetch `GET /deployment/` and show, per device, "in Wattro: auf Baustelle X seit …" as information *beside* the local hand-out — no writing of hand-outs yet | A, C (project matching) | T5-adjacent: what happens when Wattro and the local hand-out disagree (display both; warn?) |
| E | **Project/site matching:** link Wattro projects (`human_id` ↔ our project number? — the Trello import already established job numbers as the cross-system key, and `ProjectLink` with `system="wattro"` already exists in the schema for exactly this) | C | mapping key; and **never** map Wattro's `finished` flag onto our nine project stages — stage mapping is its own decision (our LEAD…PAID stages carry more meaning than a boolean) |
| F | **Device activity history:** import `GET /asset_log/` into a read-only history view per device, clearly separated from local hand-out history | A | storage choice (keep raw log rows vs. summarized) |
| G | **Inspections & issues:** surfaces for `GET /inspection/`, `GET /issue/` | D/E | whether these belong on the project page, the device page, or both |
| H | **Scheduled sync + incremental:** nightly full sync, or `updated_at__gte` incremental with the checkpoint rules of section 9; a small run-history table replaces the single AppSetting stamp | A, T4 | T4 |
| I | **Hand-out / return writes (first writes to Wattro):** create/close deployments from the Devices page | D, E, explicit go-ahead | the big trust decision; requires J2/J3 answered and a written agreement which system is authoritative while a machine is out |
| J | **Production rollout** | A–H as scoped | see section 15 |

## 15. Production rollout and rollback considerations

**Rollout steps (when phases A–H are agreed):**

1. Provision a production key, confirm the production base URL (J6), store both as server environment variables in the deployment platform — never in the repository.
2. Run the first production sync at a quiet time and review the counts and conflicts before anyone relies on the list.
3. Only then enable the scheduler (phase H), with the run-history table so failed nights are visible.
4. Monitoring: the audit log already records every run; a failed nightly sync should additionally surface somewhere the office looks (dashboard tile) — small follow-up.

**Rollback of the whole feature** is documented step by step in `docs/CHANGE-wattro-devices.md`: revert the commit / restore the touched files, delete the new modules and tests. There is **no schema migration**, so rollback cannot lose data. Two side effects to know: devices imported or adopted keep their `externalSystem: "wattro"` marks (harmless, and they make a later re-import idempotent), and the two `AppSetting` rows with the last-sync stamp can be deleted or left.

**Safety properties worth keeping through every later phase:** the key only ever lives in server-side environment variables; Wattro is read until a phase explicitly votes to write; syncs are transactional and stamp only on success; matching never guesses (conflicts beat duplicates); and nothing in Wattro is ever deleted because a response looked short.
