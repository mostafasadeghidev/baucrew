<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BauCrew — project rules

Field-service management for painting and construction companies: projects,
customers, employees, vehicles, scheduling, warehouse, work orders, reports.

## Conventions

- **Language**: the UI is **German (default) + English** via next-intl
  (`messages/de.json`, `messages/en.json`). Never hardcode UI strings; use
  proper German business terminology. Every new key must exist in both files.
- **Auth**: custom session auth in `src/lib/auth.ts` (hashed tokens in the
  `Session` table, httpOnly cookie). `src/proxy.ts` only checks cookie
  presence; real authorization is server-side via `src/lib/authz.ts`
  (`requireUser`, `requireStaff`, `requireManagement`, `requireAdmin`,
  `canViewFinancials`). Roles: ADMIN and MANAGER are the office
  (`requireManagement`); SITE_MANAGER (Bauleitung) gets the admin area's
  frame, the overview, the projects it is named on and the schedule
  (`requireStaff`, narrowed by `src/lib/project-scope.ts`), never prices or
  master data; EMPLOYEE is the crew on `/my`. Per-project writes from any
  role go through `canWorkOn` in `src/lib/crew-access.ts`.
  Financial data (project price, revenue) must never reach EMPLOYEE users or
  managers without `canViewFinancials` — filter in queries and DTOs, not only
  in the UI.
- **DB**: Prisma 7 (`prisma-client` generator → `src/generated/prisma`, pg
  driver adapter, config in `prisma.config.ts`). Client singleton:
  `src/lib/db.ts`. Dates for scheduling are UTC-midnight `@db.Date` values.
- **Areas**: `(admin)` route group = Admin/Manager UI (desktop). `/my` =
  employee UI (large type, touch-friendly). The warehouse touchscreen UI
  follows the same principle.
- **Core principle**: enter data once — schedule, warehouse lists, project
  sheets and reports all derive from the central Project record. No duplicate
  data entry.

## What never goes into the repository

Real data of any kind: customers, employees, projects, vehicles, addresses,
logos, screenshots or PDFs made from live data, database dumps, `.env` values.
Examples in code, tests and manuals use invented names (`Muster …`,
`Beispiel …`, `Musterstadt`). Keep local-only files out via
`.git/info/exclude`, not via `.gitignore`.

## Change log for reversible decisions

Larger structural changes that may need reverting are documented in
`docs/CHANGE-*.md` (what changed, every touched file, exact rollback steps).
Current: `docs/CHANGE-multi-vehicle-schedule.md` (one → many vehicles per
schedule entry), `docs/CHANGE-user-accounts-on-employee-page.md` (employee user
accounts managed on the employee page; Settings shows only system accounts plus
a privileged overview), `docs/CHANGE-project-multi-vehicle.md` (one → many
vehicles per project), `docs/CHANGE-template-assignment.md` (optional
manager/vehicles/crew on templates), `docs/CHANGE-configurable-types.md`
(client/building/item type enums → configurable lists),
`docs/CHANGE-checklists-in-projects.md` (checklists moved to the project area;
projects and templates pick their lists), `docs/CHANGE-crm-tabs.md` (CRM page:
eight tabs become Heute, Vergleich, Aufträge & Baustellen, Planumsatz,
Auslastung, Datenlücken; old addresses redirect), `docs/CHANGE-project-boards.md`
(the projects page's one board becomes several, each a set of status columns
with names of their own; the old column setting becomes the first board;
boards made and changed from the board's bar),
`docs/CHANGE-trello-board.md` (the board drawn and moved like Trello's: a
card's place in its list, the archive, the cover picture, the list menu, the
board's own bar, the card templates at a list's foot), `docs/CHANGE-plan-month.md` (the month a job stands in is the
project's own: a placing and a duration, dragged between months; a sheet line
counts only until a project takes it over), `docs/CHANGE-reporting-cleanup.md`
(CRM renamed Auswertungen with four tabs; Heute, Aufträge & Baustellen,
Pipeline and the year matrix removed; comparison and utilization figures
corrected; Datenlücken redrawn), `docs/CHANGE-wattro-devices.md` (the
Devices page reads Wattro's machines, read-only and by hand: matched by
Wattro id, then by inventory number, never by name; everything else Wattro
knows — where a machine is, last scan, brand — kept in `Device.externalData`
and shown),
`docs/CHANGE-ui-overhaul.md` (Untitled UI shell: the page is an inset white
panel like the sidebar, no shadows on anything lying on the page, tabs in the
page's head, a board's colour as a swatch in its tab instead of the board's
ground), `docs/CHANGE-trello-full-import.md` (the Trello import brings fields,
comments, checklists, members, labels, archived cards, attachments and the
board itself; files are fetched with a read-only token),
`docs/CHANGE-projects-board-first.md` (one toolbar for board and list, the
list scoped to the chosen board's rules, "Alle Projekte" as a board of one
column per status, the completion tick overlaid on the card),
`docs/CHANGE-trello-list-columns.md` (a board column may mirror one Trello
list: rule `trello:<list id>` matched against the project link's
`externalListId`; migration `project_link_external_list_id`),
`docs/CHANGE-card-route.md` (a card opened over the board lives at
`/projects/card/<id>` in a parallel `@modal` slot, streamed over the board
that stays put; a cold load shows the full project page; old `?card=` links
still work). Add a new file there for similar changes.

## Shared progress list

`/checklist` (not in the navigation; `src/app/checklist/items.ts`) shows what
is done and what is open across all sessions, numbered, with the session that
holds each entry. Temporary; add to it when asked. The `docs/CHANGE-*.md` files
stay the record for reversible changes.

## Commands

- Dev DB: `docker compose -f docker-compose.dev.yml up -d`
- Migrate: `npm run db:migrate` (`prisma migrate dev` — development only,
  never against a database with real data; production and copies of real
  data get `npm run db:deploy`) · Seed: `npm run db:seed`
- Tests: `npm test` (unit, Vitest, no DB) · `npm run test:db` (DB-backed, needs
  the dev DB). Pure logic lives in `src/lib/*` without React/Next imports so it
  stays testable; add a test whenever you touch conflicts, reports, authz,
  dates or importers.
- Verify before claiming done:
  `npm run typecheck && npx eslint src prisma tests && npm test && npm run build`
- Changes reach `main` only as a pull request that somebody else has read —
  never a direct push. Branch names, the review step and the local setup are
  in `CONTRIBUTING.md`; `.github/workflows/checks.yml` runs the gate above
  (plus the migrations and DB tests on a fresh PostgreSQL) on every pull
  request and push to `main`.
- Demo logins: admin/admin1234, buero/buero1234, lager/lager1234
- `prisma/seed.ts` is the base seed only (accounts, categories, catalog).
