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
still work), `docs/CHANGE-trello-auto-sync.md` (the server pulls the Trello
boards switched on under Einstellungen → Trello and runs the importer itself,
hourly and on the button; the importer lives in `src/lib/trello/import.ts`).
`docs/CHANGE-wattro-project-push.md` (the first thing written to Wattro: a
project created there under its number, off unless `WATTRO_PROJECT_PUSH=1`).
`docs/CHANGE-project-job-number.md` (the client's own project number, the
Trello title's "(1234567)", as a field of its own: typed, edited, searched, filled
by the import, and a project's ID in Wattro).
`docs/CHANGE-board-management-ui.md` (boards made and changed in one window —
gear on the open tab, "Neues Board", Einstellungen → Boards: name, colour,
columns with a live preview, drag to reorder, plain-language column rules,
saved at once, delete with confirmation; a colour per column, from the
window or the list's menu — migration `board_column_color`).
`docs/CHANGE-mcp-ai-chat.md` (the MCP tools completed from one catalogue with
per-role access and a money filter at the door; an in-app assistant on the
same tools, OpenAI key from `OPENAI_API_KEY`, every change confirmed before
it runs; conversations kept per person with history and archive, pages
opened and questions asked from the chat — migration `assistant_chats`).
`docs/CHANGE-feedback-tool.md` (comment mode on every page with `?comment`, the
feedback tasks as list and Kanban with agent proposals, the JSON handoff and
`scripts/feedback-export.mjs`; replaces `/checklist`, whose entries moved in;
agents work the live list over MCP with a "Nur Feedback-Aufgaben" key,
migration `api_key_scope`).
`docs/CHANGE-quote-reading.md` (every PDF on a project read for a quote —
net, VAT, gross, Vorgangsnummer, date — into `DocumentQuote`; the price and the
Projektnummer filled from them only while empty; OCR of scans only with
`QUOTE_OCR=1`; backfill `scripts/quote-backfill.mjs`; migration `quote_reading`).
`docs/CHANGE-project-title-from-customer.md` (no typed project name: the name
is the customer and the trades, "Muster GmbH · Malern", kept current by
`src/lib/project-title-db.ts`; the old title kept as `Project.sourceTitle` and
shown small; the Trello field "Art der Arbeit" read with the office's own
words, what matches no trade kept as `Project.workNote`, which follows the
trades in the name; marketing labels such as "Lead Anzeige" never name a
project, and Wattro keeps the name a project was made there with).
`docs/CHANGE-form-templates-from-pdfs.md` (forms that read like printed sheets:
fixed texts, words after a value, fixed table rows, half width, signatures
placed in the sheet, page breaks; templates with prices only with financial
access; templates exported and imported as JSON — the client's own forms are
imported from a file kept outside the repository).
`docs/CHANGE-project-documentation.md` (a Dokumentation section on the card,
the project page and `/my`: photos, PDFs, notes and voice notes written out by
OpenAI; tables `DocumentationEntry`/`DocumentationFile`, not `Document`).
`docs/CHANGE-project-folders.md` (one folder tree per project for attachments
and documentation: folder bar, drag onto a folder or "Verschieben nach …",
table `ProjectFolder`, `folderId` on `Document` and `DocumentationEntry`).
`docs/CHANGE-task-photos.md` (photos on a project's tasks: camera or gallery,
lightbox, delete; stored as `Document.taskId`, filed into an "Aufgaben" folder).
`docs/CHANGE-project-needs.md` (the card's needs in three sections — Material,
Werkzeug, Maschinen — with quantity and note edited in place; a catalogue list
imported under Lager → Liste importieren, a starter list for painting/plaster/
drywall, a needs list pasted into one project; assistant tools for the needs).
`docs/CHANGE-rain-warnings-two-weeks.md` (rain on outdoor work looked up 14
days ahead — days 1–7 firm, 8–14 a "Tendenz" — on the overview, the project
card and page; one cached Open-Meteo call per place; `OPEN_METEO_API_KEY` for
the paid API).
`docs/CHANGE-search-palette.md` (one search window for the administration
area: ⌘K or the magnifier, projects first — scoped like the projects page —
then the office's master data and the app's pages; `/api/search`).
`docs/CHANGE-baustellen-board.md` (Baustellen is the projects page's board
view fixed to one board, the one ticked "unter Baustellen zeigen" — migration
`board_show_on_sites` ticks "Aktuell laufende Baustellen"; cards open at
`/sites/card/<id>`; the old list's flags are markers on the cards, on both
pages).
Add a new file there for similar changes.

`docs/TRELLO-RESYNC.md` is the runbook for bringing the client's Trello boards
in again — by the server itself (Einstellungen → Trello) or by hand (pull with
`scripts/trello-pull.mjs`, import per board, fetch files) — with the verify
query, the cutover, and what a second import overwrites and what it keeps.

## Shared progress list: the feedback tool

What is done and what is open — across people, agent sessions and the client —
lives in the feedback tool (`docs/CHANGE-feedback-tool.md`), not in a file.
Anybody logged in adds `?comment` to any page and leaves a comment with a
screenshot; the office works them off in **Einstellungen → Feedback-Aufgaben**
(`/feedback`; the crew has `/my/feedback`). The old `/checklist` redirects there;
its entries moved in with their numbers (source "Fortschrittsliste").

- **The list is the live one.** "The feedback", "the next five items", "#64"
  always mean the list on the live site — never this machine's database, which
  is a test copy (comments made there never reach anybody). Nobody needs to
  say "online".
- **Read it over MCP**: the `baucrew-feedback` MCP server (set up once per
  computer, see `docs/CHANGE-feedback-tool.md` → "Agents and the live list")
  offers `list_feedback`, `get_feedback`, `get_feedback_image` (the
  screenshots), `add_feedback`, `add_feedback_note`, `record_feedback_proposal`
  and `set_feedback_status`. Without it: `npx tsx --env-file=<main checkout>/.env
  scripts/feedback-export.mjs` (open items, readable; `--json` for the same
  JSON as "Für Agent kopieren", `--waiting=agent` for what an agent may take,
  `64 71` for single items; it fetches the screenshots and prints their paths).
  If neither is set up, say so instead of reading the local database;
  `--local` is for testing the tool itself.
- **Report back on the item**: what was found or built, the branch or pull
  request, how to check it — a note (`add_feedback_note`) or the proposal
  (`record_feedback_proposal`), and the status `IN_PROGRESS` or `DECISION`.
  Accepting a proposal and marking an item done stay with a person; the tools
  do not offer it.
- **Honour the item**: status DECISION waits on a person — do not build it
  before its open question is answered. Act on an accepted proposal only while
  its decision still matches the current proposal (`evidenceMatchesCurrent`).
- **Add an entry when asked** with `add_feedback` (it lands in "Neu" with the
  source "Agent"), or a person adds it in the app — never in code. Real client
  data stays out of comments that are meant for agents, as everywhere.

The `docs/CHANGE-*.md` files stay the record for reversible changes.

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
