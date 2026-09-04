<div align="center">

# BauCrew

**Field-service management for painting & construction companies**

Projects · Customers · Employees · Vehicles · Scheduling · Warehouse · Work orders · Reports

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)](DEPLOYMENT.md)
[![License](https://img.shields.io/badge/license-proprietary-lightgrey)](#license)

German (default) · English UI &nbsp;|&nbsp; Desktop, tablet kiosk and mobile

</div>

---

## Why

Small trade companies plan the week on a whiteboard, keep tool lists in Excel and
print work orders by hand — the same information is typed three or four times and
drifts apart. BauCrew follows one rule: **enter data once**. A project is the
single source of truth; the weekly schedule, the warehouse packing screen, the
printable work order, the employee's phone view and the reports are all derived
from it. Change a date because of rain and every screen is already up to date.

## Features

| Area | What you get |
| --- | --- |
| **Projects** | Auto-numbered (`YYYY-NNNN`), 9-step status, client/building type, work categories, site address, planned/actual dates, contract value, site manager, team, vehicles, tools & materials, internal notes; status tabs, live search, quick status change; project templates |
| **Customers** | Contact data, project history, inline "create customer" from the project form |
| **Scheduling** | Week / month / multi-week views, drag & drop (mouse and touch), time-aware conflict detection for employees **and** vehicles, weather warnings for outdoor work (Open-Meteo, keyless), one-click planning from the project page with prefilled team & vehicles |
| **Warehouse** | Tool/material catalog, per-project packing lists (required → collected → missing), touchscreen **daily preparation** board with auto-refresh |
| **Work order** | Printable A4 sheet with company logo, QR code, address, team, vehicles, categories, checklists — no prices, no internal notes |
| **Employees & vehicles** | Skills search, availability, vehicle status; **user accounts managed on the employee page** (activate, role, password, financial access) |
| **My area** | Mobile view for field staff: today / next days, maps & call links, packing list, work order — financial data never leaves the server |
| **Reports** | Revenue per year (own vs. subcontractor), utilization, Excel export |
| **Administration** | Roles (Admin / Office / Employee) with per-user financial access, system accounts, company name & logo, work categories, JSON backup & restore, Trello import, full audit log |
| **UX** | Light / dark / system theme, live search everywhere, searchable pickers, responsive drawer navigation, transient "Saved ✓" feedback |

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS 4** with semantic color tokens
- **Prisma 7** (`prisma-client` generator, pg driver adapter) · **PostgreSQL 17**
- **next-intl** — cookie-based locale, `messages/de.json` / `messages/en.json`
- Custom session auth (bcrypt, SHA-256-hashed opaque tokens, httpOnly cookie) with server-side RBAC (`src/lib/authz.ts`)
- **Zod** validation, **exceljs**, **qrcode**, Open-Meteo weather
- **Vitest** unit tests (pure logic in `src/lib/*`) + DB-backed tests
- **Docker** multi-stage image, `docker-compose` for app + database

## Quick start (development)

```bash
# 1. Database
docker compose -f docker-compose.dev.yml up -d

# 2. Environment
cp .env.example .env            # set DATABASE_URL, SESSION_SECRET

# 3. Install, migrate, seed
npm install
npx prisma generate
npm run db:migrate
npm run db:seed

# 4. Run → http://localhost:15700
npm run dev
```

The base seed creates only system accounts, work categories and a small
tool/material catalog — **no company data**, and it never deletes anything.
Employees, vehicles, customers and projects are entered in the app (or
imported from Trello under *Einstellungen*).

| Username  | Password      | Role     | Purpose                              |
| --------- | ------------- | -------- | ------------------------------------ |
| `admin`   | `admin1234`   | Admin    | owner, sees everything               |
| `buero`   | `buero1234`   | Office   | office, no prices                    |
| `lager`   | `lager1234`   | Employee | shared account for the warehouse screen |

> ⚠️ Change these passwords before any real use (system accounts under
> *Einstellungen*, employee accounts on the employee page).

> The dev server uses port **15700** and the dev database is published on
> **15532** (`DATABASE_URL=…@localhost:15532/…`). On Windows, Hyper-V/WSL reserves
> blocks inside the dynamic port range (1024–15000 here, see
> `netsh interface ipv4 show dynamicport tcp` and
> `netsh interface ipv4 show excludedportrange protocol=tcp`), which randomly breaks
> ports like 3000, 5432 or 4700 after a reboot (`listen EACCES`). Ports **above 15000**
> are outside that range and stay usable.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | development server (port 15700) |
| `npm run build` / `npm start` | production build / start |
| `npm run typecheck` · `npm run lint` | TypeScript · ESLint |
| `npm test` | unit tests (no database) |
| `npm run test:db` | database-backed tests (needs the dev DB) |
| `npm run db:migrate` · `npm run db:deploy` | create/apply migrations (dev) · apply migrations (prod) |
| `npm run db:seed` | base seed |
| `npm run db:studio` | Prisma Studio |

## Project structure

```
src/
├─ app/
│  ├─ (admin)/        dashboard, projects, customers, schedule, employees,
│  │                  vehicles, warehouse, reports, settings   (Admin / Office)
│  ├─ my/             employee mobile area
│  ├─ today/          warehouse kiosk (daily preparation)
│  ├─ projects/[id]/sheet   printable work order
│  └─ login/, logo/
├─ components/        UI building blocks (combobox, live search, dialogs, …)
├─ lib/               pure logic: auth, authz, conflicts, dates, reports,
│                     weather, trello import, branding, pagination
├─ i18n/              next-intl config
└─ generated/prisma   generated client (git-ignored)
prisma/               schema, migrations, seed
messages/             de.json, en.json
tests/                unit + db tests
docs/                 user manuals (DE / FA), change logs
```

## Security model

- Session tokens are random, stored **hashed** in the database, sent as httpOnly cookies; a password change invalidates the user's other sessions.
- Authorization is enforced **server-side** in layouts, server actions and route handlers — never only by hiding UI.
- Financial data (contract value, revenue) is filtered out of queries/DTOs for users without `canViewFinancials`; employees never receive it.
- Every change is written to an audit log (who, what, when).
- Backups are plain JSON — store them encrypted; they contain personal data.

## Deployment

Fully dockerized, provider-agnostic — see [DEPLOYMENT.md](DEPLOYMENT.md)
(docker-compose with PostgreSQL, automatic migrations **and base-data bootstrap**
on first start, reverse-proxy example, backups). Fresh install:

```bash
git clone https://github.com/mostafasadeghidev/baucrew.git && cd baucrew
cp .env.example .env   # set POSTGRES_PASSWORD and SESSION_SECRET
docker compose up -d --build
```

**Vercel** also works (same code): connect the repo, set `DATABASE_URL` (hosted
PostgreSQL) and `SESSION_SECRET`, deploy — migrations and base data run during
the build. Details in [DEPLOYMENT.md](DEPLOYMENT.md#alternative-vercel-managed-hosting).

## Documentation

- [Benutzerhandbuch (DE)](docs/BENUTZERHANDBUCH.md)
- [Change logs](docs/) for reversible structural decisions
- Contributor rules for AI agents and humans: [AGENTS.md](AGENTS.md)

## License

Proprietary — internal software. All rights reserved.
