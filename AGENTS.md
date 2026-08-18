<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BauCrew — project rules

Internal field-service management app for a German painting/construction company.
Full product requirements live in the owner's master prompt; phased roadmap in README.

## Conventions

- **Language**: Communicate with the owner in **Persian (Farsi)**. The app UI is
  **German (default) + English** via next-intl (`messages/de.json`, `messages/en.json`).
  Never hardcode UI strings. Use proper German business terminology.
  Extra locales are local-only: `messages/fa.json` is git-ignored and enabled via
  `NEXT_PUBLIC_EXTRA_LOCALES=fa` in the owner's `.env` (see `src/i18n/config.ts`);
  never commit it. Every new key must exist in de/en (and fa locally).
- **Auth**: custom session auth in `src/lib/auth.ts` (hashed tokens in `Session` table,
  httpOnly cookie). `src/proxy.ts` only checks cookie presence; real authorization is
  server-side via `src/lib/authz.ts` (`requireUser`, `requireManagement`, `requireAdmin`,
  `canViewFinancials`). Financial data (project price, revenue) must never reach
  EMPLOYEE users or managers without `canViewFinancials` — filter in queries/DTOs,
  not only in the UI.
- **DB**: Prisma 7 (`prisma-client` generator → `src/generated/prisma`, pg driver adapter,
  config in `prisma.config.ts`). Client singleton: `src/lib/db.ts`. Dates for scheduling
  are UTC-midnight `@db.Date` values.
- **Areas**: `(admin)` route group = Admin/Manager UI (desktop). `/my` = employee UI
  (large type, touch-friendly). Warehouse touchscreen UI will follow the same principle.
- **Core principle**: enter data once — schedule, warehouse lists, project sheets and
  reports must all derive from the central Project record. No duplicate data entry.

## Change log for reversible decisions

- Larger structural changes that the owner may want to revert are documented
  in `docs/CHANGE-*.md` (what changed, every touched file, exact rollback
  steps). Current: `docs/CHANGE-multi-vehicle-schedule.md` (one → many
  vehicles per schedule entry), `docs/CHANGE-user-accounts-on-employee-page.md`
  (employee user accounts managed on the employee page; Settings shows only
  system accounts + privileged overview), `docs/CHANGE-project-multi-vehicle.md`
  (one → many vehicles per project), `docs/CHANGE-template-assignment.md`
  (optional manager/vehicles/crew on templates), `docs/CHANGE-configurable-types.md`
  (client/building/item type enums → configurable lists). Add a new file there for similar changes.

## Commands

- Dev DB: `docker compose -f docker-compose.dev.yml up -d`
- Migrate: `npm run db:migrate` · Seed: `npm run db:seed`
- Tests: `npm test` (unit, Vitest, no DB) · `npm run test:db` (DB-backed, needs the dev DB).
  Pure logic lives in `src/lib/*` without React/Next imports so it stays testable;
  add a test whenever you touch conflicts, reports, authz, dates or importers.
- Verify before claiming done: `npm run typecheck && npx eslint src prisma tests && npm test && npm run build`
- Demo logins: admin/admin1234, buero/buero1234, lager/lager1234
- `prisma/seed.ts` = base seed only (accounts, categories, catalog). Real company data
  lives only in the DB (and in the git-ignored local `prisma/seed.company.ts`).
  Never commit company data, logos or screenshots with real names.
