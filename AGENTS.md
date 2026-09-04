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
  (`requireUser`, `requireManagement`, `requireAdmin`, `canViewFinancials`).
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
projects and templates pick their lists). Add a new file there for similar
changes.

## Commands

- Dev DB: `docker compose -f docker-compose.dev.yml up -d`
- Migrate: `npm run db:migrate` · Seed: `npm run db:seed`
- Tests: `npm test` (unit, Vitest, no DB) · `npm run test:db` (DB-backed, needs
  the dev DB). Pure logic lives in `src/lib/*` without React/Next imports so it
  stays testable; add a test whenever you touch conflicts, reports, authz,
  dates or importers.
- Verify before claiming done:
  `npm run typecheck && npx eslint src prisma tests && npm test && npm run build`
- Demo logins: admin/admin1234, buero/buero1234, lager/lager1234
- `prisma/seed.ts` is the base seed only (accounts, categories, catalog).
